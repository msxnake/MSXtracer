/**
 * Lightweight Z80 Assembler
 * Converts Z80 assembly instructions to byte sequences for memory mapping
 * Extended to support Glass assembler syntax
 */

export interface AssembledInstruction {
    bytes: number[];
    size: number;
}

/**
 * Parse a value from operand string (handles $FF, #FF, FFH, decimal)
 */
const parseValue = (str: string, symbolTable?: { [key: string]: number }): number | null => {
    if (!str) return null;
    str = str.trim().toUpperCase();

    // Check symbol table
    if (symbolTable && symbolTable[str] !== undefined) {
        return symbolTable[str];
    }

    // Hex formats (Glass uses #)
    if (str.startsWith('#')) return parseInt(str.substring(1), 16);
    if (str.startsWith('$')) return parseInt(str.substring(1), 16);
    if (str.endsWith('H')) return parseInt(str.substring(0, str.length - 1), 16);

    // Decimal
    const num = parseInt(str, 10);
    if (!isNaN(num)) return num;

    return null;
};

/**
 * Assemble a Z80 instruction into bytes
 */
export const assembleInstruction = (
    opcode: string,
    operands: string,
    symbolTable: { [key: string]: number } = {}
): AssembledInstruction => {
    const op = opcode.toUpperCase();
    const args = operands.split(',').map(s => s.trim().toUpperCase());

    // NOP
    if (op === 'NOP') {
        return { bytes: [0x00], size: 1 };
    }

    // HALT
    if (op === 'HALT') {
        return { bytes: [0x76], size: 1 };
    }

    // DI / EI
    if (op === 'DI') return { bytes: [0xF3], size: 1 };
    if (op === 'EI') return { bytes: [0xFB], size: 1 };

    // IM (Interrupt Mode)
    if (op === 'IM') {
        const mode = parseInt(args[0]);
        if (mode === 0) return { bytes: [0xED, 0x46], size: 2 };
        if (mode === 1) return { bytes: [0xED, 0x56], size: 2 };
        if (mode === 2) return { bytes: [0xED, 0x5E], size: 2 };
    }

    // CPL (Complement accumulator)
    if (op === 'CPL') {
        return { bytes: [0x2F], size: 1 };
    }

    // Rotation instructions
    if (op === 'RRCA') return { bytes: [0x0F], size: 1 };
    if (op === 'RLCA') return { bytes: [0x07], size: 1 };
    if (op === 'RRA') return { bytes: [0x1F], size: 1 };
    if (op === 'RLA') return { bytes: [0x17], size: 1 };

    // LD instructions
    if (op === 'LD') {
        const dest = args[0];
        const src = args[1];

        // Register mapping for LD r, r' instructions
        const regMap: { [key: string]: number } = {
            'B': 0, 'C': 1, 'D': 2, 'E': 3, 'H': 4, 'L': 5, 'A': 7
        };

        // LD r, r' (register to register) - CRITICAL!
        // Opcode: 01 ddd sss (where ddd = dest, sss = source)
        if (regMap[dest] !== undefined && regMap[src] !== undefined) {
            const opcode = 0x40 | (regMap[dest] << 3) | regMap[src];
            return { bytes: [opcode], size: 1 };
        }

        // LD r, (HL) - Read from memory pointed by HL
        if (regMap[dest] !== undefined && src === '(HL)') {
            const opcode = 0x46 | (regMap[dest] << 3);
            return { bytes: [opcode], size: 1 };
        }

        // LD (HL), r - Write to memory pointed by HL  
        if (dest === '(HL)' && regMap[src] !== undefined) {
            const opcode = 0x70 | regMap[src];
            return { bytes: [opcode], size: 1 };
        }

        // LD A, n
        if (dest === 'A' && src && !src.includes('(')) {
            const val = parseValue(src, symbolTable);
            if (val !== null) return { bytes: [0x3E, val & 0xFF], size: 2 };
        }

        // LD B, n
        if (dest === 'B' && src && !src.includes('(')) {
            const val = parseValue(src, symbolTable);
            if (val !== null) return { bytes: [0x06, val & 0xFF], size: 2 };
        }

        // LD C, n
        if (dest === 'C' && src && !src.includes('(')) {
            const val = parseValue(src, symbolTable);
            if (val !== null) return { bytes: [0x0E, val & 0xFF], size: 2 };
        }

        // LD D, n
        if (dest === 'D' && src && !src.includes('(')) {
            const val = parseValue(src, symbolTable);
            if (val !== null) return { bytes: [0x16, val & 0xFF], size: 2 };
        }

        // LD E, n
        if (dest === 'E' && src && !src.includes('(')) {
            const val = parseValue(src, symbolTable);
            if (val !== null) return { bytes: [0x1E, val & 0xFF], size: 2 };
        }

        // LD H, n
        if (dest === 'H' && src && !src.includes('(')) {
            const val = parseValue(src, symbolTable);
            if (val !== null) return { bytes: [0x26, val & 0xFF], size: 2 };
        }

        // LD L, n
        if (dest === 'L' && src && !src.includes('(')) {
            const val = parseValue(src, symbolTable);
            if (val !== null) return { bytes: [0x2E, val & 0xFF], size: 2 };
        }

        // LD BC, nn
        if (dest === 'BC') {
            const val = parseValue(src, symbolTable);
            if (val !== null) return { bytes: [0x01, val & 0xFF, (val >> 8) & 0xFF], size: 3 };
        }

        // LD DE, nn
        if (dest === 'DE') {
            const val = parseValue(src, symbolTable);
            if (val !== null) return { bytes: [0x11, val & 0xFF, (val >> 8) & 0xFF], size: 3 };
        }

        // LD HL, nn
        if (dest === 'HL') {
            const val = parseValue(src, symbolTable);
            if (val !== null) return { bytes: [0x21, val & 0xFF, (val >> 8) & 0xFF], size: 3 };
        }

        // LD SP, nn
        if (dest === 'SP') {
            const val = parseValue(src, symbolTable);
            if (val !== null) return { bytes: [0x31, val & 0xFF, (val >> 8) & 0xFF], size: 3 };
        }

        // LD SP, HL
        if (dest === 'SP' && src === 'HL') {
            return { bytes: [0xF9], size: 1 };
        }

        // LD (HL), n
        if (dest === '(HL)' && src && !src.includes('(')) {
            const val = parseValue(src, symbolTable);
            if (val !== null) return { bytes: [0x36, val & 0xFF], size: 2 };
        }

        // LD A, (BC)
        if (dest === 'A' && src === '(BC)') return { bytes: [0x0A], size: 1 };

        // LD A, (DE)
        if (dest === 'A' && src === '(DE)') return { bytes: [0x1A], size: 1 };

        // LD (BC), A
        if (dest === '(BC)' && src === 'A') return { bytes: [0x02], size: 1 };

        // LD (DE), A
        if (dest === '(DE)' && src === 'A') return { bytes: [0x12], size: 1 };

        // LD A, (nn)
        if (dest === 'A' && src.startsWith('(') && src.endsWith(')')) {
            const addr = parseValue(src.substring(1, src.length - 1), symbolTable);
            if (addr !== null) return { bytes: [0x3A, addr & 0xFF, (addr >> 8) & 0xFF], size: 3 };
        }

        // LD (nn), A
        if (dest.startsWith('(') && dest.endsWith(')') && src === 'A') {
            const addr = parseValue(dest.substring(1, dest.length - 1), symbolTable);
            if (addr !== null) return { bytes: [0x32, addr & 0xFF, (addr >> 8) & 0xFF], size: 3 };
        }

        // LD (nn), HL
        if (dest.startsWith('(') && dest.endsWith(')') && src === 'HL') {
            const addr = parseValue(dest.substring(1, dest.length - 1), symbolTable);
            if (addr !== null) return { bytes: [0x22, addr & 0xFF, (addr >> 8) & 0xFF], size: 3 };
        }

        // LD HL, (nn)
        if (dest === 'HL' && src.startsWith('(') && src.endsWith(')')) {
            const addr = parseValue(src.substring(1, src.length - 1), symbolTable);
            if (addr !== null) return { bytes: [0x2A, addr & 0xFF, (addr >> 8) & 0xFF], size: 3 };
        }

        // LD (nn), BC/DE/SP (ED prefix)
        if (dest.startsWith('(') && dest.endsWith(')')) {
            const addr = parseValue(dest.substring(1, dest.length - 1), symbolTable);
            if (addr !== null) {
                if (src === 'BC') return { bytes: [0xED, 0x43, addr & 0xFF, (addr >> 8) & 0xFF], size: 4 };
                if (src === 'DE') return { bytes: [0xED, 0x53, addr & 0xFF, (addr >> 8) & 0xFF], size: 4 };
                if (src === 'SP') return { bytes: [0xED, 0x73, addr & 0xFF, (addr >> 8) & 0xFF], size: 4 };
            }
        }

        // LD BC/DE/SP, (nn) (ED prefix)
        if (src.startsWith('(') && src.endsWith(')')) {
            const addr = parseValue(src.substring(1, src.length - 1), symbolTable);
            if (addr !== null) {
                if (dest === 'BC') return { bytes: [0xED, 0x4B, addr & 0xFF, (addr >> 8) & 0xFF], size: 4 };
                if (dest === 'DE') return { bytes: [0xED, 0x5B, addr & 0xFF, (addr >> 8) & 0xFF], size: 4 };
                if (dest === 'SP') return { bytes: [0xED, 0x7B, addr & 0xFF, (addr >> 8) & 0xFF], size: 4 };
            }
        }
    }

    // INC instructions
    if (op === 'INC') {
        if (args[0] === 'A') return { bytes: [0x3C], size: 1 };
        if (args[0] === 'B') return { bytes: [0x04], size: 1 };
        if (args[0] === 'C') return { bytes: [0x0C], size: 1 };
        if (args[0] === 'D') return { bytes: [0x14], size: 1 };
        if (args[0] === 'E') return { bytes: [0x1C], size: 1 };
        if (args[0] === 'H') return { bytes: [0x24], size: 1 };
        if (args[0] === 'L') return { bytes: [0x2C], size: 1 };
        if (args[0] === 'BC') return { bytes: [0x03], size: 1 };
        if (args[0] === 'DE') return { bytes: [0x13], size: 1 };
        if (args[0] === 'HL') return { bytes: [0x23], size: 1 };
        if (args[0] === 'SP') return { bytes: [0x33], size: 1 };
        if (args[0] === '(HL)') return { bytes: [0x34], size: 1 };
    }

    // DEC instructions
    if (op === 'DEC') {
        if (args[0] === 'A') return { bytes: [0x3D], size: 1 };
        if (args[0] === 'B') return { bytes: [0x05], size: 1 };
        if (args[0] === 'C') return { bytes: [0x0D], size: 1 };
        if (args[0] === 'D') return { bytes: [0x15], size: 1 };
        if (args[0] === 'E') return { bytes: [0x1D], size: 1 };
        if (args[0] === 'H') return { bytes: [0x25], size: 1 };
        if (args[0] === 'L') return { bytes: [0x2D], size: 1 };
        if (args[0] === 'BC') return { bytes: [0x0B], size: 1 };
        if (args[0] === 'DE') return { bytes: [0x1B], size: 1 };
        if (args[0] === 'HL') return { bytes: [0x2B], size: 1 };
        if (args[0] === 'SP') return { bytes: [0x3B], size: 1 };
        if (args[0] === '(HL)') return { bytes: [0x35], size: 1 };
    }

    // JP nn
    if (op === 'JP' && args.length === 1 && !args[0].startsWith('(')) {
        const addr = parseValue(args[0], symbolTable);
        if (addr !== null) return { bytes: [0xC3, addr & 0xFF, (addr >> 8) & 0xFF], size: 3 };
    }

    // JP (HL)
    if (op === 'JP' && args[0] === '(HL)') {
        return { bytes: [0xE9], size: 1 };
    }


    // JR (relative jump) - CRITICAL for loops and conditionals!
    if (op === 'JR') {
        // JR cc, offset (conditional relative jumps)
        if (args.length === 2) {
            const condition = args[0];
            // Placeholder offset = 0x00 (would need proper calculation in real assembler)
            if (condition === 'Z') return { bytes: [0x28, 0x00], size: 2 };
            if (condition === 'NZ') return { bytes: [0x20, 0x00], size: 2 };
            if (condition === 'C') return { bytes: [0x38, 0x00], size: 2 };
            if (condition === 'NC') return { bytes: [0x30, 0x00], size: 2 };
        }

        // JR offset (unconditional)
        if (args.length === 1) {
            return { bytes: [0x18, 0x00], size: 2 };
        }
    }

    // DJNZ n
    if (op === 'DJNZ') {
        return { bytes: [0x10, 0x00], size: 2 };
    }

    // Block transfer instructions (ED prefix) - ESSENTIAL!
    if (op === 'LDIR') return { bytes: [0xED, 0xB0], size: 2 }; // Repeat LDI until BC=0
    if (op === 'LDDR') return { bytes: [0xED, 0xB8], size: 2 }; // Repeat LDD until BC=0
    if (op === 'LDI') return { bytes: [0xED, 0xA0], size: 2 };  // Load and increment
    if (op === 'LDD') return { bytes: [0xED, 0xA8], size: 2 };  // Load and decrement
    if (op === 'CPI') return { bytes: [0xED, 0xA1], size: 2 };  // Compare and increment
    if (op === 'CPIR') return { bytes: [0xED, 0xB1], size: 2 }; // Repeat CPI
    if (op === 'CPD') return { bytes: [0xED, 0xA9], size: 2 };  // Compare and decrement
    if (op === 'CPDR') return { bytes: [0xED, 0xB9], size: 2 }; // Repeat CPD  }

    // CALL nn
    if (op === 'CALL' && args.length === 1) {
        const addr = parseValue(args[0], symbolTable);
        if (addr !== null) return { bytes: [0xCD, addr & 0xFF, (addr >> 8) & 0xFF], size: 3 };
    }

    // RET
    if (op === 'RET' && args.length === 0) {
        return { bytes: [0xC9], size: 1 };
    }

    // PUSH
    if (op === 'PUSH') {
        if (args[0] === 'BC') return { bytes: [0xC5], size: 1 };
        if (args[0] === 'DE') return { bytes: [0xD5], size: 1 };
        if (args[0] === 'HL') return { bytes: [0xE5], size: 1 };
        if (args[0] === 'AF') return { bytes: [0xF5], size: 1 };
    }

    // POP
    if (op === 'POP') {
        if (args[0] === 'BC') return { bytes: [0xC1], size: 1 };
        if (args[0] === 'DE') return { bytes: [0xD1], size: 1 };
        if (args[0] === 'HL') return { bytes: [0xE1], size: 1 };
        if (args[0] === 'AF') return { bytes: [0xF1], size: 1 };
    }


    // ADD A, r/n - CRITICAL!
    if (op === 'ADD' && args[0] === 'A') {
        const regMap: { [key: string]: number } = { 'B': 0, 'C': 1, 'D': 2, 'E': 3, 'H': 4, 'L': 5, '(HL)': 6, 'A': 7 };

        if (regMap[args[1]] !== undefined) {
            return { bytes: [0x80 | regMap[args[1]]], size: 1 };
        }

        // ADD A, n (immediate)
        if (args[1] && !args[1].includes('(')) {
            const val = parseValue(args[1], symbolTable);
            if (val !== null) return { bytes: [0xC6, val & 0xFF], size: 2 };
        }
    }

    // ADD HL, rr (16-bit addition) - COMMON!
    if (op === 'ADD' && args[0] === 'HL') {
        if (args[1] === 'BC') return { bytes: [0x09], size: 1 };
        if (args[1] === 'DE') return { bytes: [0x19], size: 1 };
        if (args[1] === 'HL') return { bytes: [0x29], size: 1 };
        if (args[1] === 'SP') return { bytes: [0x39], size: 1 };
    }

    // ADC A, r/n (Add with carry)
    if (op === 'ADC' && args[0] === 'A') {
        const regMap: { [key: string]: number } = { 'B': 0, 'C': 1, 'D': 2, 'E': 3, 'H': 4, 'L': 5, '(HL)': 6, 'A': 7 };

        if (regMap[args[1]] !== undefined) {
            return { bytes: [0x88 | regMap[args[1]]], size: 1 };
        }

        // ADC A, n
        const val = parseValue(args[1], symbolTable);
        if (val !== null) return { bytes: [0xCE, val & 0xFF], size: 2 };
    }

    // SUB r/n - CRITICAL!
    if (op === 'SUB') {
        const regMap: { [key: string]: number } = { 'B': 0, 'C': 1, 'D': 2, 'E': 3, 'H': 4, 'L': 5, '(HL)': 6, 'A': 7 };

        if (regMap[args[0]] !== undefined) {
            return { bytes: [0x90 | regMap[args[0]]], size: 1 };
        }

        // SUB n
        if (args.length === 1 && !args[0].includes('(')) {
            const val = parseValue(args[0], symbolTable);
            if (val !== null) return { bytes: [0xD6, val & 0xFF], size: 2 };
        }
    }

    // SBC A, r/n
    if (op === 'SBC' && args[0] === 'A') {
        const regMap: { [key: string]: number } = { 'B': 0, 'C': 1, 'D': 2, 'E': 3, 'H': 4, 'L': 5, '(HL)': 6, 'A': 7 };

        if (regMap[args[1]] !== undefined) {
            return { bytes: [0x98 | regMap[args[1]]], size: 1 };
        }

        const val = parseValue(args[1], symbolTable);
        if (val !== null) return { bytes: [0xDE, val & 0xFF], size: 2 };
    }

    // AND r/n - CRITICAL!
    if (op === 'AND') {
        const regMap: { [key: string]: number } = { 'B': 0, 'C': 1, 'D': 2, 'E': 3, 'H': 4, 'L': 5, '(HL)': 6, 'A': 7 };

        if (regMap[args[0]] !== undefined) {
            return { bytes: [0xA0 | regMap[args[0]]], size: 1 };
        }

        // AND n
        if (args.length === 1 && !args[0].includes('(')) {
            const val = parseValue(args[0], symbolTable);
            if (val !== null) return { bytes: [0xE6, val & 0xFF], size: 2 };
        }
    }

    // XOR r/n - CRITICAL! (XOR A is common for clearing A)
    if (op === 'XOR') {
        const regMap: { [key: string]: number } = { 'B': 0, 'C': 1, 'D': 2, 'E': 3, 'H': 4, 'L': 5, '(HL)': 6, 'A': 7 };

        if (regMap[args[0]] !== undefined) {
            return { bytes: [0xA8 | regMap[args[0]]], size: 1 };
        }

        // XOR n
        if (args.length === 1 && !args[0].includes('(')) {
            const val = parseValue(args[0], symbolTable);
            if (val !== null) return { bytes: [0xEE, val & 0xFF], size: 2 };
        }
    }

    // OR r/n - CRITICAL!
    if (op === 'OR') {
        const regMap: { [key: string]: number } = { 'B': 0, 'C': 1, 'D': 2, 'E': 3, 'H': 4, 'L': 5, '(HL)': 6, 'A': 7 };

        if (regMap[args[0]] !== undefined) {
            return { bytes: [0xB0 | regMap[args[0]]], size: 1 };
        }

        // OR n
        if (args.length === 1 && !args[0].includes('(')) {
            const val = parseValue(args[0], symbolTable);
            if (val !== null) return { bytes: [0xF6, val & 0xFF], size: 2 };
        }
    }

    // CP r/n - CRITICAL!
    if (op === 'CP') {
        const regMap: { [key: string]: number } = { 'B': 0, 'C': 1, 'D': 2, 'E': 3, 'H': 4, 'L': 5, '(HL)': 6, 'A': 7 };

        if (regMap[args[0]] !== undefined) {
            return { bytes: [0xB8 | regMap[args[0]]], size: 1 };
        }

        // CP n
        if (args.length === 1 && !args[0].includes('(')) {
            const val = parseValue(args[0], symbolTable);
            if (val !== null) return { bytes: [0xFE, val & 0xFF], size: 2 };
        }
    }

    // EX instructions
    if (op === 'EX') {
        if (args[0] === 'DE' && args[1] === 'HL') return { bytes: [0xEB], size: 1 };
        if (args[0] === 'AF' && args[1] === "AF'") return { bytes: [0x08], size: 1 };
        if (args[0] === '(SP)' && args[1] === 'HL') return { bytes: [0xE3], size: 1 };
    }

    // EXX
    if (op === 'EXX') return { bytes: [0xD9], size: 1 };

    // Misc operations
    if (op === 'DAA') return { bytes: [0x27], size: 1 };  // Decimal adjust
    if (op === 'NEG') return { bytes: [0xED, 0x44], size: 2 }; // Negate
    if (op === 'SCF') return { bytes: [0x37], size: 1 };  // Set carry flag
    if (op === 'CCF') return { bytes: [0x3F], size: 1 };  // Complement carry flag  }

    // OUT (n), A
    if (op === 'OUT' && args[0].startsWith('(') && args[1] === 'A') {
        const port = args[0].replace(/[()]/g, '');
        const val = parseValue(port, symbolTable);
        if (val !== null) return { bytes: [0xD3, val & 0xFF], size: 2 };
    }

    // IN A, (n)
    if (op === 'IN' && args[0] === 'A' && args[1] && args[1].startsWith('(')) {
        const port = args[1].replace(/[()]/g, '');
        const val = parseValue(port, symbolTable);
        if (val !== null) return { bytes: [0xDB, val & 0xFF], size: 2 };
    }

    // Default: return NOP as placeholder for unrecognized instructions
    return { bytes: [0x00], size: 1 };
};
