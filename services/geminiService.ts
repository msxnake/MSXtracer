
import { AnalysisResult, StepType, ExecutionStep, MemoryVariable, ReachabilityResult, Constant } from "../types";

const parseValue = (valStr: string, symbolTable?: { [label: string]: number }): number | null => {
  if (!valStr) return null;
  valStr = valStr.trim().toUpperCase();
  
  // Handle ASCII char 'A'
  if (valStr.startsWith("'") && valStr.endsWith("'") && valStr.length === 3) {
      return valStr.charCodeAt(1);
  }
  if (valStr.startsWith('"') && valStr.endsWith('"') && valStr.length === 3) {
      return valStr.charCodeAt(1);
  }

  try {
    if (valStr.startsWith('#')) return parseInt(valStr.substring(1), 16);
    if (valStr.startsWith('$')) return parseInt(valStr.substring(1), 16);
    if (valStr.endsWith('H')) return parseInt(valStr.substring(0, valStr.length - 1), 16);
    if (!isNaN(parseInt(valStr))) return parseInt(valStr);
    
    // Resolve label if provided
    if (symbolTable && symbolTable[valStr] !== undefined) {
        return symbolTable[valStr];
    }
  } catch (e) {}
  return null;
};

// Strict list of Z80 Opcodes to avoid confusion with Labels
const VALID_MNEMONICS = new Set([
  'ADC', 'ADD', 'AND', 'BIT', 'CALL', 'CCF', 'CP', 'CPD', 'CPDR', 'CPI', 'CPIR', 
  'CPL', 'DAA', 'DEC', 'DI', 'DJNZ', 'EI', 'EX', 'EXX', 'HALT', 'IM', 'IN', 
  'INC', 'IND', 'INDR', 'INI', 'INIR', 'JP', 'JR', 'LD', 'LDD', 'LDDR', 'LDI', 
  'LDIR', 'NEG', 'NOP', 'OR', 'OTDR', 'OTIR', 'OUT', 'OUTD', 'OUTI', 'POP', 
  'PUSH', 'RES', 'RET', 'RETI', 'RETN', 'RL', 'RLA', 'RLC', 'RLCA', 'RLD', 
  'RR', 'RRA', 'RRC', 'RRCA', 'RRD', 'RST', 'SBC', 'SCF', 'SET', 'SLA', 
  'SRA', 'SRL', 'SUB', 'XOR'
]);

export const getZ80Cycles = (opcode: string, operands: string): number => {
    const op = opcode.toUpperCase();
    if (!VALID_MNEMONICS.has(op)) return 0; // Return 0 for unknown opcodes

    switch(op) {
        case 'NOP': return 4;
        case 'LD': return operands.includes('(') ? 13 : 7;
        case 'INC': 
        case 'DEC': return 4;
        case 'ADD': return 7;
        case 'CP': return 7;
        case 'DJNZ': return 13;
        case 'JR': return 12;
        case 'JP': return 10;
        case 'CALL': return 17;
        case 'RET': return 10;
        case 'BIT': return 8;
        default: return 4;
    }
};

const DIRECTIVES = ['EQU', 'ORG', 'DB', 'DW', 'DS', 'DEFB', 'DEFW', 'DEFS', 'DEFM', 'INCLUDE', 'INCBIN', 'END', 'MACRO', 'ENDM'];

const getConditionDescription = (operands: string): string => {
    const cond = operands.split(',')[0].trim().toUpperCase();
    switch(cond) {
        case 'NZ': return "if Zero Flag is Clear";
        case 'Z': return "if Zero Flag is Set";
        case 'NC': return "if No Carry";
        case 'C': return "if Carry Flag is Set";
        case 'PO': return "if Parity Odd (No Overflow)";
        case 'PE': return "if Parity Even (Overflow)";
        case 'P': return "if Plus (Positive)";
        case 'M': return "if Minus (Negative)";
        default: return "";
    }
};

// Helper to calculate instruction/directive size consistently
const getEntitySize = (directive: string, args: string): number => {
    const dir = directive.toUpperCase();
    
    if (dir === 'DB' || dir === 'DEFB') {
        // Naive token split by comma, respecting quotes approx
        const tokens = args.split(/,(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/);
        let size = 0;
        tokens.forEach(t => {
            const trim = t.trim();
            if ((trim.startsWith('"') && trim.endsWith('"')) || (trim.startsWith("'") && trim.endsWith("'"))) {
                 size += trim.length - 2;
            } else {
                 size += 1;
            }
        });
        return size;
    }
    if (dir === 'DW' || dir === 'DEFW') {
        const tokens = args.split(',');
        return tokens.length * 2;
    }
    if (dir === 'DS' || dir === 'DEFS') {
        const val = parseInt(args);
        return isNaN(val) ? 0 : val;
    }
    
    if (VALID_MNEMONICS.has(dir)) {
         if (['JR','DJNZ'].includes(dir)) return 2;
         if (['JP','CALL'].includes(dir)) return 3;
         if (['LD'].includes(dir)) {
             if (args.includes(',')) {
                 // LD A, n (2) vs LD A, (nn) (3) vs LD HL, nn (3)
                 // Heuristic: if contains 4 hex digits or (nn), likely 3 bytes
                 if (args.match(/[0-9A-Fa-f]{3,4}H?/)) return 3;
                 if (args.includes('(') && !args.includes('(HL)') && !args.includes('(BC)') && !args.includes('(DE)')) return 3;
                 return 2; 
             }
         }
         if (['IM','OUT','IN'].includes(dir)) return 2;
         return 1;
    }
    return 0;
};

// Helper to parse a line into components
const parseLineComponents = (line: string) => {
    const clean = line.split(';')[0].trim();
    if (!clean) return null;

    const parts = clean.split(/\s+/);
    let labelCandidate = "";
    let directive = "";
    let args = "";

    if (parts[0].endsWith(':')) {
        labelCandidate = parts[0].slice(0, -1);
        const remainder = clean.substring(parts[0].length).trim();
        const remParts = remainder.split(/\s+/);
        if (remParts.length > 0) {
            directive = remParts[0].toUpperCase();
            args = remainder.substring(directive.length).trim();
        }
    } else {
        const first = parts[0].toUpperCase();
        if (!VALID_MNEMONICS.has(first) && !DIRECTIVES.includes(first)) {
            labelCandidate = parts[0];
            const remainder = clean.substring(parts[0].length).trim();
            const remParts = remainder.split(/\s+/);
            if (remParts.length > 0) {
                directive = remParts[0].toUpperCase();
                args = remainder.substring(directive.length).trim();
            }
        } else {
            directive = first;
            args = clean.substring(directive.length).trim();
        }
    }
    return { label: labelCandidate, directive, args };
};

export const analyzeZ80Code = async (code: string): Promise<AnalysisResult> => {
  const lines = code.split('\n');
  const labels: { [label: string]: number } = {};
  const symbolTable: { [label: string]: number } = {};
  const constants: Constant[] = [];
  const initialVariables: MemoryVariable[] = [];
  const memoryMap: { [address: number]: number } = {};
  const lineAddresses: { [line: number]: number } = {}; // Map Visual Line -> Address
  const detectedBugs: string[] = [];
  
  // Helper to resolve a value (literal or previously defined symbol)
  const resolve = (val: string) => parseValue(val, symbolTable);

  let initLabel = "";

  // ---------------------------------------------------------
  // PASS 0: Build Symbol Table & Calculate Addresses
  // ---------------------------------------------------------
  let currentAddress = 0;

  lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const comp = parseLineComponents(line);
      
      // Map current address to this line (even if empty, close enough for jumps)
      if (comp) {
          lineAddresses[lineNum] = currentAddress;
      }

      if (!comp) return;
      const { label, directive, args } = comp;

      // Detect ROM Header
      if (/db\s+(["']AB["']|#41|#42|\$41|\$42|41h|42h)/i.test(line)) {
          if (!initLabel) initLabel = "ROM_HEADER"; 
      }

      // Handle Label Definition
      if (label) {
          const upLabel = label.toUpperCase();
          if (directive === 'EQU') {
              const val = resolve(args);
              if (val !== null) {
                  constants.push({ name: upLabel, value: val, hex: '$' + val.toString(16).toUpperCase() });
                  symbolTable[upLabel] = val;
              }
          } else {
              labels[upLabel] = lineNum; // Visual Line Number
              symbolTable[upLabel] = currentAddress;
          }
      }

      // Handle Address Directives
      if (directive === 'ORG') {
          const addr = resolve(args);
          if (addr !== null) currentAddress = addr;
          // Update line address if ORG changes it
          lineAddresses[lineNum] = currentAddress; 
      } else {
          currentAddress += getEntitySize(directive, args);
      }
  });

  // ---------------------------------------------------------
  // PASS 1: Populate Memory Map & Variables (using full Symbol Table)
  // ---------------------------------------------------------
  currentAddress = 0; // Reset for second pass

  lines.forEach((line, idx) => {
      const comp = parseLineComponents(line);
      if (!comp) return;
      const { label, directive, args } = comp;

      if (directive === 'ORG') {
          const addr = resolve(args);
          if (addr !== null) currentAddress = addr;
      }
      else if (directive === 'DB' || directive === 'DEFB') {
        const tokens = args.split(/,(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/);
        let offset = 0;
        tokens.forEach(token => {
            const trim = token.trim();
            if (trim.startsWith('"') || trim.startsWith("'")) {
                const str = trim.slice(1, -1);
                for (let i = 0; i < str.length; i++) {
                    memoryMap[currentAddress + offset] = str.charCodeAt(i);
                    offset++;
                }
            } else {
                const val = resolve(trim);
                if (val !== null) {
                    memoryMap[currentAddress + offset] = val & 0xFF;
                    offset++;
                } else {
                    offset++; // Skip but increment
                }
            }
        });
        
        if (label) {
            initialVariables.push({
                name: label.toUpperCase(),
                value: memoryMap[currentAddress] || 0,
                address: '$' + currentAddress.toString(16).toUpperCase(),
                lastModifiedStepId: 0
            });
        }
        currentAddress += offset;
      }
      else if (directive === 'DW' || directive === 'DEFW') {
        const tokens = args.split(',');
        let offset = 0;
        tokens.forEach(token => {
             const val = resolve(token.trim());
             const safeVal = val !== null ? val : 0;
             // Little Endian
             memoryMap[currentAddress + offset] = safeVal & 0xFF;
             memoryMap[currentAddress + offset + 1] = (safeVal >> 8) & 0xFF;
             offset += 2;
        });

        if (label) {
             const valLow = memoryMap[currentAddress] || 0;
             const valHigh = memoryMap[currentAddress+1] || 0;
             initialVariables.push({
                name: label.toUpperCase(),
                value: (valHigh << 8) | valLow, 
                address: '$' + currentAddress.toString(16).toUpperCase(),
                lastModifiedStepId: 0
            });
        }
        currentAddress += offset;
      }
      else {
          currentAddress += getEntitySize(directive, args);
      }
  });

  // Re-Pass for Variables check (Aliases)
  Object.keys(labels).forEach(label => {
      const addr = symbolTable[label];
      if (!initialVariables.find(v => v.name === label) && !constants.find(c => c.name === label)) {
          if (memoryMap[addr] !== undefined) {
               initialVariables.push({
                   name: label,
                   value: memoryMap[addr],
                   address: '$' + addr.toString(16).toUpperCase(),
                   lastModifiedStepId: 0
               });
          }
      }
  });

  // Bug Check: Empty Labels / Fallthrough
  const sortedByLine = Object.entries(labels).sort((a, b) => a[1] - b[1]);
  for (let i = 0; i < sortedByLine.length - 1; i++) {
      const [name, line] = sortedByLine[i];
      const [nextName, nextLine] = sortedByLine[i+1];
      
      if (constants.find(c => c.name === name)) continue;
      
      const addr = symbolTable[name];
      const nextAddr = symbolTable[nextName];

      if (addr === nextAddr && name !== nextName) {
          if (name.toUpperCase().endsWith('_DATA') || name.toUpperCase().includes('_STRUCT')) {
              detectedBugs.push(`EMPTY DATA: '${name}' has 0 bytes (Line ${line}). It aliases '${nextName}'. Missing DB/DW?`);
          } else {
              detectedBugs.push(`FALLTHROUGH: '${name}' (Line ${line}) is empty. Execution flows directly to '${nextName}'. Missing RET?`);
          }
      }
  }

  // ---------------------------------------------------------
  // PASS 2: Generate Execution Steps (Simulation Data)
  // ---------------------------------------------------------
  const steps: ExecutionStep[] = [];
  let idCounter = 1;
  
  for (let i = 0; i < lines.length; i++) {
    const comp = parseLineComponents(lines[i]);
    if (!comp) continue;
    const { directive, args } = comp;

    // Filter only Instructions
    if (!directive || !VALID_MNEMONICS.has(directive) || DIRECTIVES.includes(directive)) {
        continue;
    }
    
    const opcode = directive;
    const operands = args;

    let description = `${opcode} ${operands}`;
    
    if ((opcode === 'RET' || opcode === 'CALL' || opcode === 'JP' || opcode === 'JR') && operands) {
         const desc = getConditionDescription(operands);
         if (desc) {
             description = `${opcode} ${desc} (${operands})`;
         }
    }

    steps.push({
      id: idCounter++,
      lineNumber: i + 1,
      opcode,
      operands,
      type: opcode === 'CALL' ? StepType.CALL : 
            (opcode === 'JP' || opcode === 'JR' || opcode === 'DJNZ') ? StepType.JUMP :
            opcode.startsWith('RET') ? StepType.RETURN : StepType.INSTRUCTION,
      description: description,
      cycles: getZ80Cycles(opcode, operands)
    });
  }

  // Determine Entry Line
  let entryLine = 1;
  if (initLabel && labels[initLabel]) {
      entryLine = labels[initLabel];
  } else if (labels['START']) {
      entryLine = labels['START'];
  } else if (steps.length > 0) {
      entryLine = steps[0].lineNumber;
  }

  return {
    steps,
    generalReview: initLabel ? `MSX ROM Header/Start detected.` : "Analysis complete.",
    detectedBugs,
    initialVariables,
    constants,
    symbolTable,
    labels,
    memoryMap,
    lineAddresses,
    entryLine
  };
};

export const checkLabelReachability = (code: string, targetLabel: string): ReachabilityResult => {
    return { isReachable: true, status: 'EXECUTED', tracePath: [], referenceCount: 1, labelLine: 1 };
};

export const calculateCodeSelectionCycles = (text: string) => {
    return { total: 0, details: [] };
};
