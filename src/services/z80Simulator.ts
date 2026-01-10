
import { Z80Flags, Z80Registers, VDPState } from "../types";
import { getMSXInfo } from "./msxContext";
import { getInstructionTiming } from "./timingService";

// Helper to parse numerical values
const parseValue = (valStr: string): number | null => {
  if (!valStr) return null;
  valStr = valStr.trim().toUpperCase();

  // Handle simple multiplication (e.g. "4 * 8")
  if (valStr.includes('*')) {
    const parts = valStr.split('*');
    if (parts.length === 2) {
      const v1 = parseValue(parts[0]);
      const v2 = parseValue(parts[1]);
      if (v1 !== null && v2 !== null) return v1 * v2;
    }
  }

  try {
    if (valStr.startsWith('#')) return parseInt(valStr.substring(1), 16);
    if (valStr.startsWith('$')) return parseInt(valStr.substring(1), 16);
    if (valStr.startsWith('&H')) return parseInt(valStr.substring(2), 16);
    if (valStr.endsWith('H')) return parseInt(valStr.substring(0, valStr.length - 1), 16);
    if (valStr.endsWith('B')) return parseInt(valStr.substring(0, valStr.length - 1), 2);
    if (valStr.startsWith('%')) return parseInt(valStr.substring(1), 2);
    if (!isNaN(parseInt(valStr))) return parseInt(valStr);
  } catch (e) { return null; }
  return null;
};

export interface SimulationState {
  registers: Z80Registers;
  flags: Z80Flags;
  memory: { [name: string]: number };
  vdp: VDPState;
  cycles?: number; // T-states consumed by this instruction (optional for compatibility)
  halted?: boolean; // CPU entered HALT state

  // Interrupt state tracking
  interruptState?: {
    enabled: boolean;  // EI/DI flag
    mode: 0 | 1 | 2;  // IM mode
  };

  // Advanced debugging: track memory access and register changes
  memoryAccesses?: {
    reads: number[];   // Addresses read during this instruction
    writes: number[];  // Addresses written during this instruction
  };
  registerChanges?: {
    register: string;
    oldValue: number;
    newValue: number;
  }[];
}

/**
 * Z80 JUMP CONDITION LIST
 * -----------------------
 * NZ : Non Zero      (Z = 0)
 * Z  : Zero          (Z = 1)
 * NC : No Carry      (C = 0)
 * C  : Carry         (C = 1)
 * PO : Parity Odd    (PV = 0)  [Also executes on No Overflow]
 * PE : Parity Even   (PV = 1)  [Also executes on Overflow]
 * P  : Plus/Positive (S = 0)
 * M  : Minus/Negative(S = 1)
 */
export const checkCondition = (condition: string, flags: Z80Flags): boolean => {
  const c = condition.trim().toUpperCase();
  switch (c) {
    case 'NZ': return !flags.z;
    case 'Z': return flags.z;
    case 'NC': return !flags.c;
    case 'C': return flags.c;
    case 'P': return !flags.s;     // Positive
    case 'M': return flags.s;      // Minus
    case 'PO': return !flags.pv;   // Parity Odd
    case 'PE': return flags.pv;    // Parity Even
    default: return true;          // Unconditional
  }
};

export const simulateLine = (
  lineCode: string,
  currentState: SimulationState,
  symbolTable: { [label: string]: number },
  memoryMap?: { [address: number]: number },
  trackAccesses: boolean = false // Enable tracking for watchpoints
): SimulationState => {
  const nextState = {
    registers: { ...currentState.registers },
    flags: { ...currentState.flags },
    memory: { ...currentState.memory },
    vdp: {
      vram: [...currentState.vdp.vram],
      addressRegister: currentState.vdp.addressRegister,
      writeLatch: currentState.vdp.writeLatch,
      registerLatch: currentState.vdp.registerLatch
    },
    cycles: 0, // Initialize cycles counter
    halted: currentState.halted || false, // Preserve HALT state
    interruptState: currentState.interruptState ? { ...currentState.interruptState } : undefined,
    // Initialize access tracking if enabled
    memoryAccesses: trackAccesses ? { reads: [], writes: [] } : undefined,
    registerChanges: trackAccesses ? [] : undefined
  };

  const clean = lineCode.split(';')[0].trim();
  if (!clean) return nextState;

  // Extract Opcode
  let instr = clean;
  if (instr.includes(':')) {
    const parts = instr.split(':');
    if (parts[1]) instr = parts[1].trim();
    else return nextState;
  }

  const match = instr.match(/^([A-Za-z]+)\s*(.*)$/);
  if (!match) return nextState;

  const opcode = match[1].toUpperCase();
  const operands = match[2];
  const args = operands.split(',').map(s => s.trim());
  const arg0 = args[0] ? args[0].toUpperCase() : '';
  const arg1 = args[1] ? args[1].toUpperCase() : '';

  const resolveValue = (valStr: string): number | null => {
    // 1. Try Direct Parse (Handles Hex, Dec, Bin, simple '*')
    const direct = parseValue(valStr);
    if (direct !== null) return direct;

    // --- MATH EXPRESSION HANDLING ---
    if (valStr.includes('+')) {
      const parts = valStr.split('+');
      let total = 0;
      let valid = true;
      for (const part of parts) {
        const val = resolveValue(part.trim());
        if (val === null) { valid = false; break; }
        total += val;
      }
      if (valid) return total & 0xFFFF;
    }

    const minusIdx = valStr.indexOf('-');
    if (minusIdx > 0) {
      const left = valStr.substring(0, minusIdx).trim();
      const right = valStr.substring(minusIdx + 1).trim();
      const v1 = resolveValue(left);
      const v2 = resolveValue(right);
      if (v1 !== null && v2 !== null) return (v1 - v2) & 0xFFFF;
    }

    const upper = valStr.toUpperCase();

    // 2. Try Symbol Table
    if (symbolTable && symbolTable[upper] !== undefined) {
      return symbolTable[upper];
    }

    // 3. Try MSX Knowledge Base
    const msxInfo = getMSXInfo(upper);
    if (msxInfo) return msxInfo.address;

    return null;
  };

  // Helper to find reverse label for address (for updating named variables in liveMemory)
  const findLabelForAddress = (addr: number): string | null => {
    // Prioritize exact match
    const entry = Object.entries(symbolTable).find(([_, val]) => val === addr);
    return entry ? entry[0] : null;
  };

  const readByte = (addr: number): number => {
    addr = addr & 0xFFFF;

    // Track read access if enabled
    if (nextState.memoryAccesses) {
      nextState.memoryAccesses.reads.push(addr);
    }

    // 1. Check if this address is in ROM (memoryMap) - this is the assembled code data
    if (memoryMap && memoryMap[addr] !== undefined) {
      return memoryMap[addr];
    }

    // 2. Check if we have a label for this address
    const label = findLabelForAddress(addr);
    if (label && nextState.memory[label] !== undefined) {
      return nextState.memory[label];
    }

    // 3. Check generic stack/RAM map
    const stackKey = `STACK:${addr}`;
    if (nextState.memory[stackKey] !== undefined) {
      return nextState.memory[stackKey];
    }

    // 4. Default return 0 for uninitialized memory
    return 0;
  };

  const writeByte = (addr: number, val: number) => {
    // Track write access if enabled
    if (nextState.memoryAccesses) {
      nextState.memoryAccesses.writes.push(addr);
    }

    const v = val & 0xFF;
    // 1. If we have a label for this address, update by name (so UI sees it)
    const label = findLabelForAddress(addr);
    if (label) {
      nextState.memory[label] = v;
    }
    // 2. Always store in generic stack/RAM map for persistence
    nextState.memory[`STACK:${addr}`] = v;
  };

  // Helpers for Flag Calculation
  const calculateParity = (val: number): boolean => {
    let v = val & 0xFF;
    v ^= v >> 4;
    v ^= v >> 2;
    v ^= v >> 1;
    return (~v & 1) === 1; // Even parity -> 1
  };

  const updateFlagsLogic = (val: number, isLogicOp: boolean) => {
    nextState.flags.z = (val & 0xFF) === 0;
    nextState.flags.s = (val & 0x80) !== 0; // Bit 7 set
    if (isLogicOp) {
      nextState.flags.pv = calculateParity(val);
    }
  };

  const setReg = (name: string, val: number) => {
    const v = val & 0xFF;
    switch (name) {
      case 'A': nextState.registers.a = v; break;
      case 'B': nextState.registers.b = v; break;
      case 'C': nextState.registers.c = v; break;
      case 'D': nextState.registers.d = v; break;
      case 'E': nextState.registers.e = v; break;
      case 'H': nextState.registers.h = v; break;
      case 'L': nextState.registers.l = v; break;
    }
  };

  const getReg = (name: string): number => {
    switch (name) {
      case 'A': return nextState.registers.a;
      case 'B': return nextState.registers.b;
      case 'C': return nextState.registers.c;
      case 'D': return nextState.registers.d;
      case 'E': return nextState.registers.e;
      case 'H': return nextState.registers.h;
      case 'L': return nextState.registers.l;
      default: return 0;
    }
  };

  const setPair = (pair: string, val: number) => {
    const high = (val >> 8) & 0xFF;
    const low = val & 0xFF;
    if (pair === 'HL') { nextState.registers.h = high; nextState.registers.l = low; }
    else if (pair === 'BC') { nextState.registers.b = high; nextState.registers.c = low; }
    else if (pair === 'DE') { nextState.registers.d = high; nextState.registers.e = low; }
    else if (pair === 'IX') { nextState.registers.ix = val & 0xFFFF; }
    else if (pair === 'IY') { nextState.registers.iy = val & 0xFFFF; }
    else if (pair === 'AF') {
      nextState.registers.a = high;
      nextState.flags.z = (low & 0x40) !== 0;
      nextState.flags.s = (low & 0x80) !== 0;
      nextState.flags.c = (low & 0x01) !== 0;
      nextState.flags.pv = (low & 0x04) !== 0;
    }
  };

  const getPair = (pair: string): number => {
    if (pair === 'HL') return (nextState.registers.h << 8) | nextState.registers.l;
    if (pair === 'BC') return (nextState.registers.b << 8) | nextState.registers.c;
    if (pair === 'DE') return (nextState.registers.d << 8) | nextState.registers.e;
    if (pair === 'IX') return nextState.registers.ix & 0xFFFF;
    if (pair === 'IY') return nextState.registers.iy & 0xFFFF;
    if (pair === 'AF') {
      let f = 0;
      if (nextState.flags.z) f |= 0x40;
      if (nextState.flags.s) f |= 0x80;
      if (nextState.flags.c) f |= 0x01;
      if (nextState.flags.pv) f |= 0x04;
      return (nextState.registers.a << 8) | f;
    }
    return 0;
  };

  // Helper for ALU operations to resolve Register or Value
  const getOperandValue = (opStr: string): number | null => {
    if (['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(opStr)) {
      return getReg(opStr);
    }
    // Handle (HL)
    if (opStr === '(HL)') {
      const addr = getPair('HL');
      return readByte(addr);
    }

    return resolveValue(opStr);
  };

  // --- INSTRUCTION LOGIC ---

  // 1. LD (Load)
  if (opcode === 'LD') {
    const isReg8 = ['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg0);
    const isReg16 = ['BC', 'DE', 'HL', 'SP', 'IX', 'IY'].includes(arg0);

    if (isReg8) {
      // Destination is an 8-bit Register
      if (['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg1)) {
        setReg(arg0, getReg(arg1));
      } else if (arg1.startsWith('(') && arg1.endsWith(')')) {
        // Indirect Loading: LD r, (nn) or LD r, (HL/BC/DE)
        const content = arg1.slice(1, -1).trim();

        // Check Register Pairs first
        if (content === 'HL') {
          const addr = getPair('HL');
          setReg(arg0, readByte(addr));
        } else if (content === 'BC' && arg0 === 'A') {
          // LD A, (BC)
          const addr = getPair('BC');
          setReg(arg0, readByte(addr));
        } else if (content === 'DE' && arg0 === 'A') {
          // LD A, (DE)
          const addr = getPair('DE');
          setReg(arg0, readByte(addr));
        } else if (content.startsWith('IX') || content.startsWith('IY')) {
          // Index register with displacement: (IX+d) or (IY+d)
          const reg = content.substring(0, 2); // 'IX' or 'IY'
          let displacement = 0;

          // Check for displacement
          if (content.length > 2) {
            const dispPart = content.substring(2); // '+d' or '-d'
            if (dispPart.startsWith('+')) {
              const offset = resolveValue(dispPart.substring(1));
              if (offset !== null) displacement = offset;
            } else if (dispPart.startsWith('-')) {
              const offset = resolveValue(dispPart.substring(1));
              if (offset !== null) displacement = -offset;
            }
          }

          const baseAddr = getPair(reg);
          const effectiveAddr = (baseAddr + displacement) & 0xFFFF;
          setReg(arg0, readByte(effectiveAddr));
        } else {
          // Absolute Address: LD A, (nn)
          const addr = resolveValue(content);
          if (addr !== null) {
            setReg(arg0, readByte(addr));
          } else if (nextState.memory[content.toUpperCase()] !== undefined) {
            setReg(arg0, nextState.memory[content.toUpperCase()]);
          } else {
            setReg(arg0, 0);
          }
        }
      } else {
        // Immediate: LD r, n
        const val = resolveValue(arg1);
        if (val !== null) setReg(arg0, val);
      }
    }
    else if (isReg16) {
      if (arg0 === 'SP' && arg1 === 'HL') {
        nextState.registers.sp = getPair('HL');
      }
      else if (arg1.startsWith('(') && arg1.endsWith(')')) {
        const content = arg1.slice(1, -1).trim();
        const addr = resolveValue(content);
        if (addr !== null) {
          const low = readByte(addr);
          const high = readByte(addr + 1);
          const val = (high << 8) | low;

          if (arg0 === 'SP') nextState.registers.sp = val;
          else setPair(arg0, val);
        }
      }
      else {
        const val = resolveValue(arg1);
        if (val !== null) {
          if (arg0 === 'SP') nextState.registers.sp = val & 0xFFFF;
          else setPair(arg0, val);
        }
      }
    }
    else if (arg0.startsWith('(') && arg0.endsWith(')')) {
      // Store to Memory: LD (nn), r  OR LD (HL), r
      const targetRaw = arg0.slice(1, -1).trim();

      // Check if destination is (HL), (BC), (DE)
      if (targetRaw === 'HL') {
        const addr = getPair('HL');
        const val = ['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg1) ? getReg(arg1) : resolveValue(arg1);
        if (val !== null) writeByte(addr, val);
      }
      else if (targetRaw === 'BC' && arg1 === 'A') {
        writeByte(getPair('BC'), getReg('A'));
      }
      else if (targetRaw === 'DE' && arg1 === 'A') {
        writeByte(getPair('DE'), getReg('A'));
      }
      else {
        // Absolute address: LD (nn), r
        let addr = resolveValue(targetRaw);

        if (addr !== null) {
          if (['BC', 'DE', 'HL', 'SP', 'IX', 'IY'].includes(arg1)) {
            const val = (arg1 === 'SP') ? nextState.registers.sp : getPair(arg1);
            writeByte(addr, val & 0xFF);
            writeByte(addr + 1, (val >> 8) & 0xFF);
          }
          else {
            let valToWrite: number | null = null;
            if (['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg1)) valToWrite = getReg(arg1);
            else valToWrite = resolveValue(arg1);

            if (valToWrite !== null) {
              writeByte(addr, valToWrite & 0xFF);
            }
          }
        }
        else if (nextState.memory[targetRaw.toUpperCase()] !== undefined) {
          // Fallback for named variables that weren't resolved to addresses
          let valToWrite: number | null = null;
          if (['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg1)) valToWrite = getReg(arg1);
          else valToWrite = resolveValue(arg1);
          if (valToWrite !== null) nextState.memory[targetRaw.toUpperCase()] = valToWrite & 0xFF;
        }
      }
    }
    // Special cases for I and R registers
    else if (arg0 === 'I' && arg1 === 'A') {
      // LD I, A
      nextState.registers.i = nextState.registers.a;
    }
    else if (arg0 === 'A' && arg1 === 'I') {
      // LD A, I
      nextState.registers.a = nextState.registers.i;
      nextState.flags.s = (nextState.registers.i & 0x80) !== 0;
      nextState.flags.z = nextState.registers.i === 0;
      nextState.flags.pv = false; // IFF2 value
    }
    else if (arg0 === 'R' && arg1 === 'A') {
      // LD R, A
      nextState.registers.r = nextState.registers.a & 0x7F; // R register is 7-bit
    }
    else if (arg0 === 'A' && arg1 === 'R') {
      // LD A, R
      nextState.registers.a = nextState.registers.r & 0x7F;
      nextState.flags.s = (nextState.registers.r & 0x40) !== 0;
      nextState.flags.z = (nextState.registers.r & 0x7F) === 0;
      nextState.flags.pv = false; // IFF2 value
    }
  }

  // 2. EX DE, HL (Bidirectional)
  else if (opcode === 'EX') {
    // Clean operands to handle potential spacing like "DE , HL"
    const op1 = arg0;
    const op2 = arg1;

    if ((op1 === 'DE' && op2 === 'HL') || (op1 === 'HL' && op2 === 'DE')) {
      const de = getPair('DE');
      const hl = getPair('HL');
      setPair('DE', hl);
      setPair('HL', de);
    }
    else if (op1 === 'AF' && op2 === "AF'") {
      // EX AF, AF' - Swap AF with AF'
      const af = getPair('AF');
      const af_prime = (nextState.registers.a_prime << 8) | nextState.registers.f_prime;

      setPair('AF', af_prime);
      nextState.registers.a_prime = (af >> 8) & 0xFF;
      nextState.registers.f_prime = af & 0xFF;
    }
    else if (op1 === '(SP)' && (op2 === 'HL' || op2 === 'IX' || op2 === 'IY')) {
      // EX (SP), HL/IX/IY
      const sp = nextState.registers.sp;
      const low = readByte(sp);
      const high = readByte(sp + 1);
      const memVal = (high << 8) | low;

      const regVal = getPair(op2);

      // Swap
      writeByte(sp, regVal & 0xFF);
      writeByte(sp + 1, (regVal >> 8) & 0xFF);

      setPair(op2, memVal);
    }
  }

  // EXX - Exchange BC, DE, HL with BC', DE', HL'
  else if (opcode === 'EXX') {
    // Swap BC with BC'
    const bc = getPair('BC');
    const bc_prime = (nextState.registers.b_prime << 8) | nextState.registers.c_prime;
    setPair('BC', bc_prime);
    nextState.registers.b_prime = (bc >> 8) & 0xFF;
    nextState.registers.c_prime = bc & 0xFF;

    // Swap DE with DE'
    const de = getPair('DE');
    const de_prime = (nextState.registers.d_prime << 8) | nextState.registers.e_prime;
    setPair('DE', de_prime);
    nextState.registers.d_prime = (de >> 8) & 0xFF;
    nextState.registers.e_prime = de & 0xFF;

    // Swap HL with HL'
    const hl = getPair('HL');
    const hl_prime = (nextState.registers.h_prime << 8) | nextState.registers.l_prime;
    setPair('HL', hl_prime);
    nextState.registers.h_prime = (hl >> 8) & 0xFF;
    nextState.registers.l_prime = hl & 0xFF;
  }

  // 3. PUSH / POP
  else if (opcode === 'PUSH') {
    const val = getPair(arg0);
    nextState.registers.sp = (nextState.registers.sp - 2) & 0xFFFF;
    const sp = nextState.registers.sp;
    nextState.memory[`STACK:${sp}`] = (val & 0xFF);
    nextState.memory[`STACK:${sp + 1}`] = ((val >> 8) & 0xFF);
  }
  else if (opcode === 'POP') {
    const sp = nextState.registers.sp;
    const low = nextState.memory[`STACK:${sp}`] || 0;
    const high = nextState.memory[`STACK:${sp + 1}`] || 0;
    const val = (high << 8) | low;

    setPair(arg0, val);
    nextState.registers.sp = (nextState.registers.sp + 2) & 0xFFFF;
  }

  // 4. CP (Compare A)
  else if (opcode === 'CP') {
    const val = getOperandValue(arg0);
    if (val !== null) {
      const result = nextState.registers.a - val;
      nextState.flags.z = (result === 0);
      nextState.flags.c = (nextState.registers.a < val);
      nextState.flags.s = (result & 0x80) !== 0;
      // Calculate Overflow: (A xor val) & (A xor result) & 0x80
      const a = nextState.registers.a;
      const overflow = ((a ^ val) & (a ^ result) & 0x80) !== 0;
      nextState.flags.pv = overflow;
    }
  }

  // 5. INC / DEC
  else if (opcode === 'INC' || opcode === 'DEC') {
    const diff = opcode === 'INC' ? 1 : -1;

    if (['BC', 'DE', 'HL', 'SP', 'IX', 'IY'].includes(arg0)) {
      if (arg0 === 'SP') nextState.registers.sp = (nextState.registers.sp + diff) & 0xFFFF;
      else if (arg0 === 'IX') nextState.registers.ix = (nextState.registers.ix + diff) & 0xFFFF;
      else if (arg0 === 'IY') nextState.registers.iy = (nextState.registers.iy + diff) & 0xFFFF;
      else {
        const current = getPair(arg0);
        setPair(arg0, (current + diff) & 0xFFFF);
      }
    }
    else if (['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg0)) {
      const current = getReg(arg0);
      const newVal = (current + diff) & 0xFF;
      setReg(arg0, newVal);
      updateFlagsLogic(newVal, false);
      // PV for INC/DEC 8bit is Overflow
      nextState.flags.pv = (current === (opcode === 'INC' ? 0x7F : 0x80));
    }
    else if (arg0.startsWith('(') && arg0.endsWith(')')) {
      if (arg0 === '(HL)') {
        const addr = getPair('HL');
        const current = readByte(addr);
        const newVal = (current + diff) & 0xFF;
        writeByte(addr, newVal);
        updateFlagsLogic(newVal, false);
        nextState.flags.pv = (current === (opcode === 'INC' ? 0x7F : 0x80));
      }
    }
  }

  // 6. LOGIC OPS (XOR, OR, AND)
  else if (opcode === 'XOR') {
    const val = getOperandValue(arg0);
    if (val !== null) {
      nextState.registers.a = nextState.registers.a ^ val;
      updateFlagsLogic(nextState.registers.a, true);
      nextState.flags.c = false;
    }
  }
  else if (opcode === 'OR') {
    const val = getOperandValue(arg0);
    if (val !== null) {
      nextState.registers.a = nextState.registers.a | val;
      updateFlagsLogic(nextState.registers.a, true);
      nextState.flags.c = false;
    }
  }
  else if (opcode === 'AND') {
    const val = getOperandValue(arg0);
    if (val !== null) {
      nextState.registers.a = nextState.registers.a & val;
      updateFlagsLogic(nextState.registers.a, true);
      nextState.flags.c = false;
    }
  }

  // 7. MATH (ADD, SUB)
  else if (opcode === 'ADD') {
    if (arg0 === 'A') {
      const val = getOperandValue(arg1);
      if (val !== null) {
        const current = nextState.registers.a;
        const res = current + val;
        nextState.registers.a = res & 0xFF;
        nextState.flags.c = res > 255;
        updateFlagsLogic(nextState.registers.a, false);
        // Overflow calculation for Add
        const overflow = ((current ^ res) & (val ^ res) & 0x80) !== 0;
        nextState.flags.pv = overflow;
      }
    } else if (['HL', 'IX', 'IY'].includes(arg0)) {
      const current = getPair(arg0);
      let val = 0;
      if (['BC', 'DE', 'HL', 'SP'].includes(arg1)) val = getPair(arg1);
      else val = resolveValue(arg1) || 0;

      const res = current + val;
      setPair(arg0, res & 0xFFFF);
      nextState.flags.c = res > 65535;
    }
  }
  else if (opcode === 'SUB') {
    const val = getOperandValue(arg0);
    if (val !== null) {
      const current = nextState.registers.a;
      const res = current - val;
      nextState.registers.a = res & 0xFF;
      nextState.flags.c = current < val;
      updateFlagsLogic(nextState.registers.a, false);
      // Overflow calculation for Sub
      const overflow = ((current ^ val) & (current ^ res) & 0x80) !== 0;
      nextState.flags.pv = overflow;
    }
  }
  else if (opcode === 'ADC') {
    // Add with Carry
    if (arg0 === 'A') {
      const val = getOperandValue(arg1);
      if (val !== null) {
        const current = nextState.registers.a;
        const carry = nextState.flags.c ? 1 : 0;
        const res = current + val + carry;
        nextState.registers.a = res & 0xFF;
        nextState.flags.c = res > 255;
        updateFlagsLogic(nextState.registers.a, false);
        // Overflow calculation for ADC
        const overflow = ((current ^ res) & (val ^ res) & 0x80) !== 0;
        nextState.flags.pv = overflow;
      }
    } else if (['HL', 'IX', 'IY'].includes(arg0)) {
      // ADC HL/IX/IY, rr
      const current = getPair(arg0);
      let val = 0;
      if (['BC', 'DE', 'HL', 'SP'].includes(arg1)) val = getPair(arg1);
      else val = resolveValue(arg1) || 0;

      const carry = nextState.flags.c ? 1 : 0;
      const res = current + val + carry;
      setPair(arg0, res & 0xFFFF);
      nextState.flags.c = res > 65535;
      nextState.flags.z = (res & 0xFFFF) === 0;
      nextState.flags.s = (res & 0x8000) !== 0;
      // Overflow for 16-bit
      const overflow = ((current ^ res) & (val ^ res) & 0x8000) !== 0;
      nextState.flags.pv = overflow;
    }
  }
  else if (opcode === 'SBC') {
    // Subtract with Carry
    if (arg0 === 'A') {
      const val = getOperandValue(arg1);
      if (val !== null) {
        const current = nextState.registers.a;
        const carry = nextState.flags.c ? 1 : 0;
        const res = current - val - carry;
        nextState.registers.a = res & 0xFF;
        nextState.flags.c = (current < val + carry);
        updateFlagsLogic(nextState.registers.a, false);
        // Overflow calculation for SBC
        const overflow = ((current ^ val) & (current ^ res) & 0x80) !== 0;
        nextState.flags.pv = overflow;
      }
    } else if (['HL', 'IX', 'IY'].includes(arg0)) {
      // SBC HL/IX/IY, rr
      const current = getPair(arg0);
      let val = 0;
      if (['BC', 'DE', 'HL', 'SP'].includes(arg1)) val = getPair(arg1);
      else val = resolveValue(arg1) || 0;

      const carry = nextState.flags.c ? 1 : 0;
      const res = current - val - carry;
      setPair(arg0, res & 0xFFFF);
      nextState.flags.c = (current < val + carry);
      nextState.flags.z = (res & 0xFFFF) === 0;
      nextState.flags.s = (res & 0x8000) !== 0;
      // Overflow for 16-bit
      const overflow = ((current ^ val) & (current ^ res) & 0x8000) !== 0;
      nextState.flags.pv = overflow;
    }
  }

  // 8. BIT INSTRUCTIONS (Critical for JP Z / JP NZ)
  else if (opcode === 'BIT') {
    const bit = parseInt(arg0);
    let val = 0;
    if (['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg1)) val = getReg(arg1);
    else if (arg1 === '(HL)') val = readByte(getPair('HL'));

    const res = val & (1 << bit);
    nextState.flags.z = (res === 0);
    nextState.flags.s = (bit === 7 && res !== 0);
    // H flag should be 1, N should be 0. PV is unknown for BIT in some docs but usually Z matches.
  }
  else if (opcode === 'SET') {
    const bit = parseInt(arg0);
    if (['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg1)) {
      const val = getReg(arg1);
      setReg(arg1, val | (1 << bit));
    } else if (arg1 === '(HL)') {
      const addr = getPair('HL');
      const val = readByte(addr);
      writeByte(addr, val | (1 << bit));
    }
  }
  else if (opcode === 'RES') {
    const bit = parseInt(arg0);
    if (['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg1)) {
      const val = getReg(arg1);
      setReg(arg1, val & ~(1 << bit));
    } else if (arg1 === '(HL)') {
      const addr = getPair('HL');
      const val = readByte(addr);
      writeByte(addr, val & ~(1 << bit));
    }
  }

  // 9. ROTATES (Critical for JP C / JP NC)
  else if (['RLCA', 'RRCA', 'RLA', 'RRA'].includes(opcode)) {
    let a = nextState.registers.a;
    let c = nextState.flags.c ? 1 : 0;

    if (opcode === 'RLCA') { // Rotate Left Circular Acc
      const bit7 = (a >> 7) & 1;
      a = ((a << 1) | bit7) & 0xFF;
      nextState.flags.c = bit7 === 1;
    }
    else if (opcode === 'RRCA') { // Rotate Right Circular Acc
      const bit0 = a & 1;
      a = ((a >> 1) | (bit0 << 7)) & 0xFF;
      nextState.flags.c = bit0 === 1;
    }
    else if (opcode === 'RLA') { // Rotate Left Acc through Carry
      const bit7 = (a >> 7) & 1;
      a = ((a << 1) | c) & 0xFF;
      nextState.flags.c = bit7 === 1;
    }
    else if (opcode === 'RRA') { // Rotate Right Acc through Carry
      const bit0 = a & 1;
      a = ((a >> 1) | (c << 7)) & 0xFF;
      nextState.flags.c = bit0 === 1;
    }

    nextState.registers.a = a;
    // Flags N and H are reset
  }

  // 9b. EXTENDED ROTATES AND SHIFTS (for all registers)
  else if (['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SRL'].includes(opcode)) {
    // These work on any 8-bit register or (HL)
    let val = 0;
    const isMemory = arg0 === '(HL)';

    if (isMemory) {
      const addr = getPair('HL');
      val = readByte(addr);
    } else if (['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg0)) {
      val = getReg(arg0);
    } else {
      return nextState; // Invalid operand
    }

    let c = nextState.flags.c ? 1 : 0;
    let newCarry = 0;

    if (opcode === 'RLC') {
      // Rotate Left Circular
      newCarry = (val >> 7) & 1;
      val = ((val << 1) | newCarry) & 0xFF;
    } else if (opcode === 'RRC') {
      // Rotate Right Circular
      newCarry = val & 1;
      val = ((val >> 1) | (newCarry << 7)) & 0xFF;
    } else if (opcode === 'RL') {
      // Rotate Left through Carry
      newCarry = (val >> 7) & 1;
      val = ((val << 1) | c) & 0xFF;
    } else if (opcode === 'RR') {
      // Rotate Right through Carry
      newCarry = val & 1;
      val = ((val >> 1) | (c << 7)) & 0xFF;
    } else if (opcode === 'SLA') {
      // Shift Left Arithmetic (shift in 0)
      newCarry = (val >> 7) & 1;
      val = (val << 1) & 0xFF;
    } else if (opcode === 'SRA') {
      // Shift Right Arithmetic (preserve sign bit)
      newCarry = val & 1;
      const sign = val & 0x80;
      val = ((val >> 1) | sign) & 0xFF;
    } else if (opcode === 'SRL') {
      // Shift Right Logical (shift in 0)
      newCarry = val & 1;
      val = (val >> 1) & 0xFF;
    }

    // Update flags
    nextState.flags.c = newCarry === 1;
    updateFlagsLogic(val, true); // S, Z, PV (parity)

    // Write back result
    if (isMemory) {
      const addr = getPair('HL');
      writeByte(addr, val);
    } else {
      setReg(arg0, val);
    }
  }

  // RLD and RRD (BCD nibble rotates)
  else if (opcode === 'RLD' || opcode === 'RRD') {
    // RLD: Rotate Left Digit (nibbles of A and (HL))
    // RRD: Rotate Right Digit
    const addr = getPair('HL');
    const memVal = readByte(addr);
    let a = nextState.registers.a;

    if (opcode === 'RLD') {
      // A[3:0] <- (HL)[7:4] <- (HL)[3:0] <- A[3:0]
      const aLow = a & 0x0F;
      const memHigh = (memVal >> 4) & 0x0F;
      const memLow = memVal & 0x0F;

      a = (a & 0xF0) | memHigh;
      const newMem = ((memLow << 4) | aLow) & 0xFF;

      writeByte(addr, newMem);
      nextState.registers.a = a;
    } else { // RRD
      // A[3:0] <- (HL)[3:0] <- (HL)[7:4] <- A[3:0]
      const aLow = a & 0x0F;
      const memHigh = (memVal >> 4) & 0x0F;
      const memLow = memVal & 0x0F;

      a = (a & 0xF0) | memLow;
      const newMem = ((aLow << 4) | memHigh) & 0xFF;

      writeByte(addr, newMem);
      nextState.registers.a = a;
    }

    // Update flags (S, Z, P affected; C unchanged)
    updateFlagsLogic(nextState.registers.a, true);
  }

  // 10. FLAGS
  else if (opcode === 'SCF') {
    nextState.flags.c = true;
  }
  else if (opcode === 'CCF') {
    nextState.flags.c = !nextState.flags.c;
  }

  // 11. CONTROL FLOW INSTRUCTIONS

  // NOP - No Operation
  else if (opcode === 'NOP') {
    // Does nothing, just advance to next instruction
  }

  // HALT - Stop execution until interrupt
  else if (opcode === 'HALT') {
    // HALT stops CPU execution but continues consuming cycles
    // Handled in App.tsx: 4 T-states per cycle until interrupt
    nextState.halted = true;
  }

  // INTERRUPT CONTROL
  else if (opcode === 'DI') {
    // Disable Interrupts
    if (!nextState.interruptState) {
      nextState.interruptState = { enabled: false, mode: 1 };
    } else {
      nextState.interruptState.enabled = false;
    }
  }

  else if (opcode === 'EI') {
    // Enable Interrupts
    if (!nextState.interruptState) {
      nextState.interruptState = { enabled: true, mode: 1 };
    } else {
      nextState.interruptState.enabled = true;
    }
  }

  else if (opcode === 'IM') {
    // Set Interrupt Mode (0, 1, or 2)
    // IM 0, IM 1, IM 2
    const mode = parseInt(arg0) as (0 | 1 | 2);
    if (!isNaN(mode) && (mode === 0 || mode === 1 || mode === 2)) {
      if (!nextState.interruptState) {
        nextState.interruptState = { enabled: false, mode };
      } else {
        nextState.interruptState.mode = mode;
      }
    }
  }

  // EXTENDED I/O OPERATIONS
  else if (opcode === 'IN') {
    // IN A, (n) or IN r, (C)
    if (arg0 === 'A' && arg1.startsWith('(') && arg1.endsWith(')')) {
      // IN A, (n)
      const portStr = arg1.slice(1, -1).trim();
      const port = resolveValue(portStr);

      if (port !== null) {
        // For MSX simulation, we could read VDP status, keyboard, etc.
        // For now, return 0xFF (all bits high - common for unconnected ports)
        if (port === 0x99 || portStr === '$99' || portStr === '99H') {
          // VDP status register - simplified
          nextState.registers.a = 0x00; // No interrupts, no collision
        } else {
          nextState.registers.a = 0xFF; // Default for unknown ports
        }
      }
    } else if (arg1 === '(C)') {
      // IN r, (C) - port number in C register
      const port = nextState.registers.c;
      let val = 0xFF; // Default - could be extended for specific ports

      if (['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg0)) {
        setReg(arg0, val);
      }

      // Update flags for IN r,(C)
      nextState.flags.z = val === 0;
      nextState.flags.s = (val & 0x80) !== 0;
      nextState.flags.pv = calculateParity(val);
    }
  }

  // Block I/O operations
  else if (opcode === 'INIR') {
    // Input, Increment, Repeat
    let addr = getPair('HL');
    let b = nextState.registers.b;
    const port = nextState.registers.c;

    while (b > 0) {
      const val = 0xFF; // Simulated input
      writeByte(addr, val);
      addr = (addr + 1) & 0xFFFF;
      b = (b - 1) & 0xFF;
    }

    setPair('HL', addr);
    nextState.registers.b = 0;
    nextState.flags.z = true;
  }

  else if (opcode === 'OTIR') {
    // Output, Increment, Repeat
    let addr = getPair('HL');
    let b = nextState.registers.b;
    const port = nextState.registers.c;

    while (b > 0) {
      const val = readByte(addr);
      // Output val to port (C)
      // In simulation, we could handle VDP writes, PSG, etc.
      addr = (addr + 1) & 0xFFFF;
      b = (b - 1) & 0xFF;
    }

    setPair('HL', addr);
    nextState.registers.b = 0;
    nextState.flags.z = true;
  }

  else if (opcode === 'INI') {
    // Input and Increment
    const addr = getPair('HL');
    const val = 0xFF; // Simulated input from port (C)
    writeByte(addr, val);

    setPair('HL', (addr + 1) & 0xFFFF);
    nextState.registers.b = (nextState.registers.b - 1) & 0xFF;
    nextState.flags.z = nextState.registers.b === 0;
  }

  else if (opcode === 'OUTI') {
    // Output and Increment
    const addr = getPair('HL');
    const val = readByte(addr);
    // Output to port (C)

    setPair('HL', (addr + 1) & 0xFFFF);
    nextState.registers.b = (nextState.registers.b - 1) & 0xFF;
    nextState.flags.z = nextState.registers.b === 0;
  }

  else if (opcode === 'IND') {
    // Input and Decrement
    const addr = getPair('HL');
    const val = 0xFF; // Simulated input from port (C)
    writeByte(addr, val);

    setPair('HL', (addr - 1) & 0xFFFF);
    nextState.registers.b = (nextState.registers.b - 1) & 0xFF;
    nextState.flags.z = nextState.registers.b === 0;
  }

  else if (opcode === 'OUTD') {
    // Output and Decrement
    const addr = getPair('HL');
    const val = readByte(addr);
    // Output to port (C)

    setPair('HL', (addr - 1) & 0xFFFF);
    nextState.registers.b = (nextState.registers.b - 1) & 0xFF;
    nextState.flags.z = nextState.registers.b === 0;
  }

  else if (opcode === 'INDR') {
    // Input, Decrement, Repeat
    let addr = getPair('HL');
    let b = nextState.registers.b;

    while (b > 0) {
      const val = 0xFF; // Simulated input
      writeByte(addr, val);
      addr = (addr - 1) & 0xFFFF;
      b = (b - 1) & 0xFF;
    }

    setPair('HL', addr);
    nextState.registers.b = 0;
    nextState.flags.z = true;
  }

  else if (opcode === 'OTDR') {
    // Output, Decrement, Repeat
    let addr = getPair('HL');
    let b = nextState.registers.b;

    while (b > 0) {
      const val = readByte(addr);
      // Output to port (C)
      addr = (addr - 1) & 0xFFFF;
      b = (b - 1) & 0xFF;
    }

    setPair('HL', addr);
    nextState.registers.b = 0;
    nextState.flags.z = true;
  }

  // JP - Jump Absolute
  else if (opcode === 'JP') {
    // JP can be: JP nn, JP cc,nn, or JP (HL/IX/IY)
    if (arg0.startsWith('(') && arg0.endsWith(')')) {
      // Indirect jump: JP (HL), JP (IX), JP (IY)
      const reg = arg0.slice(1, -1).trim();
      if (['HL', 'IX', 'IY'].includes(reg)) {
        const addr = getPair(reg);
        // Store jump target in a special property so executeSubroutine can handle it
        (nextState as any).__jumpTarget = addr;
      }
    } else if (arg1) {
      // Conditional jump: JP cc, nn
      const condition = arg0;
      const target = resolveValue(arg1);
      if (target !== null && checkCondition(condition, nextState.flags)) {
        (nextState as any).__jumpTarget = target;
      }
    } else {
      // Unconditional jump: JP nn
      const target = resolveValue(arg0);
      if (target !== null) {
        (nextState as any).__jumpTarget = target;
      }
    }
  }

  // JR - Jump Relative
  else if (opcode === 'JR') {
    // JR can be: JR e, or JR cc, e
    if (arg1) {
      // Conditional relative jump: JR cc, e
      const condition = arg0;
      const offset = resolveValue(arg1);
      if (offset !== null && checkCondition(condition, nextState.flags)) {
        // Relative offset is signed 8-bit
        const signedOffset = offset > 127 ? offset - 256 : offset;
        (nextState as any).__relativeJump = signedOffset;
      }
    } else {
      // Unconditional relative jump: JR e
      const offset = resolveValue(arg0);
      if (offset !== null) {
        // Relative offset is signed 8-bit
        const signedOffset = offset > 127 ? offset - 256 : offset;
        (nextState as any).__relativeJump = signedOffset;
      }
    }
  }

  // DJNZ - Decrement B and Jump if Not Zero
  else if (opcode === 'DJNZ') {
    const b = (nextState.registers.b - 1) & 0xFF;
    nextState.registers.b = b;

    // If B is not zero after decrement, perform relative jump
    if (b !== 0) {
      const offset = resolveValue(arg0);
      if (offset !== null) {
        // Relative offset is signed 8-bit
        const signedOffset = offset > 127 ? offset - 256 : offset;
        (nextState as any).__relativeJump = signedOffset;
      }
    }
  }

  // 11b. BLOCK OPERATIONS (Critical for MSX)

  // LDI - Load and Increment
  else if (opcode === 'LDI') {
    const src = getPair('HL');
    const dst = getPair('DE');
    const val = readByte(src);
    writeByte(dst, val);

    setPair('HL', (src + 1) & 0xFFFF);
    setPair('DE', (dst + 1) & 0xFFFF);
    const bc = (getPair('BC') - 1) & 0xFFFF;
    setPair('BC', bc);

    nextState.flags.pv = bc !== 0; // PV set if BC != 0
  }

  // LDIR - Load, Increment, Repeat
  else if (opcode === 'LDIR') {
    let src = getPair('HL');
    let dst = getPair('DE');
    let bc = getPair('BC');

    // Copy BC bytes from (HL) to (DE)
    for (let i = 0; i < bc; i++) {
      const val = readByte(src + i);
      writeByte(dst + i, val);
    }

    setPair('HL', (src + bc) & 0xFFFF);
    setPair('DE', (dst + bc) & 0xFFFF);
    setPair('BC', 0);
    nextState.flags.pv = false; // BC is always 0 after LDIR
  }

  // LDD - Load and Decrement
  else if (opcode === 'LDD') {
    const src = getPair('HL');
    const dst = getPair('DE');
    const val = readByte(src);
    writeByte(dst, val);

    setPair('HL', (src - 1) & 0xFFFF);
    setPair('DE', (dst - 1) & 0xFFFF);
    const bc = (getPair('BC') - 1) & 0xFFFF;
    setPair('BC', bc);

    nextState.flags.pv = bc !== 0;
  }

  // LDDR - Load, Decrement, Repeat
  else if (opcode === 'LDDR') {
    let src = getPair('HL');
    let dst = getPair('DE');
    let bc = getPair('BC');

    // Copy BC bytes from (HL) to (DE), decrementing
    for (let i = 0; i < bc; i++) {
      const val = readByte(src - i);
      writeByte(dst - i, val);
    }

    setPair('HL', (src - bc) & 0xFFFF);
    setPair('DE', (dst - bc) & 0xFFFF);
    setPair('BC', 0);
    nextState.flags.pv = false;
  }

  // CPI - Compare and Increment
  else if (opcode === 'CPI') {
    const addr = getPair('HL');
    const val = readByte(addr);
    const a = nextState.registers.a;
    const result = a - val;

    nextState.flags.z = (result & 0xFF) === 0;
    nextState.flags.s = (result & 0x80) !== 0;

    setPair('HL', (addr + 1) & 0xFFFF);
    const bc = (getPair('BC') - 1) & 0xFFFF;
    setPair('BC', bc);
    nextState.flags.pv = bc !== 0;
  }

  // CPIR - Compare, Increment, Repeat
  else if (opcode === 'CPIR') {
    let addr = getPair('HL');
    let bc = getPair('BC');
    const a = nextState.registers.a;
    let found = false;

    while (bc > 0) {
      const val = readByte(addr);
      const result = a - val;

      if ((result & 0xFF) === 0) {
        found = true;
        nextState.flags.z = true;
        break;
      }

      addr = (addr + 1) & 0xFFFF;
      bc = (bc - 1) & 0xFFFF;
    }

    if (!found) {
      nextState.flags.z = false;
    }

    setPair('HL', addr);
    setPair('BC', bc);
    nextState.flags.pv = bc !== 0;
  }

  // CPD - Compare and Decrement
  else if (opcode === 'CPD') {
    const addr = getPair('HL');
    const val = readByte(addr);
    const a = nextState.registers.a;
    const result = a - val;

    nextState.flags.z = (result & 0xFF) === 0;
    nextState.flags.s = (result & 0x80) !== 0;

    setPair('HL', (addr - 1) & 0xFFFF);
    const bc = (getPair('BC') - 1) & 0xFFFF;
    setPair('BC', bc);
    nextState.flags.pv = bc !== 0;
  }

  // CPDR - Compare, Decrement, Repeat
  else if (opcode === 'CPDR') {
    let addr = getPair('HL');
    let bc = getPair('BC');
    const a = nextState.registers.a;
    let found = false;

    while (bc > 0) {
      const val = readByte(addr);
      const result = a - val;

      if ((result & 0xFF) === 0) {
        found = true;
        nextState.flags.z = true;
        break;
      }

      addr = (addr - 1) & 0xFFFF;
      bc = (bc - 1) & 0xFFFF;
    }

    if (!found) {
      nextState.flags.z = false;
    }

    setPair('HL', addr);
    setPair('BC', bc);
    nextState.flags.pv = bc !== 0;
  }

  // 11c. OTHER ESSENTIAL INSTRUCTIONS

  // NEG - Negate accumulator (2's complement)
  else if (opcode === 'NEG') {
    const a = nextState.registers.a;
    const result = (0 - a) & 0xFF;
    nextState.registers.a = result;

    nextState.flags.c = a !== 0;
    nextState.flags.z = result === 0;
    nextState.flags.s = (result & 0x80) !== 0;
    nextState.flags.pv = a === 0x80; // Overflow only when negating -128
  }

  // CPL - Complement accumulator (1's complement)
  else if (opcode === 'CPL') {
    nextState.registers.a = (~nextState.registers.a) & 0xFF;
    // Flags: S, Z, P/V, C unchanged
  }

  // DAA - Decimal Adjust Accumulator (for BCD)
  else if (opcode === 'DAA') {
    let a = nextState.registers.a;
    let correction = 0;

    // Lower nibble correction
    if ((a & 0x0F) > 9) {
      correction += 0x06;
    }

    // Upper nibble correction
    if ((a & 0xF0) > 0x90 || nextState.flags.c) {
      correction += 0x60;
      nextState.flags.c = true;
    }

    a = (a + correction) & 0xFF;
    nextState.registers.a = a;

    nextState.flags.z = a === 0;
    nextState.flags.s = (a & 0x80) !== 0;
    nextState.flags.pv = calculateParity(a);
  }

  // 12. BIOS CALLS & RST & RET (Stack Ops)
  else if (opcode === 'CALL' || opcode === 'RST') {
    let perform = true;
    if (opcode === 'CALL' && arg0.includes(',')) {
      const cond = arg0.split(',')[0];
      if (!checkCondition(cond, nextState.flags)) perform = false;
    }

    if (perform) {
      nextState.registers.sp = (nextState.registers.sp - 2) & 0xFFFF;
    }

    // Handle Specific BIOS side effects (VDP etc)
    let target: number | null = null;
    if (opcode === 'RST') {
      target = parseValue(arg0);
    } else {
      target = resolveValue(arg0);
    }

    if (target === 0x004D) { // WRTVRM
      const addr = getPair('HL') & 0x3FFF;
      const val = nextState.registers.a;
      nextState.vdp.vram[addr] = val;
    }
    else if (target === 0x005C) { // LDIRVM
      let src = getPair('HL');
      let dst = getPair('DE') & 0x3FFF;
      let len = getPair('BC');

      console.log(`[LDIRVM] Copying ${len} bytes from RAM $${src.toString(16)} to VRAM $${dst.toString(16)}`);

      // Show ALL bytes in the source range from memoryMap
      if (memoryMap) {
        const allBytes = [];
        for (let i = 0; i < len; i++) {
          const val = memoryMap[src + i];
          allBytes.push(val !== undefined ? val.toString(16).padStart(2, '0') : 'XX');
        }
        console.log(`[LDIRVM] memoryMap full range:`, allBytes.join(' '));
      }

      for (let i = 0; i < len; i++) {
        let val = readByte(src + i);
        nextState.vdp.vram[(dst + i) & 0x3FFF] = val;
      }

      // Verify what was written to VRAM
      const vramCheck = [];
      for (let i = 0; i < len; i++) {
        vramCheck.push(nextState.vdp.vram[(dst + i) & 0x3FFF].toString(16).padStart(2, '0'));
      }
      console.log(`[LDIRVM] VRAM[$${dst.toString(16)}] now contains:`, vramCheck.join(' '));
    }
    else if (target === 0x0056) { // FILVRM
      let addr = getPair('HL') & 0x3FFF;
      let len = getPair('BC');
      const val = nextState.registers.a;
      for (let i = 0; i < len; i++) {
        nextState.vdp.vram[(addr + i) & 0x3FFF] = val;
      }
    }
  }
  else if (opcode === 'RET' || opcode === 'RETI' || opcode === 'RETN') {
    let perform = true;
    if (opcode === 'RET' && operands) {
      if (!checkCondition(operands, nextState.flags)) perform = false;
    }
    // RETI / RETN are unconditional

    if (perform) {
      nextState.registers.sp = (nextState.registers.sp + 2) & 0xFFFF;
    }
  }

  // --- VDP / MSX SPECIFIC OPS ---

  else if (opcode === 'OUT') {
    const portStr = arg0.replace('(', '').replace(')', '').trim();
    const val = ['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg1) ? getReg(arg1) : resolveValue(arg1);

    if (val !== null) {
      if (portStr === '$98' || portStr === '98H' || portStr === '152') {
        const vramAddr = nextState.vdp.addressRegister & 0x3FFF;
        nextState.vdp.vram[vramAddr] = val & 0xFF;
        nextState.vdp.addressRegister = (nextState.vdp.addressRegister + 1) & 0x3FFF;
        nextState.vdp.writeLatch = false;
      }
      else if (portStr === '$99' || portStr === '99H' || portStr === '153') {
        if (!nextState.vdp.writeLatch) {
          nextState.vdp.registerLatch = val & 0xFF;
          nextState.vdp.writeLatch = true;
        } else {
          const high = val & 0xFF;
          const low = nextState.vdp.registerLatch;
          if ((high & 0xC0) === 0x40) {
            // Register Write
          } else {
            const addr = ((high & 0x3F) << 8) | low;
            nextState.vdp.addressRegister = addr;
          }
          nextState.vdp.writeLatch = false;
        }
      }
    }
  }

  // === END OF INSTRUCTION SIMULATION ===

  // Calculate T-states for this instruction
  let conditionMet: boolean | undefined = undefined;

  // Detect conditional instructions and their execution path
  if (opcode === 'JR' && args.length > 1) {
    conditionMet = checkCondition(arg0, nextState.flags);
  } else if (opcode === 'DJNZ') {
    conditionMet = nextState.registers.b !== 0;
  } else if (opcode === 'CALL' && args.length > 1) {
    conditionMet = checkCondition(arg0, nextState.flags);
  } else if (opcode === 'RET' && args.length > 0 && arg0 !== '') {
    conditionMet = checkCondition(arg0, nextState.flags);
  }

  // Calculate cycles using timing service
  nextState.cycles = getInstructionTiming(opcode, operands, conditionMet);

  return nextState;
};

export const executeSubroutine = (
  startLine: number, // 1-based line number (visual)
  initialState: SimulationState,
  lines: string[],
  labels: { [label: string]: number },
  symbolTable: { [label: string]: number },
  memoryMap: { [address: number]: number },
  maxSteps: number = 50000
): SimulationState => {
  let state = {
    registers: { ...initialState.registers },
    flags: { ...initialState.flags },
    memory: { ...initialState.memory },
    vdp: { ...initialState.vdp, vram: [...initialState.vdp.vram] }
  };

  let pc = startLine;
  let steps = 0;
  const callStack: number[] = [];

  while (steps < maxSteps) {
    if (!lines[pc - 1]) break;

    const line = lines[pc - 1];
    const clean = line.split(';')[0].trim();

    if (!clean || clean.endsWith(':') || /^(EQU|ORG|DB|DW|DS|DEFB|DEFW|DEFS|DEFM)/i.test(clean)) {
      pc++;
      continue;
    }

    // Execute Logic (State Update)
    // This will now update SP correctly for CALL/RET/RETI/RETN
    state = simulateLine(line, state, symbolTable, memoryMap);

    // Flow Logic

    // CALL
    if (/^CALL\b/i.test(clean)) {
      let perform = true;
      // Condition check (if args exist)
      if (clean.includes(',')) {
        const parts = clean.substring(4).split(',');
        if (parts.length > 1) {
          const cond = parts[0].trim();
          // Uses the exhaustive checkCondition list
          if (['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'].includes(cond.toUpperCase())) {
            if (!checkCondition(cond, state.flags)) perform = false;
          }
        }
      }

      if (perform) {
        const parts = clean.substring(4).split(',');
        const targetLabel = parts[parts.length - 1].trim().toUpperCase();

        // If it's a known user label, we jump into it
        if (labels[targetLabel]) {
          callStack.push(pc + 1);
          pc = labels[targetLabel];
          steps++;
          continue;
        }
        // Check if target is a BIOS address (treat as black box - BIOS will RET)
        // Only treat as BIOS if label is NOT in user code labels
        else if (!labels[targetLabel]) {
          let targetAddr: number | null = null;

          // Try parsing as direct address
          targetAddr = parseValue(targetLabel);

          // Try symbolTable (for EQU definitions like RSLREG EQU #0138)
          if (targetAddr === null && symbolTable[targetLabel] !== undefined) {
            targetAddr = symbolTable[targetLabel];
          }

          if (targetAddr !== null) {
            // Check if it's a BIOS address (0x0000-0x3FFF)
            if (targetAddr >= 0 && targetAddr < 0x4000) {
              // BIOS call as black box: SP was decremented by simulateLine,
              // now simulate BIOS returning (increment SP back)
              state.registers.sp = (state.registers.sp + 2) & 0xFFFF;
              // Continue to next instruction (BIOS handled)
              pc++;
              steps++;
              continue;
            }

            // Try reverse lookup for user code address
            const labelEntry = Object.entries(symbolTable).find(([_, val]) => val === targetAddr);
            if (labelEntry && labels[labelEntry[0]]) {
              callStack.push(pc + 1);
              pc = labels[labelEntry[0]];
              steps++;
              continue;
            }
          }
        }
      }
    }
    // RST (treated as CALL)
    else if (/^RST\b/i.test(clean)) {
      // We don't jump into RST vectors (BIOS usually), just simulate effect
    }

    // RET / RETI / RETN
    else if (/^RET/i.test(clean)) {
      let perform = true;
      // Check for conditional RET (e.g. RET NZ)
      // But ignore RETI/RETN
      if (!/^RET[IN]/i.test(clean)) {
        const cond = clean.substring(3).trim();
        if (cond && !checkCondition(cond, state.flags)) perform = false;
      }

      if (perform) {
        if (callStack.length === 0) {
          break;
        }
        const retLine = callStack.pop();
        if (retLine !== undefined) {
          pc = retLine;
          steps++;
          continue;
        }
      }
    }

    // Jumps (JP/JR)
    else if (/^(JP|JR)\\b/i.test(clean)) {
      // Check if simulateLine set jump properties
      const jumpTarget = (state as any).__jumpTarget;
      const relativeJump = (state as any).__relativeJump;

      if (jumpTarget !== undefined) {
        // Absolute jump (JP)
        // Try to find the label for this address
        const labelEntry = Object.entries(symbolTable).find(([_, val]) => val === jumpTarget);
        if (labelEntry && labels[labelEntry[0]]) {
          pc = labels[labelEntry[0]];
          // Clear the jump marker
          delete (state as any).__jumpTarget;
          steps++;
          continue;
        }
        // If not found in labels, might be jumping to dynamic address
        // For now, just advance (could improve this)
        delete (state as any).__jumpTarget;
      } else if (relativeJump !== undefined) {
        // Relative jump (JR or DJNZ)
        // Relative jumps are from the NEXT instruction (PC+2 for JR, PC+2 for DJNZ)
        // In our line-based system, we need to find the target line
        // For now, approximate by adding the offset to current PC
        // Note: This is a simplified implementation
        pc = pc + 1 + relativeJump; // +1 to skip current instruction, then apply offset

        // Clear the jump marker
        delete (state as any).__relativeJump;
        steps++;
        continue;
      }

      // Fallback to old logic if properties not set
      const isJr = clean.toUpperCase().startsWith('JR');
      const content = clean.substring(isJr ? 2 : 2).trim();
      const args = content.split(',');
      let target = args[0];
      let perform = true;

      if (args.length > 1) {
        if (!checkCondition(args[0], state.flags)) perform = false;
        target = args[1];
      }

      if (perform) {
        const upperTarget = target.trim().toUpperCase();

        // Indirect Jump: JP (HL)
        if (upperTarget === '(HL)') {
          const addr = (state.registers.h << 8) | state.registers.l;
          // Reverse Lookup: Address -> Label -> Line
          const labelEntry = Object.entries(symbolTable).find(([_, val]) => val === addr);
          if (labelEntry && labels[labelEntry[0]]) {
            pc = labels[labelEntry[0]];
            steps++;
            continue;
          }
        }
        // Direct Jump: JP Label
        else if (labels[upperTarget]) {
          pc = labels[upperTarget];
          steps++;
          continue;
        }
        // Check if target is a BIOS address or user code address
        // Only treat as BIOS if label is NOT in user code labels
        else if (!labels[upperTarget]) {
          let targetAddr: number | null = null;

          // Try parsing as direct address
          targetAddr = parseValue(upperTarget);

          // Try symbolTable (for EQU definitions like ENASLT EQU #0024)
          if (targetAddr === null && symbolTable[upperTarget] !== undefined) {
            targetAddr = symbolTable[upperTarget];
          }

          if (targetAddr !== null) {
            // Check if it's a BIOS address (0x0000-0x3FFF)
            // JP to BIOS = tail call, subroutine exits here (BIOS will RET to original caller)
            if (targetAddr >= 0 && targetAddr < 0x4000) {
              // Simulate the RET that BIOS will eventually do
              // This pops the return address from stack
              state.registers.sp = (state.registers.sp + 2) & 0xFFFF;
              break; // Exit subroutine - BIOS handled return
            }

            // Try reverse lookup for user code address
            const labelEntry = Object.entries(symbolTable).find(([_, val]) => val === targetAddr);
            if (labelEntry && labels[labelEntry[0]]) {
              pc = labels[labelEntry[0]];
              steps++;
              continue;
            }
          }
        }
      }
    }

    // DJNZ - Decrement and Jump if Not Zero
    else if (/^DJNZ\\b/i.test(clean)) {
      // Check if simulateLine set the relativeJump property
      const relativeJump = (state as any).__relativeJump;

      if (relativeJump !== undefined) {
        // Use the relative jump calculated by simulateLine
        pc = pc + 1 + relativeJump; // +1 to skip current instruction, then apply offset
        delete (state as any).__relativeJump;
        steps++;
        continue;
      }

      // Fallback to old logic (B is already decremented by simulateLine)
      if (state.registers.b !== 0) {
        const target = clean.substring(4).trim();
        if (labels[target.toUpperCase()]) {
          pc = labels[target.toUpperCase()];
          steps++;
          continue;
        }
      }
    }

    // Normal step
    pc++;
    steps++;
  }

  return state;
}

export const executeLoopUntilCompletion = (
  djnzLine: number,
  targetLabel: string,
  initialState: SimulationState,
  lines: string[],
  labels: { [label: string]: number },
  symbolTable: { [label: string]: number },
  memoryMap: { [address: number]: number }
): SimulationState => {
  let state = {
    registers: { ...initialState.registers },
    flags: { ...initialState.flags },
    memory: { ...initialState.memory },
    vdp: { ...initialState.vdp, vram: [...initialState.vdp.vram] }
  };

  // Ensure target exists
  const targetLine = labels[targetLabel.toUpperCase()];
  if (!targetLine) return state;

  let safetyCounter = 0;
  const MAX_LOOP_ITERATIONS = 50000; // Protection against infinite logic

  // The DJNZ opcode itself (already decremented in simulateLine before calling this if we were stepping, 
  // but here we are controlling the whole loop manually).
  // NOTE: The UI calls this *before* executing the DJNZ step logic that decrements, 
  // or *at* the DJNZ line. We assume we are sitting AT the DJNZ line.

  // Actually, the most robust way is to just run the loop body B times.
  // Count how many times we need to loop.
  const count = state.registers.b; // Current B value

  for (let i = 0; i < count; i++) {
    let pc = targetLine;

    // Run from Target -> DJNZ line
    while (pc <= djnzLine && safetyCounter < MAX_LOOP_ITERATIONS) {
      const line = lines[pc - 1];
      const clean = line.split(';')[0].trim();

      // If we hit the DJNZ itself, we stop this iteration
      if (pc === djnzLine) {
        // Simulate the DJNZ logic just for state (Decrement B)
        // But wait, our outer loop 'i' handles the repetition.
        // We just need to decrement B in the state to reflect reality.
        state.registers.b = (state.registers.b - 1) & 0xFF;
        break;
      }

      if (!clean || clean.endsWith(':') || /^(EQU|ORG|DB|DW|DS|DEFB|DEFW|DEFS|DEFM)/i.test(clean)) {
        pc++;
        continue;
      }

      // Simulate instruction
      state = simulateLine(line, state, symbolTable, memoryMap);

      // Handle internal flow control (Jumps inside the loop body)
      if (/^(JP|JR)\b/i.test(clean)) {
        const isJr = clean.toUpperCase().startsWith('JR');
        const content = clean.substring(isJr ? 2 : 2).trim();
        const args = content.split(',');
        let target = args[0];
        let perform = true;
        if (args.length > 1) {
          if (!checkCondition(args[0], state.flags)) perform = false;
          target = args[1];
        }
        if (perform) {
          const upperTarget = target.trim().toUpperCase();
          if (labels[upperTarget]) {
            pc = labels[upperTarget];
            safetyCounter++;
            continue;
          }
          // Check if target is a BIOS address or user code address
          // Only treat as BIOS if label is NOT in user code labels
          else if (!labels[upperTarget]) {
            let targetAddr: number | null = null;
            targetAddr = parseValue(upperTarget);
            if (targetAddr === null && symbolTable[upperTarget] !== undefined) {
              targetAddr = symbolTable[upperTarget];
            }

            if (targetAddr !== null) {
              // BIOS address - skip (treat as external call)
              if (targetAddr >= 0 && targetAddr < 0x4000) {
                pc++;
                safetyCounter++;
                continue;
              }

              const labelEntry = Object.entries(symbolTable).find(([_, val]) => val === targetAddr);
              if (labelEntry && labels[labelEntry[0]]) {
                pc = labels[labelEntry[0]];
                safetyCounter++;
                continue;
              }
            }
          }
        }
      }

      pc++;
      safetyCounter++;
    }
  }

  return state;
};

export const simulateStepsAhead = (
  startLine: number,
  initialState: SimulationState,
  lines: string[],
  symbolTable: { [label: string]: number },
  labels: { [label: string]: number },
  memoryMap: { [address: number]: number },
  maxSteps: number = 2000
): SimulationState => {
  return executeSubroutine(startLine, initialState, lines, labels, symbolTable, memoryMap, maxSteps);
};

// =====================================================
// BIOS ROM Instruction Simulation
// =====================================================

import { DisassembledInstruction } from './z80Disassembler';

/**
 * Simulate a BIOS instruction from disassembled code
 * This is similar to simulateLine but works with pre-parsed instructions
 */
export const simulateBiosInstruction = (
  instruction: DisassembledInstruction,
  currentState: SimulationState,
  biosRomReader: (address: number) => number
): SimulationState => {
  const nextState = {
    registers: { ...currentState.registers },
    flags: { ...currentState.flags },
    memory: { ...currentState.memory },
    vdp: {
      vram: [...currentState.vdp.vram],
      addressRegister: currentState.vdp.addressRegister,
      writeLatch: currentState.vdp.writeLatch,
      registerLatch: currentState.vdp.registerLatch
    }
  };

  const opcode = instruction.mnemonic.toUpperCase();
  const operands = instruction.operands;
  const args = operands.split(',').map(s => s.trim());
  const arg0 = args[0] ? args[0].toUpperCase() : '';
  const arg1 = args[1] ? args[1].toUpperCase() : '';

  // Helper to parse immediate values from disassembled operands (e.g., "$1234", "$FF")
  const parseImmediate = (valStr: string): number | null => {
    if (!valStr) return null;
    valStr = valStr.trim();
    if (valStr.startsWith('$')) {
      return parseInt(valStr.substring(1), 16);
    }
    if (!isNaN(parseInt(valStr))) {
      return parseInt(valStr);
    }
    return null;
  };

  // Memory read that checks BIOS ROM first, then user memory
  const readByte = (addr: number): number => {
    // BIOS ROM range: 0x0000 - 0x3FFF (16KB)
    if (addr >= 0 && addr < 0x4000) {
      return biosRomReader(addr);
    }
    // User memory / stack
    const stackKey = `STACK:${addr}`;
    if (nextState.memory[stackKey] !== undefined) return nextState.memory[stackKey];
    return 0;
  };

  const writeByte = (addr: number, val: number) => {
    const v = val & 0xFF;
    nextState.memory[`STACK:${addr}`] = v;
  };

  // Helpers for flag calculation
  const calculateParity = (val: number): boolean => {
    let v = val & 0xFF;
    v ^= v >> 4;
    v ^= v >> 2;
    v ^= v >> 1;
    return (~v & 1) === 1;
  };

  const updateFlagsLogic = (val: number, isLogicOp: boolean) => {
    nextState.flags.z = (val & 0xFF) === 0;
    nextState.flags.s = (val & 0x80) !== 0;
    if (isLogicOp) {
      nextState.flags.pv = calculateParity(val);
    }
  };

  const setReg = (name: string, val: number) => {
    const v = val & 0xFF;
    switch (name) {
      case 'A': nextState.registers.a = v; break;
      case 'B': nextState.registers.b = v; break;
      case 'C': nextState.registers.c = v; break;
      case 'D': nextState.registers.d = v; break;
      case 'E': nextState.registers.e = v; break;
      case 'H': nextState.registers.h = v; break;
      case 'L': nextState.registers.l = v; break;
    }
  };

  const getReg = (name: string): number => {
    switch (name) {
      case 'A': return nextState.registers.a;
      case 'B': return nextState.registers.b;
      case 'C': return nextState.registers.c;
      case 'D': return nextState.registers.d;
      case 'E': return nextState.registers.e;
      case 'H': return nextState.registers.h;
      case 'L': return nextState.registers.l;
      default: return 0;
    }
  };

  const setPair = (pair: string, val: number) => {
    const high = (val >> 8) & 0xFF;
    const low = val & 0xFF;
    if (pair === 'HL') { nextState.registers.h = high; nextState.registers.l = low; }
    else if (pair === 'BC') { nextState.registers.b = high; nextState.registers.c = low; }
    else if (pair === 'DE') { nextState.registers.d = high; nextState.registers.e = low; }
    else if (pair === 'AF') {
      nextState.registers.a = high;
      nextState.flags.z = (low & 0x40) !== 0;
      nextState.flags.s = (low & 0x80) !== 0;
      nextState.flags.c = (low & 0x01) !== 0;
      nextState.flags.pv = (low & 0x04) !== 0;
    }
  };

  const getPair = (pair: string): number => {
    if (pair === 'HL') return (nextState.registers.h << 8) | nextState.registers.l;
    if (pair === 'BC') return (nextState.registers.b << 8) | nextState.registers.c;
    if (pair === 'DE') return (nextState.registers.d << 8) | nextState.registers.e;
    if (pair === 'AF') {
      let f = 0;
      if (nextState.flags.z) f |= 0x40;
      if (nextState.flags.s) f |= 0x80;
      if (nextState.flags.c) f |= 0x01;
      if (nextState.flags.pv) f |= 0x04;
      return (nextState.registers.a << 8) | f;
    }
    if (pair === 'SP') return nextState.registers.sp;
    return 0;
  };

  const getOperandValue = (opStr: string): number | null => {
    if (['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(opStr)) {
      return getReg(opStr);
    }
    if (opStr === '(HL)') {
      return readByte(getPair('HL'));
    }
    return parseImmediate(opStr);
  };

  // Instruction simulation
  switch (opcode) {
    case 'NOP':
      break;

    case 'LD': {
      const isReg8 = ['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg0);
      const isReg16 = ['BC', 'DE', 'HL', 'SP'].includes(arg0);

      if (isReg8) {
        if (['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg1)) {
          setReg(arg0, getReg(arg1));
        } else if (arg1.startsWith('(') && arg1.endsWith(')')) {
          const content = arg1.slice(1, -1).trim();
          if (content === 'HL') {
            setReg(arg0, readByte(getPair('HL')));
          } else if (content === 'BC') {
            setReg(arg0, readByte(getPair('BC')));
          } else if (content === 'DE') {
            setReg(arg0, readByte(getPair('DE')));
          } else {
            const addr = parseImmediate(content);
            if (addr !== null) setReg(arg0, readByte(addr));
          }
        } else {
          const val = parseImmediate(arg1);
          if (val !== null) setReg(arg0, val);
        }
      } else if (isReg16) {
        if (arg0 === 'SP' && arg1 === 'HL') {
          nextState.registers.sp = getPair('HL');
        } else if (arg1.startsWith('(') && arg1.endsWith(')')) {
          const content = arg1.slice(1, -1).trim();
          const addr = parseImmediate(content);
          if (addr !== null) {
            const low = readByte(addr);
            const high = readByte(addr + 1);
            const val = (high << 8) | low;
            if (arg0 === 'SP') nextState.registers.sp = val;
            else setPair(arg0, val);
          }
        } else {
          const val = parseImmediate(arg1);
          if (val !== null) {
            if (arg0 === 'SP') nextState.registers.sp = val & 0xFFFF;
            else setPair(arg0, val);
          }
        }
      } else if (arg0.startsWith('(') && arg0.endsWith(')')) {
        const targetRaw = arg0.slice(1, -1).trim();
        if (targetRaw === 'HL') {
          const val = ['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg1) ? getReg(arg1) : parseImmediate(arg1);
          if (val !== null) writeByte(getPair('HL'), val);
        } else if (targetRaw === 'BC') {
          writeByte(getPair('BC'), getReg('A'));
        } else if (targetRaw === 'DE') {
          writeByte(getPair('DE'), getReg('A'));
        } else {
          const addr = parseImmediate(targetRaw);
          if (addr !== null) {
            if (['BC', 'DE', 'HL', 'SP'].includes(arg1)) {
              const val = getPair(arg1);
              writeByte(addr, val & 0xFF);
              writeByte(addr + 1, (val >> 8) & 0xFF);
            } else {
              const val = ['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg1) ? getReg(arg1) : parseImmediate(arg1);
              if (val !== null) writeByte(addr, val & 0xFF);
            }
          }
        }
      }
      break;
    }

    case 'PUSH': {
      const val = getPair(arg0);
      nextState.registers.sp = (nextState.registers.sp - 2) & 0xFFFF;
      const sp = nextState.registers.sp;
      writeByte(sp, val & 0xFF);
      writeByte(sp + 1, (val >> 8) & 0xFF);
      break;
    }

    case 'POP': {
      const sp = nextState.registers.sp;
      const low = readByte(sp);
      const high = readByte(sp + 1);
      const val = (high << 8) | low;
      setPair(arg0, val);
      nextState.registers.sp = (nextState.registers.sp + 2) & 0xFFFF;
      break;
    }

    case 'EX': {
      if ((arg0 === 'DE' && arg1 === 'HL') || (arg0 === 'HL' && arg1 === 'DE')) {
        const de = getPair('DE');
        const hl = getPair('HL');
        setPair('DE', hl);
        setPair('HL', de);
      } else if (arg0 === '(SP)' && ['HL', 'IX', 'IY'].includes(arg1)) {
        const sp = nextState.registers.sp;
        const low = readByte(sp);
        const high = readByte(sp + 1);
        const memVal = (high << 8) | low;
        const regVal = getPair(arg1);
        writeByte(sp, regVal & 0xFF);
        writeByte(sp + 1, (regVal >> 8) & 0xFF);
        setPair(arg1, memVal);
      }
      break;
    }

    case 'INC':
    case 'DEC': {
      const diff = opcode === 'INC' ? 1 : -1;
      if (['BC', 'DE', 'HL', 'SP'].includes(arg0)) {
        if (arg0 === 'SP') nextState.registers.sp = (nextState.registers.sp + diff) & 0xFFFF;
        else setPair(arg0, (getPair(arg0) + diff) & 0xFFFF);
      } else if (['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg0)) {
        const current = getReg(arg0);
        const newVal = (current + diff) & 0xFF;
        setReg(arg0, newVal);
        updateFlagsLogic(newVal, false);
        nextState.flags.pv = (current === (opcode === 'INC' ? 0x7F : 0x80));
      } else if (arg0 === '(HL)') {
        const addr = getPair('HL');
        const current = readByte(addr);
        const newVal = (current + diff) & 0xFF;
        writeByte(addr, newVal);
        updateFlagsLogic(newVal, false);
        nextState.flags.pv = (current === (opcode === 'INC' ? 0x7F : 0x80));
      }
      break;
    }

    case 'ADD': {
      if (arg0 === 'A') {
        const val = getOperandValue(arg1);
        if (val !== null) {
          const current = nextState.registers.a;
          const res = current + val;
          nextState.registers.a = res & 0xFF;
          nextState.flags.c = res > 255;
          updateFlagsLogic(nextState.registers.a, false);
          nextState.flags.pv = ((current ^ res) & (val ^ res) & 0x80) !== 0;
        }
      } else if (['HL', 'IX', 'IY'].includes(arg0)) {
        const current = getPair(arg0);
        const val = ['BC', 'DE', 'HL', 'SP'].includes(arg1) ? getPair(arg1) : (parseImmediate(arg1) || 0);
        const res = current + val;
        setPair(arg0, res & 0xFFFF);
        nextState.flags.c = res > 65535;
      }
      break;
    }

    case 'ADC': {
      if (arg0 === 'A') {
        const val = getOperandValue(arg1);
        if (val !== null) {
          const current = nextState.registers.a;
          const carry = nextState.flags.c ? 1 : 0;
          const res = current + val + carry;
          nextState.registers.a = res & 0xFF;
          nextState.flags.c = res > 255;
          updateFlagsLogic(nextState.registers.a, false);
        }
      }
      break;
    }

    case 'SUB': {
      const val = getOperandValue(arg0);
      if (val !== null) {
        const current = nextState.registers.a;
        const res = current - val;
        nextState.registers.a = res & 0xFF;
        nextState.flags.c = current < val;
        updateFlagsLogic(nextState.registers.a, false);
        nextState.flags.pv = ((current ^ val) & (current ^ res) & 0x80) !== 0;
      }
      break;
    }

    case 'SBC': {
      if (arg0 === 'A') {
        const val = getOperandValue(arg1);
        if (val !== null) {
          const current = nextState.registers.a;
          const carry = nextState.flags.c ? 1 : 0;
          const res = current - val - carry;
          nextState.registers.a = res & 0xFF;
          nextState.flags.c = res < 0;
          updateFlagsLogic(nextState.registers.a, false);
        }
      }
      break;
    }

    case 'CP': {
      const val = getOperandValue(arg0);
      if (val !== null) {
        const result = nextState.registers.a - val;
        nextState.flags.z = (result & 0xFF) === 0;
        nextState.flags.c = nextState.registers.a < val;
        nextState.flags.s = (result & 0x80) !== 0;
        const a = nextState.registers.a;
        nextState.flags.pv = ((a ^ val) & (a ^ result) & 0x80) !== 0;
      }
      break;
    }

    case 'AND': {
      const val = getOperandValue(arg0);
      if (val !== null) {
        nextState.registers.a = nextState.registers.a & val;
        updateFlagsLogic(nextState.registers.a, true);
        nextState.flags.c = false;
      }
      break;
    }

    case 'OR': {
      const val = getOperandValue(arg0);
      if (val !== null) {
        nextState.registers.a = nextState.registers.a | val;
        updateFlagsLogic(nextState.registers.a, true);
        nextState.flags.c = false;
      }
      break;
    }

    case 'XOR': {
      const val = getOperandValue(arg0);
      if (val !== null) {
        nextState.registers.a = nextState.registers.a ^ val;
        updateFlagsLogic(nextState.registers.a, true);
        nextState.flags.c = false;
      }
      break;
    }

    case 'BIT': {
      const bit = parseInt(arg0);
      const val = getOperandValue(arg1) ?? 0;
      const res = val & (1 << bit);
      nextState.flags.z = res === 0;
      nextState.flags.s = bit === 7 && res !== 0;
      break;
    }

    case 'SET': {
      const bit = parseInt(arg0);
      if (['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg1)) {
        setReg(arg1, getReg(arg1) | (1 << bit));
      } else if (arg1 === '(HL)') {
        const addr = getPair('HL');
        writeByte(addr, readByte(addr) | (1 << bit));
      }
      break;
    }

    case 'RES': {
      const bit = parseInt(arg0);
      if (['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(arg1)) {
        setReg(arg1, getReg(arg1) & ~(1 << bit));
      } else if (arg1 === '(HL)') {
        const addr = getPair('HL');
        writeByte(addr, readByte(addr) & ~(1 << bit));
      }
      break;
    }

    case 'RLCA': {
      const bit7 = (nextState.registers.a >> 7) & 1;
      nextState.registers.a = ((nextState.registers.a << 1) | bit7) & 0xFF;
      nextState.flags.c = bit7 === 1;
      break;
    }

    case 'RRCA': {
      const bit0 = nextState.registers.a & 1;
      nextState.registers.a = ((nextState.registers.a >> 1) | (bit0 << 7)) & 0xFF;
      nextState.flags.c = bit0 === 1;
      break;
    }

    case 'RLA': {
      const bit7 = (nextState.registers.a >> 7) & 1;
      const c = nextState.flags.c ? 1 : 0;
      nextState.registers.a = ((nextState.registers.a << 1) | c) & 0xFF;
      nextState.flags.c = bit7 === 1;
      break;
    }

    case 'RRA': {
      const bit0 = nextState.registers.a & 1;
      const c = nextState.flags.c ? 1 : 0;
      nextState.registers.a = ((nextState.registers.a >> 1) | (c << 7)) & 0xFF;
      nextState.flags.c = bit0 === 1;
      break;
    }

    case 'SCF':
      nextState.flags.c = true;
      break;

    case 'CCF':
      nextState.flags.c = !nextState.flags.c;
      break;

    case 'CPL':
      nextState.registers.a = (~nextState.registers.a) & 0xFF;
      break;

    case 'NEG':
      nextState.registers.a = (0 - nextState.registers.a) & 0xFF;
      nextState.flags.z = nextState.registers.a === 0;
      nextState.flags.s = (nextState.registers.a & 0x80) !== 0;
      nextState.flags.c = nextState.registers.a !== 0;
      break;

    case 'DJNZ': {
      nextState.registers.b = (nextState.registers.b - 1) & 0xFF;
      break;
    }

    case 'CALL':
    case 'RST': {
      // Stack push happens unconditionally for simulation
      // Actual control flow is handled by App.tsx
      nextState.registers.sp = (nextState.registers.sp - 2) & 0xFFFF;
      break;
    }

    case 'RET':
    case 'RETI':
    case 'RETN': {
      // Stack pop happens unconditionally for simulation
      // Actual control flow is handled by App.tsx
      nextState.registers.sp = (nextState.registers.sp + 2) & 0xFFFF;
      break;
    }

    case 'DI':
    case 'EI':
    case 'HALT':
    case 'IM':
      // Interrupt-related - no state change for simulation
      break;

    case 'LDI': {
      const val = readByte(getPair('HL'));
      writeByte(getPair('DE'), val);
      setPair('HL', (getPair('HL') + 1) & 0xFFFF);
      setPair('DE', (getPair('DE') + 1) & 0xFFFF);
      setPair('BC', (getPair('BC') - 1) & 0xFFFF);
      nextState.flags.pv = getPair('BC') !== 0;
      break;
    }

    case 'LDD': {
      const val = readByte(getPair('HL'));
      writeByte(getPair('DE'), val);
      setPair('HL', (getPair('HL') - 1) & 0xFFFF);
      setPair('DE', (getPair('DE') - 1) & 0xFFFF);
      setPair('BC', (getPair('BC') - 1) & 0xFFFF);
      nextState.flags.pv = getPair('BC') !== 0;
      break;
    }

    case 'LDIR': {
      while (getPair('BC') > 0) {
        const val = readByte(getPair('HL'));
        writeByte(getPair('DE'), val);
        setPair('HL', (getPair('HL') + 1) & 0xFFFF);
        setPair('DE', (getPair('DE') + 1) & 0xFFFF);
        setPair('BC', (getPair('BC') - 1) & 0xFFFF);
      }
      nextState.flags.pv = false;
      break;
    }

    case 'LDDR': {
      while (getPair('BC') > 0) {
        const val = readByte(getPair('HL'));
        writeByte(getPair('DE'), val);
        setPair('HL', (getPair('HL') - 1) & 0xFFFF);
        setPair('DE', (getPair('DE') - 1) & 0xFFFF);
        setPair('BC', (getPair('BC') - 1) & 0xFFFF);
      }
      nextState.flags.pv = false;
      break;
    }

    case 'OUT': {
      // Handle VDP ports
      const portStr = arg0.replace(/[()]/g, '').trim();
      const portVal = parseImmediate(portStr);
      const val = getOperandValue(arg1);

      if (val !== null && portVal !== null) {
        if (portVal === 0x98) {
          const vramAddr = nextState.vdp.addressRegister & 0x3FFF;
          nextState.vdp.vram[vramAddr] = val & 0xFF;
          nextState.vdp.addressRegister = (nextState.vdp.addressRegister + 1) & 0x3FFF;
          nextState.vdp.writeLatch = false;
        } else if (portVal === 0x99) {
          if (!nextState.vdp.writeLatch) {
            nextState.vdp.registerLatch = val & 0xFF;
            nextState.vdp.writeLatch = true;
          } else {
            const high = val & 0xFF;
            const low = nextState.vdp.registerLatch;
            if ((high & 0xC0) !== 0x40) {
              const addr = ((high & 0x3F) << 8) | low;
              nextState.vdp.addressRegister = addr;
            }
            nextState.vdp.writeLatch = false;
          }
        }
      }
      break;
    }

    case 'IN':
      // Input operations - set A to 0 for simulation
      if (arg0 === 'A') {
        nextState.registers.a = 0;
      }
      break;

    // JP and JR don't change state, just control flow handled by App.tsx
    case 'JP':
    case 'JR':
      break;

    default:
      // Unknown instruction - no state change
      console.log(`BIOS: Unknown instruction ${opcode} ${operands}`);
      break;
  }

  return nextState;
};
