
import { Z80Flags, Z80Registers, VDPState } from "../types";
import { getMSXInfo } from "./msxContext";

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
  memoryMap?: { [address: number]: number } 
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
      // 1. Check if dynamic memory has this address via a Label name
      const label = findLabelForAddress(addr);
      if (label && nextState.memory[label] !== undefined) return nextState.memory[label];
      
      // 2. Check if dynamic memory has this address directly or stack key
      const stackKey = `STACK:${addr}`;
      if (nextState.memory[stackKey] !== undefined) return nextState.memory[stackKey];

      // 3. Check Static Map (Source code DB/DW data)
      if (memoryMap && memoryMap[addr] !== undefined) return memoryMap[addr];
      
      return 0;
  };

  const writeByte = (addr: number, val: number) => {
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
      switch(name) {
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
      switch(name) {
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
          if(nextState.flags.z) f |= 0x40;
          if(nextState.flags.s) f |= 0x80;
          if(nextState.flags.c) f |= 0x01;
          if(nextState.flags.pv) f |= 0x04;
          return (nextState.registers.a << 8) | f;
      }
      return 0;
  };

  // Helper for ALU operations to resolve Register or Value
  const getOperandValue = (opStr: string): number | null => {
      if (['A','B','C','D','E','H','L'].includes(opStr)) {
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
     const isReg8 = ['A','B','C','D','E','H','L'].includes(arg0);
     const isReg16 = ['BC','DE','HL','SP','IX','IY'].includes(arg0);

     if (isReg8) {
        // Destination is an 8-bit Register
        if (['A','B','C','D','E','H','L'].includes(arg1)) {
            setReg(arg0, getReg(arg1));
        } else if (arg1.startsWith('(') && arg1.endsWith(')')) {
             // Indirect Loading: LD r, (nn) or LD r, (HL/BC/DE)
             const content = arg1.slice(1,-1).trim();

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
                 // Simplified Indexing support (Treat as offset 0 for now)
                 const reg = content.substring(0, 2);
                 setReg(arg0, readByte(getPair(reg))); 
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
            const content = arg1.slice(1,-1).trim();
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
             const val = ['A','B','C','D','E','H','L'].includes(arg1) ? getReg(arg1) : resolveValue(arg1);
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
                if (['BC','DE','HL','SP','IX','IY'].includes(arg1)) {
                    const val = (arg1 === 'SP') ? nextState.registers.sp : getPair(arg1);
                    writeByte(addr, val & 0xFF);
                    writeByte(addr + 1, (val >> 8) & 0xFF);
                } 
                else {
                    let valToWrite: number | null = null;
                    if (['A','B','C','D','E','H','L'].includes(arg1)) valToWrite = getReg(arg1);
                    else valToWrite = resolveValue(arg1);

                    if (valToWrite !== null) {
                       writeByte(addr, valToWrite & 0xFF);
                    }
                }
            } 
            else if (nextState.memory[targetRaw.toUpperCase()] !== undefined) {
                 // Fallback for named variables that weren't resolved to addresses
                 let valToWrite: number | null = null;
                 if (['A','B','C','D','E','H','L'].includes(arg1)) valToWrite = getReg(arg1);
                 else valToWrite = resolveValue(arg1);
                 if (valToWrite !== null) nextState.memory[targetRaw.toUpperCase()] = valToWrite & 0xFF;
            }
        }
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
          // EX AF, AF' (Shadow regs placeholder)
      }
      else if (op1 === '(SP)' && (op2 === 'HL' || op2 === 'IX' || op2 === 'IY')) {
          // EX (SP), HL/IX/IY
          const sp = nextState.registers.sp;
          const low = readByte(sp);
          const high = readByte(sp + 1);
          const memVal = (high << 8) | low;
          
          const regVal = (op2 === 'HL') ? getPair('HL') : getPair(op2); // Assuming IX/IY getter logic exists or maps to pair
          
          // Swap
          writeByte(sp, regVal & 0xFF);
          writeByte(sp + 1, (regVal >> 8) & 0xFF);
          
          if (op2 === 'HL') setPair('HL', memVal);
          // If IX/IY, we don't have explicit setPair logic for them in this basic sim, but HL works.
      }
  }

  // 3. PUSH / POP
  else if (opcode === 'PUSH') {
      const val = getPair(arg0); 
      nextState.registers.sp = (nextState.registers.sp - 2) & 0xFFFF;
      const sp = nextState.registers.sp;
      nextState.memory[`STACK:${sp}`] = (val & 0xFF); 
      nextState.memory[`STACK:${sp+1}`] = ((val >> 8) & 0xFF); 
  }
  else if (opcode === 'POP') {
      const sp = nextState.registers.sp;
      const low = nextState.memory[`STACK:${sp}`] || 0;
      const high = nextState.memory[`STACK:${sp+1}`] || 0;
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

      if (['BC','DE','HL','SP'].includes(arg0)) {
          if (arg0 === 'SP') nextState.registers.sp = (nextState.registers.sp + diff) & 0xFFFF;
          else {
              const current = getPair(arg0);
              setPair(arg0, (current + diff) & 0xFFFF);
          }
      } 
      else if (['A','B','C','D','E','H','L'].includes(arg0)) {
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
      } else if (['HL','IX','IY'].includes(arg0)) {
          const current = getPair(arg0);
          let val = 0;
          if (['BC','DE','HL','SP'].includes(arg1)) val = getPair(arg1);
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
  
  // 8. BIT INSTRUCTIONS (Critical for JP Z / JP NZ)
  else if (opcode === 'BIT') {
      const bit = parseInt(arg0);
      let val = 0;
      if (['A','B','C','D','E','H','L'].includes(arg1)) val = getReg(arg1);
      else if (arg1 === '(HL)') val = readByte(getPair('HL'));
      
      const res = val & (1 << bit);
      nextState.flags.z = (res === 0);
      nextState.flags.s = (bit === 7 && res !== 0);
      // H flag should be 1, N should be 0. PV is unknown for BIT in some docs but usually Z matches.
  }
  else if (opcode === 'SET') {
      const bit = parseInt(arg0);
      if (['A','B','C','D','E','H','L'].includes(arg1)) {
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
      if (['A','B','C','D','E','H','L'].includes(arg1)) {
          const val = getReg(arg1);
          setReg(arg1, val & ~(1 << bit));
      } else if (arg1 === '(HL)') {
          const addr = getPair('HL');
          const val = readByte(addr);
          writeByte(addr, val & ~(1 << bit));
      }
  }

  // 9. ROTATES (Critical for JP C / JP NC)
  else if (['RLCA','RRCA','RLA','RRA'].includes(opcode)) {
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
  
  // 10. FLAGS
  else if (opcode === 'SCF') {
      nextState.flags.c = true;
  }
  else if (opcode === 'CCF') {
      nextState.flags.c = !nextState.flags.c;
  }
  
  // 11. DJNZ
  else if (opcode === 'DJNZ') {
      const b = (nextState.registers.b - 1) & 0xFF;
      nextState.registers.b = b;
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
          for (let i = 0; i < len; i++) {
               let val = readByte(src + i);
               nextState.vdp.vram[(dst + i) & 0x3FFF] = val;
          }
      }
      else if (target === 0x0056) { // FILVRM
          let addr = getPair('HL') & 0x3FFF;
          let len = getPair('BC');
          const val = nextState.registers.a;
          for(let i=0; i<len; i++) {
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
     const val = ['A','B','C','D','E','H','L'].includes(arg1) ? getReg(arg1) : resolveValue(arg1);

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
                    if (['NZ','Z','NC','C','PO','PE','P','M'].includes(cond.toUpperCase())) {
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
      else if (/^(JP|JR)\b/i.test(clean)) {
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
            }
      }
      
      // DJNZ
      else if (/^DJNZ\b/i.test(clean)) {
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
