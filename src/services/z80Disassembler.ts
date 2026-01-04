// Z80 Disassembler for BIOS ROM tracing
// Complete opcode tables for all Z80 instruction prefixes

export interface DisassembledInstruction {
  address: number;
  bytes: number[];
  mnemonic: string;
  operands: string;
  size: number;
  cycles: number;
}

interface OpcodeEntry {
  mnemonic: string;
  operands: string;
  size: number;
  cycles: number;
}

// Placeholder patterns in operands:
// nn = 16-bit immediate (2 bytes, little endian)
// n = 8-bit immediate (1 byte)
// d = signed displacement (1 byte)
// e = relative jump offset (1 byte, signed)

// Main opcode table (unprefixed instructions)
const MAIN_OPCODES: { [opcode: number]: OpcodeEntry } = {
  0x00: { mnemonic: 'NOP', operands: '', size: 1, cycles: 4 },
  0x01: { mnemonic: 'LD', operands: 'BC, nn', size: 3, cycles: 10 },
  0x02: { mnemonic: 'LD', operands: '(BC), A', size: 1, cycles: 7 },
  0x03: { mnemonic: 'INC', operands: 'BC', size: 1, cycles: 6 },
  0x04: { mnemonic: 'INC', operands: 'B', size: 1, cycles: 4 },
  0x05: { mnemonic: 'DEC', operands: 'B', size: 1, cycles: 4 },
  0x06: { mnemonic: 'LD', operands: 'B, n', size: 2, cycles: 7 },
  0x07: { mnemonic: 'RLCA', operands: '', size: 1, cycles: 4 },
  0x08: { mnemonic: 'EX', operands: "AF, AF'", size: 1, cycles: 4 },
  0x09: { mnemonic: 'ADD', operands: 'HL, BC', size: 1, cycles: 11 },
  0x0A: { mnemonic: 'LD', operands: 'A, (BC)', size: 1, cycles: 7 },
  0x0B: { mnemonic: 'DEC', operands: 'BC', size: 1, cycles: 6 },
  0x0C: { mnemonic: 'INC', operands: 'C', size: 1, cycles: 4 },
  0x0D: { mnemonic: 'DEC', operands: 'C', size: 1, cycles: 4 },
  0x0E: { mnemonic: 'LD', operands: 'C, n', size: 2, cycles: 7 },
  0x0F: { mnemonic: 'RRCA', operands: '', size: 1, cycles: 4 },

  0x10: { mnemonic: 'DJNZ', operands: 'e', size: 2, cycles: 13 },
  0x11: { mnemonic: 'LD', operands: 'DE, nn', size: 3, cycles: 10 },
  0x12: { mnemonic: 'LD', operands: '(DE), A', size: 1, cycles: 7 },
  0x13: { mnemonic: 'INC', operands: 'DE', size: 1, cycles: 6 },
  0x14: { mnemonic: 'INC', operands: 'D', size: 1, cycles: 4 },
  0x15: { mnemonic: 'DEC', operands: 'D', size: 1, cycles: 4 },
  0x16: { mnemonic: 'LD', operands: 'D, n', size: 2, cycles: 7 },
  0x17: { mnemonic: 'RLA', operands: '', size: 1, cycles: 4 },
  0x18: { mnemonic: 'JR', operands: 'e', size: 2, cycles: 12 },
  0x19: { mnemonic: 'ADD', operands: 'HL, DE', size: 1, cycles: 11 },
  0x1A: { mnemonic: 'LD', operands: 'A, (DE)', size: 1, cycles: 7 },
  0x1B: { mnemonic: 'DEC', operands: 'DE', size: 1, cycles: 6 },
  0x1C: { mnemonic: 'INC', operands: 'E', size: 1, cycles: 4 },
  0x1D: { mnemonic: 'DEC', operands: 'E', size: 1, cycles: 4 },
  0x1E: { mnemonic: 'LD', operands: 'E, n', size: 2, cycles: 7 },
  0x1F: { mnemonic: 'RRA', operands: '', size: 1, cycles: 4 },

  0x20: { mnemonic: 'JR', operands: 'NZ, e', size: 2, cycles: 12 },
  0x21: { mnemonic: 'LD', operands: 'HL, nn', size: 3, cycles: 10 },
  0x22: { mnemonic: 'LD', operands: '(nn), HL', size: 3, cycles: 16 },
  0x23: { mnemonic: 'INC', operands: 'HL', size: 1, cycles: 6 },
  0x24: { mnemonic: 'INC', operands: 'H', size: 1, cycles: 4 },
  0x25: { mnemonic: 'DEC', operands: 'H', size: 1, cycles: 4 },
  0x26: { mnemonic: 'LD', operands: 'H, n', size: 2, cycles: 7 },
  0x27: { mnemonic: 'DAA', operands: '', size: 1, cycles: 4 },
  0x28: { mnemonic: 'JR', operands: 'Z, e', size: 2, cycles: 12 },
  0x29: { mnemonic: 'ADD', operands: 'HL, HL', size: 1, cycles: 11 },
  0x2A: { mnemonic: 'LD', operands: 'HL, (nn)', size: 3, cycles: 16 },
  0x2B: { mnemonic: 'DEC', operands: 'HL', size: 1, cycles: 6 },
  0x2C: { mnemonic: 'INC', operands: 'L', size: 1, cycles: 4 },
  0x2D: { mnemonic: 'DEC', operands: 'L', size: 1, cycles: 4 },
  0x2E: { mnemonic: 'LD', operands: 'L, n', size: 2, cycles: 7 },
  0x2F: { mnemonic: 'CPL', operands: '', size: 1, cycles: 4 },

  0x30: { mnemonic: 'JR', operands: 'NC, e', size: 2, cycles: 12 },
  0x31: { mnemonic: 'LD', operands: 'SP, nn', size: 3, cycles: 10 },
  0x32: { mnemonic: 'LD', operands: '(nn), A', size: 3, cycles: 13 },
  0x33: { mnemonic: 'INC', operands: 'SP', size: 1, cycles: 6 },
  0x34: { mnemonic: 'INC', operands: '(HL)', size: 1, cycles: 11 },
  0x35: { mnemonic: 'DEC', operands: '(HL)', size: 1, cycles: 11 },
  0x36: { mnemonic: 'LD', operands: '(HL), n', size: 2, cycles: 10 },
  0x37: { mnemonic: 'SCF', operands: '', size: 1, cycles: 4 },
  0x38: { mnemonic: 'JR', operands: 'C, e', size: 2, cycles: 12 },
  0x39: { mnemonic: 'ADD', operands: 'HL, SP', size: 1, cycles: 11 },
  0x3A: { mnemonic: 'LD', operands: 'A, (nn)', size: 3, cycles: 13 },
  0x3B: { mnemonic: 'DEC', operands: 'SP', size: 1, cycles: 6 },
  0x3C: { mnemonic: 'INC', operands: 'A', size: 1, cycles: 4 },
  0x3D: { mnemonic: 'DEC', operands: 'A', size: 1, cycles: 4 },
  0x3E: { mnemonic: 'LD', operands: 'A, n', size: 2, cycles: 7 },
  0x3F: { mnemonic: 'CCF', operands: '', size: 1, cycles: 4 },

  // LD r, r' group (0x40-0x7F except 0x76 which is HALT)
  0x40: { mnemonic: 'LD', operands: 'B, B', size: 1, cycles: 4 },
  0x41: { mnemonic: 'LD', operands: 'B, C', size: 1, cycles: 4 },
  0x42: { mnemonic: 'LD', operands: 'B, D', size: 1, cycles: 4 },
  0x43: { mnemonic: 'LD', operands: 'B, E', size: 1, cycles: 4 },
  0x44: { mnemonic: 'LD', operands: 'B, H', size: 1, cycles: 4 },
  0x45: { mnemonic: 'LD', operands: 'B, L', size: 1, cycles: 4 },
  0x46: { mnemonic: 'LD', operands: 'B, (HL)', size: 1, cycles: 7 },
  0x47: { mnemonic: 'LD', operands: 'B, A', size: 1, cycles: 4 },
  0x48: { mnemonic: 'LD', operands: 'C, B', size: 1, cycles: 4 },
  0x49: { mnemonic: 'LD', operands: 'C, C', size: 1, cycles: 4 },
  0x4A: { mnemonic: 'LD', operands: 'C, D', size: 1, cycles: 4 },
  0x4B: { mnemonic: 'LD', operands: 'C, E', size: 1, cycles: 4 },
  0x4C: { mnemonic: 'LD', operands: 'C, H', size: 1, cycles: 4 },
  0x4D: { mnemonic: 'LD', operands: 'C, L', size: 1, cycles: 4 },
  0x4E: { mnemonic: 'LD', operands: 'C, (HL)', size: 1, cycles: 7 },
  0x4F: { mnemonic: 'LD', operands: 'C, A', size: 1, cycles: 4 },

  0x50: { mnemonic: 'LD', operands: 'D, B', size: 1, cycles: 4 },
  0x51: { mnemonic: 'LD', operands: 'D, C', size: 1, cycles: 4 },
  0x52: { mnemonic: 'LD', operands: 'D, D', size: 1, cycles: 4 },
  0x53: { mnemonic: 'LD', operands: 'D, E', size: 1, cycles: 4 },
  0x54: { mnemonic: 'LD', operands: 'D, H', size: 1, cycles: 4 },
  0x55: { mnemonic: 'LD', operands: 'D, L', size: 1, cycles: 4 },
  0x56: { mnemonic: 'LD', operands: 'D, (HL)', size: 1, cycles: 7 },
  0x57: { mnemonic: 'LD', operands: 'D, A', size: 1, cycles: 4 },
  0x58: { mnemonic: 'LD', operands: 'E, B', size: 1, cycles: 4 },
  0x59: { mnemonic: 'LD', operands: 'E, C', size: 1, cycles: 4 },
  0x5A: { mnemonic: 'LD', operands: 'E, D', size: 1, cycles: 4 },
  0x5B: { mnemonic: 'LD', operands: 'E, E', size: 1, cycles: 4 },
  0x5C: { mnemonic: 'LD', operands: 'E, H', size: 1, cycles: 4 },
  0x5D: { mnemonic: 'LD', operands: 'E, L', size: 1, cycles: 4 },
  0x5E: { mnemonic: 'LD', operands: 'E, (HL)', size: 1, cycles: 7 },
  0x5F: { mnemonic: 'LD', operands: 'E, A', size: 1, cycles: 4 },

  0x60: { mnemonic: 'LD', operands: 'H, B', size: 1, cycles: 4 },
  0x61: { mnemonic: 'LD', operands: 'H, C', size: 1, cycles: 4 },
  0x62: { mnemonic: 'LD', operands: 'H, D', size: 1, cycles: 4 },
  0x63: { mnemonic: 'LD', operands: 'H, E', size: 1, cycles: 4 },
  0x64: { mnemonic: 'LD', operands: 'H, H', size: 1, cycles: 4 },
  0x65: { mnemonic: 'LD', operands: 'H, L', size: 1, cycles: 4 },
  0x66: { mnemonic: 'LD', operands: 'H, (HL)', size: 1, cycles: 7 },
  0x67: { mnemonic: 'LD', operands: 'H, A', size: 1, cycles: 4 },
  0x68: { mnemonic: 'LD', operands: 'L, B', size: 1, cycles: 4 },
  0x69: { mnemonic: 'LD', operands: 'L, C', size: 1, cycles: 4 },
  0x6A: { mnemonic: 'LD', operands: 'L, D', size: 1, cycles: 4 },
  0x6B: { mnemonic: 'LD', operands: 'L, E', size: 1, cycles: 4 },
  0x6C: { mnemonic: 'LD', operands: 'L, H', size: 1, cycles: 4 },
  0x6D: { mnemonic: 'LD', operands: 'L, L', size: 1, cycles: 4 },
  0x6E: { mnemonic: 'LD', operands: 'L, (HL)', size: 1, cycles: 7 },
  0x6F: { mnemonic: 'LD', operands: 'L, A', size: 1, cycles: 4 },

  0x70: { mnemonic: 'LD', operands: '(HL), B', size: 1, cycles: 7 },
  0x71: { mnemonic: 'LD', operands: '(HL), C', size: 1, cycles: 7 },
  0x72: { mnemonic: 'LD', operands: '(HL), D', size: 1, cycles: 7 },
  0x73: { mnemonic: 'LD', operands: '(HL), E', size: 1, cycles: 7 },
  0x74: { mnemonic: 'LD', operands: '(HL), H', size: 1, cycles: 7 },
  0x75: { mnemonic: 'LD', operands: '(HL), L', size: 1, cycles: 7 },
  0x76: { mnemonic: 'HALT', operands: '', size: 1, cycles: 4 },
  0x77: { mnemonic: 'LD', operands: '(HL), A', size: 1, cycles: 7 },
  0x78: { mnemonic: 'LD', operands: 'A, B', size: 1, cycles: 4 },
  0x79: { mnemonic: 'LD', operands: 'A, C', size: 1, cycles: 4 },
  0x7A: { mnemonic: 'LD', operands: 'A, D', size: 1, cycles: 4 },
  0x7B: { mnemonic: 'LD', operands: 'A, E', size: 1, cycles: 4 },
  0x7C: { mnemonic: 'LD', operands: 'A, H', size: 1, cycles: 4 },
  0x7D: { mnemonic: 'LD', operands: 'A, L', size: 1, cycles: 4 },
  0x7E: { mnemonic: 'LD', operands: 'A, (HL)', size: 1, cycles: 7 },
  0x7F: { mnemonic: 'LD', operands: 'A, A', size: 1, cycles: 4 },

  // Arithmetic/Logic group (0x80-0xBF)
  0x80: { mnemonic: 'ADD', operands: 'A, B', size: 1, cycles: 4 },
  0x81: { mnemonic: 'ADD', operands: 'A, C', size: 1, cycles: 4 },
  0x82: { mnemonic: 'ADD', operands: 'A, D', size: 1, cycles: 4 },
  0x83: { mnemonic: 'ADD', operands: 'A, E', size: 1, cycles: 4 },
  0x84: { mnemonic: 'ADD', operands: 'A, H', size: 1, cycles: 4 },
  0x85: { mnemonic: 'ADD', operands: 'A, L', size: 1, cycles: 4 },
  0x86: { mnemonic: 'ADD', operands: 'A, (HL)', size: 1, cycles: 7 },
  0x87: { mnemonic: 'ADD', operands: 'A, A', size: 1, cycles: 4 },
  0x88: { mnemonic: 'ADC', operands: 'A, B', size: 1, cycles: 4 },
  0x89: { mnemonic: 'ADC', operands: 'A, C', size: 1, cycles: 4 },
  0x8A: { mnemonic: 'ADC', operands: 'A, D', size: 1, cycles: 4 },
  0x8B: { mnemonic: 'ADC', operands: 'A, E', size: 1, cycles: 4 },
  0x8C: { mnemonic: 'ADC', operands: 'A, H', size: 1, cycles: 4 },
  0x8D: { mnemonic: 'ADC', operands: 'A, L', size: 1, cycles: 4 },
  0x8E: { mnemonic: 'ADC', operands: 'A, (HL)', size: 1, cycles: 7 },
  0x8F: { mnemonic: 'ADC', operands: 'A, A', size: 1, cycles: 4 },

  0x90: { mnemonic: 'SUB', operands: 'B', size: 1, cycles: 4 },
  0x91: { mnemonic: 'SUB', operands: 'C', size: 1, cycles: 4 },
  0x92: { mnemonic: 'SUB', operands: 'D', size: 1, cycles: 4 },
  0x93: { mnemonic: 'SUB', operands: 'E', size: 1, cycles: 4 },
  0x94: { mnemonic: 'SUB', operands: 'H', size: 1, cycles: 4 },
  0x95: { mnemonic: 'SUB', operands: 'L', size: 1, cycles: 4 },
  0x96: { mnemonic: 'SUB', operands: '(HL)', size: 1, cycles: 7 },
  0x97: { mnemonic: 'SUB', operands: 'A', size: 1, cycles: 4 },
  0x98: { mnemonic: 'SBC', operands: 'A, B', size: 1, cycles: 4 },
  0x99: { mnemonic: 'SBC', operands: 'A, C', size: 1, cycles: 4 },
  0x9A: { mnemonic: 'SBC', operands: 'A, D', size: 1, cycles: 4 },
  0x9B: { mnemonic: 'SBC', operands: 'A, E', size: 1, cycles: 4 },
  0x9C: { mnemonic: 'SBC', operands: 'A, H', size: 1, cycles: 4 },
  0x9D: { mnemonic: 'SBC', operands: 'A, L', size: 1, cycles: 4 },
  0x9E: { mnemonic: 'SBC', operands: 'A, (HL)', size: 1, cycles: 7 },
  0x9F: { mnemonic: 'SBC', operands: 'A, A', size: 1, cycles: 4 },

  0xA0: { mnemonic: 'AND', operands: 'B', size: 1, cycles: 4 },
  0xA1: { mnemonic: 'AND', operands: 'C', size: 1, cycles: 4 },
  0xA2: { mnemonic: 'AND', operands: 'D', size: 1, cycles: 4 },
  0xA3: { mnemonic: 'AND', operands: 'E', size: 1, cycles: 4 },
  0xA4: { mnemonic: 'AND', operands: 'H', size: 1, cycles: 4 },
  0xA5: { mnemonic: 'AND', operands: 'L', size: 1, cycles: 4 },
  0xA6: { mnemonic: 'AND', operands: '(HL)', size: 1, cycles: 7 },
  0xA7: { mnemonic: 'AND', operands: 'A', size: 1, cycles: 4 },
  0xA8: { mnemonic: 'XOR', operands: 'B', size: 1, cycles: 4 },
  0xA9: { mnemonic: 'XOR', operands: 'C', size: 1, cycles: 4 },
  0xAA: { mnemonic: 'XOR', operands: 'D', size: 1, cycles: 4 },
  0xAB: { mnemonic: 'XOR', operands: 'E', size: 1, cycles: 4 },
  0xAC: { mnemonic: 'XOR', operands: 'H', size: 1, cycles: 4 },
  0xAD: { mnemonic: 'XOR', operands: 'L', size: 1, cycles: 4 },
  0xAE: { mnemonic: 'XOR', operands: '(HL)', size: 1, cycles: 7 },
  0xAF: { mnemonic: 'XOR', operands: 'A', size: 1, cycles: 4 },

  0xB0: { mnemonic: 'OR', operands: 'B', size: 1, cycles: 4 },
  0xB1: { mnemonic: 'OR', operands: 'C', size: 1, cycles: 4 },
  0xB2: { mnemonic: 'OR', operands: 'D', size: 1, cycles: 4 },
  0xB3: { mnemonic: 'OR', operands: 'E', size: 1, cycles: 4 },
  0xB4: { mnemonic: 'OR', operands: 'H', size: 1, cycles: 4 },
  0xB5: { mnemonic: 'OR', operands: 'L', size: 1, cycles: 4 },
  0xB6: { mnemonic: 'OR', operands: '(HL)', size: 1, cycles: 7 },
  0xB7: { mnemonic: 'OR', operands: 'A', size: 1, cycles: 4 },
  0xB8: { mnemonic: 'CP', operands: 'B', size: 1, cycles: 4 },
  0xB9: { mnemonic: 'CP', operands: 'C', size: 1, cycles: 4 },
  0xBA: { mnemonic: 'CP', operands: 'D', size: 1, cycles: 4 },
  0xBB: { mnemonic: 'CP', operands: 'E', size: 1, cycles: 4 },
  0xBC: { mnemonic: 'CP', operands: 'H', size: 1, cycles: 4 },
  0xBD: { mnemonic: 'CP', operands: 'L', size: 1, cycles: 4 },
  0xBE: { mnemonic: 'CP', operands: '(HL)', size: 1, cycles: 7 },
  0xBF: { mnemonic: 'CP', operands: 'A', size: 1, cycles: 4 },

  // Control/Misc group (0xC0-0xFF)
  0xC0: { mnemonic: 'RET', operands: 'NZ', size: 1, cycles: 11 },
  0xC1: { mnemonic: 'POP', operands: 'BC', size: 1, cycles: 10 },
  0xC2: { mnemonic: 'JP', operands: 'NZ, nn', size: 3, cycles: 10 },
  0xC3: { mnemonic: 'JP', operands: 'nn', size: 3, cycles: 10 },
  0xC4: { mnemonic: 'CALL', operands: 'NZ, nn', size: 3, cycles: 17 },
  0xC5: { mnemonic: 'PUSH', operands: 'BC', size: 1, cycles: 11 },
  0xC6: { mnemonic: 'ADD', operands: 'A, n', size: 2, cycles: 7 },
  0xC7: { mnemonic: 'RST', operands: '00H', size: 1, cycles: 11 },
  0xC8: { mnemonic: 'RET', operands: 'Z', size: 1, cycles: 11 },
  0xC9: { mnemonic: 'RET', operands: '', size: 1, cycles: 10 },
  0xCA: { mnemonic: 'JP', operands: 'Z, nn', size: 3, cycles: 10 },
  0xCB: { mnemonic: 'PREFIX', operands: 'CB', size: 1, cycles: 0 }, // CB prefix
  0xCC: { mnemonic: 'CALL', operands: 'Z, nn', size: 3, cycles: 17 },
  0xCD: { mnemonic: 'CALL', operands: 'nn', size: 3, cycles: 17 },
  0xCE: { mnemonic: 'ADC', operands: 'A, n', size: 2, cycles: 7 },
  0xCF: { mnemonic: 'RST', operands: '08H', size: 1, cycles: 11 },

  0xD0: { mnemonic: 'RET', operands: 'NC', size: 1, cycles: 11 },
  0xD1: { mnemonic: 'POP', operands: 'DE', size: 1, cycles: 10 },
  0xD2: { mnemonic: 'JP', operands: 'NC, nn', size: 3, cycles: 10 },
  0xD3: { mnemonic: 'OUT', operands: '(n), A', size: 2, cycles: 11 },
  0xD4: { mnemonic: 'CALL', operands: 'NC, nn', size: 3, cycles: 17 },
  0xD5: { mnemonic: 'PUSH', operands: 'DE', size: 1, cycles: 11 },
  0xD6: { mnemonic: 'SUB', operands: 'n', size: 2, cycles: 7 },
  0xD7: { mnemonic: 'RST', operands: '10H', size: 1, cycles: 11 },
  0xD8: { mnemonic: 'RET', operands: 'C', size: 1, cycles: 11 },
  0xD9: { mnemonic: 'EXX', operands: '', size: 1, cycles: 4 },
  0xDA: { mnemonic: 'JP', operands: 'C, nn', size: 3, cycles: 10 },
  0xDB: { mnemonic: 'IN', operands: 'A, (n)', size: 2, cycles: 11 },
  0xDC: { mnemonic: 'CALL', operands: 'C, nn', size: 3, cycles: 17 },
  0xDD: { mnemonic: 'PREFIX', operands: 'DD', size: 1, cycles: 0 }, // DD prefix (IX)
  0xDE: { mnemonic: 'SBC', operands: 'A, n', size: 2, cycles: 7 },
  0xDF: { mnemonic: 'RST', operands: '18H', size: 1, cycles: 11 },

  0xE0: { mnemonic: 'RET', operands: 'PO', size: 1, cycles: 11 },
  0xE1: { mnemonic: 'POP', operands: 'HL', size: 1, cycles: 10 },
  0xE2: { mnemonic: 'JP', operands: 'PO, nn', size: 3, cycles: 10 },
  0xE3: { mnemonic: 'EX', operands: '(SP), HL', size: 1, cycles: 19 },
  0xE4: { mnemonic: 'CALL', operands: 'PO, nn', size: 3, cycles: 17 },
  0xE5: { mnemonic: 'PUSH', operands: 'HL', size: 1, cycles: 11 },
  0xE6: { mnemonic: 'AND', operands: 'n', size: 2, cycles: 7 },
  0xE7: { mnemonic: 'RST', operands: '20H', size: 1, cycles: 11 },
  0xE8: { mnemonic: 'RET', operands: 'PE', size: 1, cycles: 11 },
  0xE9: { mnemonic: 'JP', operands: '(HL)', size: 1, cycles: 4 },
  0xEA: { mnemonic: 'JP', operands: 'PE, nn', size: 3, cycles: 10 },
  0xEB: { mnemonic: 'EX', operands: 'DE, HL', size: 1, cycles: 4 },
  0xEC: { mnemonic: 'CALL', operands: 'PE, nn', size: 3, cycles: 17 },
  0xED: { mnemonic: 'PREFIX', operands: 'ED', size: 1, cycles: 0 }, // ED prefix
  0xEE: { mnemonic: 'XOR', operands: 'n', size: 2, cycles: 7 },
  0xEF: { mnemonic: 'RST', operands: '28H', size: 1, cycles: 11 },

  0xF0: { mnemonic: 'RET', operands: 'P', size: 1, cycles: 11 },
  0xF1: { mnemonic: 'POP', operands: 'AF', size: 1, cycles: 10 },
  0xF2: { mnemonic: 'JP', operands: 'P, nn', size: 3, cycles: 10 },
  0xF3: { mnemonic: 'DI', operands: '', size: 1, cycles: 4 },
  0xF4: { mnemonic: 'CALL', operands: 'P, nn', size: 3, cycles: 17 },
  0xF5: { mnemonic: 'PUSH', operands: 'AF', size: 1, cycles: 11 },
  0xF6: { mnemonic: 'OR', operands: 'n', size: 2, cycles: 7 },
  0xF7: { mnemonic: 'RST', operands: '30H', size: 1, cycles: 11 },
  0xF8: { mnemonic: 'RET', operands: 'M', size: 1, cycles: 11 },
  0xF9: { mnemonic: 'LD', operands: 'SP, HL', size: 1, cycles: 6 },
  0xFA: { mnemonic: 'JP', operands: 'M, nn', size: 3, cycles: 10 },
  0xFB: { mnemonic: 'EI', operands: '', size: 1, cycles: 4 },
  0xFC: { mnemonic: 'CALL', operands: 'M, nn', size: 3, cycles: 17 },
  0xFD: { mnemonic: 'PREFIX', operands: 'FD', size: 1, cycles: 0 }, // FD prefix (IY)
  0xFE: { mnemonic: 'CP', operands: 'n', size: 2, cycles: 7 },
  0xFF: { mnemonic: 'RST', operands: '38H', size: 1, cycles: 11 },
};

// CB prefix opcodes (bit manipulation)
const CB_OPCODES: { [opcode: number]: OpcodeEntry } = {};

// Generate CB prefix opcodes
const CB_REGS = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const CB_OPS = [
  { base: 0x00, mnemonic: 'RLC', cycles: 8, hlCycles: 15 },
  { base: 0x08, mnemonic: 'RRC', cycles: 8, hlCycles: 15 },
  { base: 0x10, mnemonic: 'RL', cycles: 8, hlCycles: 15 },
  { base: 0x18, mnemonic: 'RR', cycles: 8, hlCycles: 15 },
  { base: 0x20, mnemonic: 'SLA', cycles: 8, hlCycles: 15 },
  { base: 0x28, mnemonic: 'SRA', cycles: 8, hlCycles: 15 },
  { base: 0x30, mnemonic: 'SLL', cycles: 8, hlCycles: 15 }, // Undocumented
  { base: 0x38, mnemonic: 'SRL', cycles: 8, hlCycles: 15 },
];

CB_OPS.forEach(op => {
  CB_REGS.forEach((reg, i) => {
    const opcode = op.base + i;
    CB_OPCODES[opcode] = {
      mnemonic: op.mnemonic,
      operands: reg,
      size: 2,
      cycles: reg === '(HL)' ? op.hlCycles : op.cycles
    };
  });
});

// BIT, RES, SET instructions
for (let bit = 0; bit < 8; bit++) {
  CB_REGS.forEach((reg, i) => {
    const bitOpcode = 0x40 + (bit * 8) + i;
    const resOpcode = 0x80 + (bit * 8) + i;
    const setOpcode = 0xC0 + (bit * 8) + i;

    CB_OPCODES[bitOpcode] = {
      mnemonic: 'BIT',
      operands: `${bit}, ${reg}`,
      size: 2,
      cycles: reg === '(HL)' ? 12 : 8
    };
    CB_OPCODES[resOpcode] = {
      mnemonic: 'RES',
      operands: `${bit}, ${reg}`,
      size: 2,
      cycles: reg === '(HL)' ? 15 : 8
    };
    CB_OPCODES[setOpcode] = {
      mnemonic: 'SET',
      operands: `${bit}, ${reg}`,
      size: 2,
      cycles: reg === '(HL)' ? 15 : 8
    };
  });
}

// ED prefix opcodes (extended instructions)
const ED_OPCODES: { [opcode: number]: OpcodeEntry } = {
  0x40: { mnemonic: 'IN', operands: 'B, (C)', size: 2, cycles: 12 },
  0x41: { mnemonic: 'OUT', operands: '(C), B', size: 2, cycles: 12 },
  0x42: { mnemonic: 'SBC', operands: 'HL, BC', size: 2, cycles: 15 },
  0x43: { mnemonic: 'LD', operands: '(nn), BC', size: 4, cycles: 20 },
  0x44: { mnemonic: 'NEG', operands: '', size: 2, cycles: 8 },
  0x45: { mnemonic: 'RETN', operands: '', size: 2, cycles: 14 },
  0x46: { mnemonic: 'IM', operands: '0', size: 2, cycles: 8 },
  0x47: { mnemonic: 'LD', operands: 'I, A', size: 2, cycles: 9 },
  0x48: { mnemonic: 'IN', operands: 'C, (C)', size: 2, cycles: 12 },
  0x49: { mnemonic: 'OUT', operands: '(C), C', size: 2, cycles: 12 },
  0x4A: { mnemonic: 'ADC', operands: 'HL, BC', size: 2, cycles: 15 },
  0x4B: { mnemonic: 'LD', operands: 'BC, (nn)', size: 4, cycles: 20 },
  0x4C: { mnemonic: 'NEG', operands: '', size: 2, cycles: 8 }, // Undocumented
  0x4D: { mnemonic: 'RETI', operands: '', size: 2, cycles: 14 },
  0x4E: { mnemonic: 'IM', operands: '0', size: 2, cycles: 8 }, // Undocumented
  0x4F: { mnemonic: 'LD', operands: 'R, A', size: 2, cycles: 9 },

  0x50: { mnemonic: 'IN', operands: 'D, (C)', size: 2, cycles: 12 },
  0x51: { mnemonic: 'OUT', operands: '(C), D', size: 2, cycles: 12 },
  0x52: { mnemonic: 'SBC', operands: 'HL, DE', size: 2, cycles: 15 },
  0x53: { mnemonic: 'LD', operands: '(nn), DE', size: 4, cycles: 20 },
  0x54: { mnemonic: 'NEG', operands: '', size: 2, cycles: 8 }, // Undocumented
  0x55: { mnemonic: 'RETN', operands: '', size: 2, cycles: 14 }, // Undocumented
  0x56: { mnemonic: 'IM', operands: '1', size: 2, cycles: 8 },
  0x57: { mnemonic: 'LD', operands: 'A, I', size: 2, cycles: 9 },
  0x58: { mnemonic: 'IN', operands: 'E, (C)', size: 2, cycles: 12 },
  0x59: { mnemonic: 'OUT', operands: '(C), E', size: 2, cycles: 12 },
  0x5A: { mnemonic: 'ADC', operands: 'HL, DE', size: 2, cycles: 15 },
  0x5B: { mnemonic: 'LD', operands: 'DE, (nn)', size: 4, cycles: 20 },
  0x5C: { mnemonic: 'NEG', operands: '', size: 2, cycles: 8 }, // Undocumented
  0x5D: { mnemonic: 'RETN', operands: '', size: 2, cycles: 14 }, // Undocumented
  0x5E: { mnemonic: 'IM', operands: '2', size: 2, cycles: 8 },
  0x5F: { mnemonic: 'LD', operands: 'A, R', size: 2, cycles: 9 },

  0x60: { mnemonic: 'IN', operands: 'H, (C)', size: 2, cycles: 12 },
  0x61: { mnemonic: 'OUT', operands: '(C), H', size: 2, cycles: 12 },
  0x62: { mnemonic: 'SBC', operands: 'HL, HL', size: 2, cycles: 15 },
  0x63: { mnemonic: 'LD', operands: '(nn), HL', size: 4, cycles: 20 },
  0x64: { mnemonic: 'NEG', operands: '', size: 2, cycles: 8 }, // Undocumented
  0x65: { mnemonic: 'RETN', operands: '', size: 2, cycles: 14 }, // Undocumented
  0x66: { mnemonic: 'IM', operands: '0', size: 2, cycles: 8 }, // Undocumented
  0x67: { mnemonic: 'RRD', operands: '', size: 2, cycles: 18 },
  0x68: { mnemonic: 'IN', operands: 'L, (C)', size: 2, cycles: 12 },
  0x69: { mnemonic: 'OUT', operands: '(C), L', size: 2, cycles: 12 },
  0x6A: { mnemonic: 'ADC', operands: 'HL, HL', size: 2, cycles: 15 },
  0x6B: { mnemonic: 'LD', operands: 'HL, (nn)', size: 4, cycles: 20 },
  0x6C: { mnemonic: 'NEG', operands: '', size: 2, cycles: 8 }, // Undocumented
  0x6D: { mnemonic: 'RETN', operands: '', size: 2, cycles: 14 }, // Undocumented
  0x6E: { mnemonic: 'IM', operands: '0', size: 2, cycles: 8 }, // Undocumented
  0x6F: { mnemonic: 'RLD', operands: '', size: 2, cycles: 18 },

  0x70: { mnemonic: 'IN', operands: '(C)', size: 2, cycles: 12 }, // Undocumented - affects flags only
  0x71: { mnemonic: 'OUT', operands: '(C), 0', size: 2, cycles: 12 }, // Undocumented
  0x72: { mnemonic: 'SBC', operands: 'HL, SP', size: 2, cycles: 15 },
  0x73: { mnemonic: 'LD', operands: '(nn), SP', size: 4, cycles: 20 },
  0x74: { mnemonic: 'NEG', operands: '', size: 2, cycles: 8 }, // Undocumented
  0x75: { mnemonic: 'RETN', operands: '', size: 2, cycles: 14 }, // Undocumented
  0x76: { mnemonic: 'IM', operands: '1', size: 2, cycles: 8 }, // Undocumented
  0x78: { mnemonic: 'IN', operands: 'A, (C)', size: 2, cycles: 12 },
  0x79: { mnemonic: 'OUT', operands: '(C), A', size: 2, cycles: 12 },
  0x7A: { mnemonic: 'ADC', operands: 'HL, SP', size: 2, cycles: 15 },
  0x7B: { mnemonic: 'LD', operands: 'SP, (nn)', size: 4, cycles: 20 },
  0x7C: { mnemonic: 'NEG', operands: '', size: 2, cycles: 8 }, // Undocumented
  0x7D: { mnemonic: 'RETN', operands: '', size: 2, cycles: 14 }, // Undocumented
  0x7E: { mnemonic: 'IM', operands: '2', size: 2, cycles: 8 }, // Undocumented

  // Block transfer and search
  0xA0: { mnemonic: 'LDI', operands: '', size: 2, cycles: 16 },
  0xA1: { mnemonic: 'CPI', operands: '', size: 2, cycles: 16 },
  0xA2: { mnemonic: 'INI', operands: '', size: 2, cycles: 16 },
  0xA3: { mnemonic: 'OUTI', operands: '', size: 2, cycles: 16 },
  0xA8: { mnemonic: 'LDD', operands: '', size: 2, cycles: 16 },
  0xA9: { mnemonic: 'CPD', operands: '', size: 2, cycles: 16 },
  0xAA: { mnemonic: 'IND', operands: '', size: 2, cycles: 16 },
  0xAB: { mnemonic: 'OUTD', operands: '', size: 2, cycles: 16 },
  0xB0: { mnemonic: 'LDIR', operands: '', size: 2, cycles: 21 },
  0xB1: { mnemonic: 'CPIR', operands: '', size: 2, cycles: 21 },
  0xB2: { mnemonic: 'INIR', operands: '', size: 2, cycles: 21 },
  0xB3: { mnemonic: 'OTIR', operands: '', size: 2, cycles: 21 },
  0xB8: { mnemonic: 'LDDR', operands: '', size: 2, cycles: 21 },
  0xB9: { mnemonic: 'CPDR', operands: '', size: 2, cycles: 21 },
  0xBA: { mnemonic: 'INDR', operands: '', size: 2, cycles: 21 },
  0xBB: { mnemonic: 'OTDR', operands: '', size: 2, cycles: 21 },
};

// DD prefix opcodes (IX register) - base entries, displacement handled in decoder
const DD_OPCODES: { [opcode: number]: OpcodeEntry } = {
  0x09: { mnemonic: 'ADD', operands: 'IX, BC', size: 2, cycles: 15 },
  0x19: { mnemonic: 'ADD', operands: 'IX, DE', size: 2, cycles: 15 },
  0x21: { mnemonic: 'LD', operands: 'IX, nn', size: 4, cycles: 14 },
  0x22: { mnemonic: 'LD', operands: '(nn), IX', size: 4, cycles: 20 },
  0x23: { mnemonic: 'INC', operands: 'IX', size: 2, cycles: 10 },
  0x24: { mnemonic: 'INC', operands: 'IXH', size: 2, cycles: 8 },
  0x25: { mnemonic: 'DEC', operands: 'IXH', size: 2, cycles: 8 },
  0x26: { mnemonic: 'LD', operands: 'IXH, n', size: 3, cycles: 11 },
  0x29: { mnemonic: 'ADD', operands: 'IX, IX', size: 2, cycles: 15 },
  0x2A: { mnemonic: 'LD', operands: 'IX, (nn)', size: 4, cycles: 20 },
  0x2B: { mnemonic: 'DEC', operands: 'IX', size: 2, cycles: 10 },
  0x2C: { mnemonic: 'INC', operands: 'IXL', size: 2, cycles: 8 },
  0x2D: { mnemonic: 'DEC', operands: 'IXL', size: 2, cycles: 8 },
  0x2E: { mnemonic: 'LD', operands: 'IXL, n', size: 3, cycles: 11 },
  0x34: { mnemonic: 'INC', operands: '(IX+d)', size: 3, cycles: 23 },
  0x35: { mnemonic: 'DEC', operands: '(IX+d)', size: 3, cycles: 23 },
  0x36: { mnemonic: 'LD', operands: '(IX+d), n', size: 4, cycles: 19 },
  0x39: { mnemonic: 'ADD', operands: 'IX, SP', size: 2, cycles: 15 },

  0x44: { mnemonic: 'LD', operands: 'B, IXH', size: 2, cycles: 8 },
  0x45: { mnemonic: 'LD', operands: 'B, IXL', size: 2, cycles: 8 },
  0x46: { mnemonic: 'LD', operands: 'B, (IX+d)', size: 3, cycles: 19 },
  0x4C: { mnemonic: 'LD', operands: 'C, IXH', size: 2, cycles: 8 },
  0x4D: { mnemonic: 'LD', operands: 'C, IXL', size: 2, cycles: 8 },
  0x4E: { mnemonic: 'LD', operands: 'C, (IX+d)', size: 3, cycles: 19 },
  0x54: { mnemonic: 'LD', operands: 'D, IXH', size: 2, cycles: 8 },
  0x55: { mnemonic: 'LD', operands: 'D, IXL', size: 2, cycles: 8 },
  0x56: { mnemonic: 'LD', operands: 'D, (IX+d)', size: 3, cycles: 19 },
  0x5C: { mnemonic: 'LD', operands: 'E, IXH', size: 2, cycles: 8 },
  0x5D: { mnemonic: 'LD', operands: 'E, IXL', size: 2, cycles: 8 },
  0x5E: { mnemonic: 'LD', operands: 'E, (IX+d)', size: 3, cycles: 19 },

  0x60: { mnemonic: 'LD', operands: 'IXH, B', size: 2, cycles: 8 },
  0x61: { mnemonic: 'LD', operands: 'IXH, C', size: 2, cycles: 8 },
  0x62: { mnemonic: 'LD', operands: 'IXH, D', size: 2, cycles: 8 },
  0x63: { mnemonic: 'LD', operands: 'IXH, E', size: 2, cycles: 8 },
  0x64: { mnemonic: 'LD', operands: 'IXH, IXH', size: 2, cycles: 8 },
  0x65: { mnemonic: 'LD', operands: 'IXH, IXL', size: 2, cycles: 8 },
  0x66: { mnemonic: 'LD', operands: 'H, (IX+d)', size: 3, cycles: 19 },
  0x67: { mnemonic: 'LD', operands: 'IXH, A', size: 2, cycles: 8 },
  0x68: { mnemonic: 'LD', operands: 'IXL, B', size: 2, cycles: 8 },
  0x69: { mnemonic: 'LD', operands: 'IXL, C', size: 2, cycles: 8 },
  0x6A: { mnemonic: 'LD', operands: 'IXL, D', size: 2, cycles: 8 },
  0x6B: { mnemonic: 'LD', operands: 'IXL, E', size: 2, cycles: 8 },
  0x6C: { mnemonic: 'LD', operands: 'IXL, IXH', size: 2, cycles: 8 },
  0x6D: { mnemonic: 'LD', operands: 'IXL, IXL', size: 2, cycles: 8 },
  0x6E: { mnemonic: 'LD', operands: 'L, (IX+d)', size: 3, cycles: 19 },
  0x6F: { mnemonic: 'LD', operands: 'IXL, A', size: 2, cycles: 8 },

  0x70: { mnemonic: 'LD', operands: '(IX+d), B', size: 3, cycles: 19 },
  0x71: { mnemonic: 'LD', operands: '(IX+d), C', size: 3, cycles: 19 },
  0x72: { mnemonic: 'LD', operands: '(IX+d), D', size: 3, cycles: 19 },
  0x73: { mnemonic: 'LD', operands: '(IX+d), E', size: 3, cycles: 19 },
  0x74: { mnemonic: 'LD', operands: '(IX+d), H', size: 3, cycles: 19 },
  0x75: { mnemonic: 'LD', operands: '(IX+d), L', size: 3, cycles: 19 },
  0x77: { mnemonic: 'LD', operands: '(IX+d), A', size: 3, cycles: 19 },
  0x7C: { mnemonic: 'LD', operands: 'A, IXH', size: 2, cycles: 8 },
  0x7D: { mnemonic: 'LD', operands: 'A, IXL', size: 2, cycles: 8 },
  0x7E: { mnemonic: 'LD', operands: 'A, (IX+d)', size: 3, cycles: 19 },

  0x84: { mnemonic: 'ADD', operands: 'A, IXH', size: 2, cycles: 8 },
  0x85: { mnemonic: 'ADD', operands: 'A, IXL', size: 2, cycles: 8 },
  0x86: { mnemonic: 'ADD', operands: 'A, (IX+d)', size: 3, cycles: 19 },
  0x8C: { mnemonic: 'ADC', operands: 'A, IXH', size: 2, cycles: 8 },
  0x8D: { mnemonic: 'ADC', operands: 'A, IXL', size: 2, cycles: 8 },
  0x8E: { mnemonic: 'ADC', operands: 'A, (IX+d)', size: 3, cycles: 19 },
  0x94: { mnemonic: 'SUB', operands: 'IXH', size: 2, cycles: 8 },
  0x95: { mnemonic: 'SUB', operands: 'IXL', size: 2, cycles: 8 },
  0x96: { mnemonic: 'SUB', operands: '(IX+d)', size: 3, cycles: 19 },
  0x9C: { mnemonic: 'SBC', operands: 'A, IXH', size: 2, cycles: 8 },
  0x9D: { mnemonic: 'SBC', operands: 'A, IXL', size: 2, cycles: 8 },
  0x9E: { mnemonic: 'SBC', operands: 'A, (IX+d)', size: 3, cycles: 19 },
  0xA4: { mnemonic: 'AND', operands: 'IXH', size: 2, cycles: 8 },
  0xA5: { mnemonic: 'AND', operands: 'IXL', size: 2, cycles: 8 },
  0xA6: { mnemonic: 'AND', operands: '(IX+d)', size: 3, cycles: 19 },
  0xAC: { mnemonic: 'XOR', operands: 'IXH', size: 2, cycles: 8 },
  0xAD: { mnemonic: 'XOR', operands: 'IXL', size: 2, cycles: 8 },
  0xAE: { mnemonic: 'XOR', operands: '(IX+d)', size: 3, cycles: 19 },
  0xB4: { mnemonic: 'OR', operands: 'IXH', size: 2, cycles: 8 },
  0xB5: { mnemonic: 'OR', operands: 'IXL', size: 2, cycles: 8 },
  0xB6: { mnemonic: 'OR', operands: '(IX+d)', size: 3, cycles: 19 },
  0xBC: { mnemonic: 'CP', operands: 'IXH', size: 2, cycles: 8 },
  0xBD: { mnemonic: 'CP', operands: 'IXL', size: 2, cycles: 8 },
  0xBE: { mnemonic: 'CP', operands: '(IX+d)', size: 3, cycles: 19 },

  0xCB: { mnemonic: 'PREFIX', operands: 'DDCB', size: 2, cycles: 0 }, // DD CB prefix
  0xE1: { mnemonic: 'POP', operands: 'IX', size: 2, cycles: 14 },
  0xE3: { mnemonic: 'EX', operands: '(SP), IX', size: 2, cycles: 23 },
  0xE5: { mnemonic: 'PUSH', operands: 'IX', size: 2, cycles: 15 },
  0xE9: { mnemonic: 'JP', operands: '(IX)', size: 2, cycles: 8 },
  0xF9: { mnemonic: 'LD', operands: 'SP, IX', size: 2, cycles: 10 },
};

// FD prefix opcodes (IY register) - same structure as DD but with IY
const FD_OPCODES: { [opcode: number]: OpcodeEntry } = {};

// Generate FD opcodes by copying DD opcodes and replacing IX with IY
Object.entries(DD_OPCODES).forEach(([key, entry]) => {
  FD_OPCODES[parseInt(key)] = {
    ...entry,
    operands: entry.operands.replace(/IX/g, 'IY')
  };
});

// DD CB and FD CB prefix opcodes (indexed bit operations)
// Format: DD CB d op or FD CB d op
// These are 4-byte instructions where d is the displacement
const DDCB_OPCODES: { [opcode: number]: OpcodeEntry } = {};
const FDCB_OPCODES: { [opcode: number]: OpcodeEntry } = {};

// Generate indexed bit operations
const IX_CB_OPS = [
  { base: 0x00, mnemonic: 'RLC' },
  { base: 0x08, mnemonic: 'RRC' },
  { base: 0x10, mnemonic: 'RL' },
  { base: 0x18, mnemonic: 'RR' },
  { base: 0x20, mnemonic: 'SLA' },
  { base: 0x28, mnemonic: 'SRA' },
  { base: 0x30, mnemonic: 'SLL' },
  { base: 0x38, mnemonic: 'SRL' },
];

// Rotation/shift with (IX+d)
IX_CB_OPS.forEach(op => {
  DDCB_OPCODES[op.base + 6] = {
    mnemonic: op.mnemonic,
    operands: '(IX+d)',
    size: 4,
    cycles: 23
  };
  FDCB_OPCODES[op.base + 6] = {
    mnemonic: op.mnemonic,
    operands: '(IY+d)',
    size: 4,
    cycles: 23
  };
});

// BIT, RES, SET with (IX+d) / (IY+d)
for (let bit = 0; bit < 8; bit++) {
  const bitOpcode = 0x46 + (bit * 8);
  const resOpcode = 0x86 + (bit * 8);
  const setOpcode = 0xC6 + (bit * 8);

  DDCB_OPCODES[bitOpcode] = {
    mnemonic: 'BIT',
    operands: `${bit}, (IX+d)`,
    size: 4,
    cycles: 20
  };
  DDCB_OPCODES[resOpcode] = {
    mnemonic: 'RES',
    operands: `${bit}, (IX+d)`,
    size: 4,
    cycles: 23
  };
  DDCB_OPCODES[setOpcode] = {
    mnemonic: 'SET',
    operands: `${bit}, (IX+d)`,
    size: 4,
    cycles: 23
  };

  FDCB_OPCODES[bitOpcode] = {
    mnemonic: 'BIT',
    operands: `${bit}, (IY+d)`,
    size: 4,
    cycles: 20
  };
  FDCB_OPCODES[resOpcode] = {
    mnemonic: 'RES',
    operands: `${bit}, (IY+d)`,
    size: 4,
    cycles: 23
  };
  FDCB_OPCODES[setOpcode] = {
    mnemonic: 'SET',
    operands: `${bit}, (IY+d)`,
    size: 4,
    cycles: 23
  };
}

// Helper: Format a byte as hex
const toHex = (value: number, digits: number = 2): string => {
  return value.toString(16).toUpperCase().padStart(digits, '0');
};

// Helper: Format signed displacement
const formatDisplacement = (d: number): string => {
  const signed = d > 127 ? d - 256 : d;
  if (signed >= 0) {
    return `+$${toHex(signed)}`;
  } else {
    return `-$${toHex(-signed)}`;
  }
};

// Helper: Calculate relative jump target
const calculateRelativeTarget = (address: number, offset: number, instrSize: number): number => {
  const signed = offset > 127 ? offset - 256 : offset;
  return (address + instrSize + signed) & 0xFFFF;
};

// Replace placeholders with actual values
const resolveOperands = (
  template: string,
  bytes: number[],
  address: number,
  prefixSize: number = 0
): string => {
  let result = template;

  // nn = 16-bit immediate (little endian)
  if (result.includes('nn')) {
    const lowIdx = prefixSize + 1;
    const highIdx = prefixSize + 2;
    if (bytes.length > highIdx) {
      const value = bytes[lowIdx] | (bytes[highIdx] << 8);
      result = result.replace('nn', `$${toHex(value, 4)}`);
    }
  }

  // n = 8-bit immediate
  if (result.includes(', n') || result.endsWith(' n') || result === 'n') {
    const idx = prefixSize + 1;
    if (bytes.length > idx) {
      result = result.replace(/\bn\b/, `$${toHex(bytes[idx])}`);
    }
  }

  // d = displacement for indexed addressing (IX+d, IY+d)
  if (result.includes('+d)')) {
    const idx = prefixSize + 1;
    if (bytes.length > idx) {
      const disp = formatDisplacement(bytes[idx]);
      result = result.replace('+d)', disp + ')');
    }
  }

  // e = relative jump offset
  if (result.includes(' e') || result.endsWith(', e')) {
    const idx = prefixSize + 1;
    if (bytes.length > idx) {
      const target = calculateRelativeTarget(address, bytes[idx], bytes.length);
      result = result.replace(/\be\b/, `$${toHex(target, 4)}`);
    }
  }

  return result;
};

/**
 * Disassemble a single instruction at the given address
 */
export const disassembleInstruction = (
  romReader: (address: number) => number,
  address: number
): DisassembledInstruction => {
  const firstByte = romReader(address);
  const bytes: number[] = [firstByte];

  let entry: OpcodeEntry | undefined;
  let prefixSize = 0;

  // Check for prefix bytes
  if (firstByte === 0xCB) {
    // CB prefix - bit operations
    const secondByte = romReader(address + 1);
    bytes.push(secondByte);
    entry = CB_OPCODES[secondByte];
    prefixSize = 1;
  } else if (firstByte === 0xED) {
    // ED prefix - extended instructions
    const secondByte = romReader(address + 1);
    bytes.push(secondByte);
    entry = ED_OPCODES[secondByte];
    prefixSize = 1;

    // Read additional bytes for ED instructions with nn operand
    if (entry && entry.size > 2) {
      for (let i = 2; i < entry.size; i++) {
        bytes.push(romReader(address + i));
      }
    }
  } else if (firstByte === 0xDD) {
    // DD prefix - IX instructions
    const secondByte = romReader(address + 1);
    bytes.push(secondByte);

    if (secondByte === 0xCB) {
      // DD CB d op - indexed bit operations
      const displacement = romReader(address + 2);
      const opcode = romReader(address + 3);
      bytes.push(displacement, opcode);
      entry = DDCB_OPCODES[opcode];
      prefixSize = 2;
    } else {
      entry = DD_OPCODES[secondByte];
      prefixSize = 1;

      // Read additional bytes
      if (entry && entry.size > 2) {
        for (let i = 2; i < entry.size; i++) {
          bytes.push(romReader(address + i));
        }
      }
    }
  } else if (firstByte === 0xFD) {
    // FD prefix - IY instructions
    const secondByte = romReader(address + 1);
    bytes.push(secondByte);

    if (secondByte === 0xCB) {
      // FD CB d op - indexed bit operations
      const displacement = romReader(address + 2);
      const opcode = romReader(address + 3);
      bytes.push(displacement, opcode);
      entry = FDCB_OPCODES[opcode];
      prefixSize = 2;
    } else {
      entry = FD_OPCODES[secondByte];
      prefixSize = 1;

      // Read additional bytes
      if (entry && entry.size > 2) {
        for (let i = 2; i < entry.size; i++) {
          bytes.push(romReader(address + i));
        }
      }
    }
  } else {
    // Main opcode table
    entry = MAIN_OPCODES[firstByte];

    // Read additional bytes for multi-byte instructions
    if (entry && entry.size > 1) {
      for (let i = 1; i < entry.size; i++) {
        bytes.push(romReader(address + i));
      }
    }
  }

  // Handle unknown opcodes
  if (!entry) {
    return {
      address,
      bytes,
      mnemonic: 'DB',
      operands: `$${toHex(firstByte)}`,
      size: 1,
      cycles: 0
    };
  }

  // Handle prefix markers (not actual instructions)
  if (entry.mnemonic === 'PREFIX') {
    return {
      address,
      bytes,
      mnemonic: 'DB',
      operands: bytes.map(b => `$${toHex(b)}`).join(', '),
      size: bytes.length,
      cycles: 0
    };
  }

  // Resolve operand placeholders
  const resolvedOperands = resolveOperands(entry.operands, bytes, address, prefixSize);

  return {
    address,
    bytes,
    mnemonic: entry.mnemonic,
    operands: resolvedOperands,
    size: entry.size,
    cycles: entry.cycles
  };
};

/**
 * Disassemble a range of instructions
 */
export const disassembleRange = (
  romReader: (address: number) => number,
  startAddress: number,
  count: number
): DisassembledInstruction[] => {
  const instructions: DisassembledInstruction[] = [];
  let currentAddress = startAddress;

  for (let i = 0; i < count; i++) {
    const instr = disassembleInstruction(romReader, currentAddress);
    instructions.push(instr);
    currentAddress += instr.size;

    // Stop at BIOS ROM boundary (16KB: 0x0000-0x3FFF)
    if (currentAddress > 0x3FFF) break;
  }

  return instructions;
};

/**
 * Format a disassembled instruction as a string
 */
export const formatInstruction = (instr: DisassembledInstruction): string => {
  const addrStr = toHex(instr.address, 4);
  const bytesStr = instr.bytes.map(b => toHex(b)).join(' ').padEnd(12);
  const mnemonicStr = instr.mnemonic.padEnd(5);
  return `${addrStr}: ${bytesStr} ${mnemonicStr} ${instr.operands}`;
};

/**
 * Check if instruction is a return (RET, RETI, RETN)
 */
export const isReturnInstruction = (instr: DisassembledInstruction): boolean => {
  return instr.mnemonic === 'RET' || instr.mnemonic === 'RETI' || instr.mnemonic === 'RETN';
};

/**
 * Check if instruction is a conditional return
 */
export const isConditionalReturn = (instr: DisassembledInstruction): boolean => {
  return instr.mnemonic === 'RET' && instr.operands !== '';
};

/**
 * Check if instruction is a call
 */
export const isCallInstruction = (instr: DisassembledInstruction): boolean => {
  return instr.mnemonic === 'CALL' || instr.mnemonic === 'RST';
};

/**
 * Check if instruction is a jump
 */
export const isJumpInstruction = (instr: DisassembledInstruction): boolean => {
  return instr.mnemonic === 'JP' || instr.mnemonic === 'JR' || instr.mnemonic === 'DJNZ';
};

/**
 * Get jump/call target address from instruction
 */
export const getTargetAddress = (instr: DisassembledInstruction): number | null => {
  if (!isCallInstruction(instr) && !isJumpInstruction(instr)) {
    return null;
  }

  // RST instructions have fixed targets
  if (instr.mnemonic === 'RST') {
    const match = instr.operands.match(/([0-9A-F]+)H/);
    if (match) {
      return parseInt(match[1], 16);
    }
    return null;
  }

  // JP (HL), JP (IX), JP (IY) - indirect jumps, can't determine statically
  if (instr.operands.startsWith('(')) {
    return null;
  }

  // Extract address from operands (handles both conditional and unconditional)
  const match = instr.operands.match(/\$([0-9A-F]+)/);
  if (match) {
    return parseInt(match[1], 16);
  }

  return null;
};
