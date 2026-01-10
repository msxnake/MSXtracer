
import { MSXTimingConfig } from '../types';

// ===== MSX TIMING CONSTANTS =====

export const MSX_TIMING_NTSC: MSXTimingConfig = {
    cpuFrequency: 3579545,
    vblankFrequency: 60,
    cyclesPerFrame: Math.floor(3579545 / 60), // ~59659 cycles
    name: 'NTSC'
};

export const MSX_TIMING_PAL: MSXTimingConfig = {
    cpuFrequency: 3546894,
    vblankFrequency: 50,
    cyclesPerFrame: Math.floor(3546894 / 50), // ~70937 cycles
    name: 'PAL'
};

// ===== Z80 INSTRUCTION TIMING TABLE =====
// Based on official Z80 documentation
// Format: 'OPCODE [OPERAND_PATTERN]': T-states

export const Z80_TIMING: { [key: string]: number } = {
    // 8-bit loads (4-13 T-states)
    'LD_R_R': 4,           // LD r,r'
    'LD_R_N': 7,           // LD r,n
    'LD_R_(HL)': 7,        // LD r,(HL)
    'LD_(HL)_R': 7,        // LD (HL),r
    'LD_(HL)_N': 10,       // LD (HL),n
    'LD_A_(BC)': 7,        // LD A,(BC)
    'LD_A_(DE)': 7,        // LD A,(DE)
    'LD_(BC)_A': 7,        // LD (BC),A
    'LD_(DE)_A': 7,        // LD (DE),A
    'LD_A_(NN)': 13,       // LD A,(nn)
    'LD_(NN)_A': 13,       // LD (nn),A
    'LD_I_A': 9,           // LD I,A
    'LD_R_A': 9,           // LD R,A
    'LD_A_I': 9,           // LD A,I
    'LD_A_R': 9,           // LD A,R

    // 16-bit loads (6-20 T-states)
    'LD_DD_NN': 10,        // LD dd,nn (BC,DE,HL,SP)
    'LD_IX_NN': 14,        // LD IX,nn
    'LD_IY_NN': 14,        // LD IY,nn
    'LD_HL_(NN)': 16,      // LD HL,(nn)
    'LD_(NN)_HL': 16,      // LD (nn),HL
    'LD_DD_(NN)': 20,      // LD dd,(nn)
    'LD_(NN)_DD': 20,      // LD (nn),dd
    'LD_SP_HL': 6,         // LD SP,HL
    'LD_SP_IX': 10,        // LD SP,IX
    'LD_SP_IY': 10,        // LD SP,IY
    'PUSH_QQ': 11,         // PUSH qq
    'PUSH_IX': 15,         // PUSH IX
    'PUSH_IY': 15,         // PUSH IY
    'POP_QQ': 10,          // POP qq
    'POP_IX': 14,          // POP IX
    'POP_IY': 14,          // POP IY

    // Arithmetic & Logic (4-11 T-states)
    'ADD_A_R': 4,          // ADD A,r
    'ADD_A_N': 7,          // ADD A,n
    'ADD_A_(HL)': 7,       // ADD A,(HL)
    'ADC_A_R': 4,          // ADC A,r
    'ADC_A_N': 7,          // ADC A,n
    'ADC_A_(HL)': 7,       // ADC A,(HL)
    'SUB_R': 4,            // SUB r
    'SUB_N': 7,            // SUB n
    'SUB_(HL)': 7,         // SUB (HL)
    'SBC_A_R': 4,          // SBC A,r
    'SBC_A_N': 7,          // SBC A,n
    'SBC_A_(HL)': 7,       // SBC A,(HL)
    'AND_R': 4,            // AND r
    'AND_N': 7,            // AND n
    'AND_(HL)': 7,         // AND (HL)
    'OR_R': 4,             // OR r
    'OR_N': 7,             // OR n
    'OR_(HL)': 7,          // OR (HL)
    'XOR_R': 4,            // XOR r
    'XOR_N': 7,            // XOR n
    'XOR_(HL)': 7,         // XOR (HL)
    'CP_R': 4,             // CP r
    'CP_N': 7,             // CP n
    'CP_(HL)': 7,          // CP (HL)
    'INC_R': 4,            // INC r
    'INC_(HL)': 11,        // INC (HL)
    'DEC_R': 4,            // DEC r
    'DEC_(HL)': 11,        // DEC (HL)

    // 16-bit arithmetic (6-15 T-states)
    'ADD_HL_SS': 11,       // ADD HL,ss
    'ADC_HL_SS': 15,       // ADC HL,ss
    'SBC_HL_SS': 15,       // SBC HL,ss
    'ADD_IX_PP': 15,       // ADD IX,pp
    'ADD_IY_RR': 15,       // ADD IY,rr
    'INC_SS': 6,           // INC ss
    'INC_IX': 10,          // INC IX
    'INC_IY': 10,          // INC IY
    'DEC_SS': 6,           // DEC ss
    'DEC_IX': 10,          // DEC IX
    'DEC_IY': 10,          // DEC IY

    // Jumps (10-12 T-states)
    'JP_NN': 10,           // JP nn
    'JP_CC_NN': 10,        // JP cc,nn (same regardless of condition)
    'JR_E': 12,            // JR e
    'JR_CC_E_T': 12,       // JR cc,e (taken)
    'JR_CC_E_NT': 7,       // JR cc,e (not taken)
    'JP_(HL)': 4,          // JP (HL)
    'JP_(IX)': 8,          // JP (IX)
    'JP_(IY)': 8,          // JP (IY)
    'DJNZ_E_T': 13,        // DJNZ e (taken)
    'DJNZ_E_NT': 8,        // DJNZ e (not taken)

    // Calls & Returns (10-17 T-states)
    'CALL_NN': 17,         // CALL nn
    'CALL_CC_NN_T': 17,    // CALL cc,nn (taken)
    'CALL_CC_NN_NT': 10,   // CALL cc,nn (not taken)
    'RET': 10,             // RET
    'RET_CC_T': 11,        // RET cc (taken)
    'RET_CC_NT': 5,        // RET cc (not taken)
    'RETI': 14,            // RETI
    'RETN': 14,            // RETN
    'RST_P': 11,           // RST p

    // I/O (11-16 T-states)
    'IN_A_(N)': 11,        // IN A,(n)
    'IN_R_(C)': 12,        // IN r,(C)
    'INI': 16,             // INI
    'INIR_CONT': 21,       // INIR (per iteration, BC≠0)
    'INIR_LAST': 16,       // INIR (last iteration, BC=0)
    'IND': 16,             // IND
    'INDR_CONT': 21,       // INDR (per iteration, BC≠0)
    'INDR_LAST': 16,       // INDR (last iteration, BC=0)
    'OUT_(N)_A': 11,       // OUT (n),A
    'OUT_(C)_R': 12,       // OUT (C),r
    'OUTI': 16,            // OUTI
    'OTIR_CONT': 21,       // OTIR (per iteration, BC≠0)
    'OTIR_LAST': 16,       // OTIR (last iteration, BC=0)
    'OUTD': 16,            // OUTD
    'OTDR_CONT': 21,       // OTDR (per iteration, BC≠0)
    'OTDR_LAST': 16,       // OTDR (last iteration, BC=0)

    // Interrupts (4-8 T-states)
    'EI': 4,               // EI
    'DI': 4,               // DI
    'IM_0': 8,             // IM 0
    'IM_1': 8,             // IM 1
    'IM_2': 8,             // IM 2
    'HALT': 4,             // HALT

    // Block operations (16-21 T-states)
    'LDI': 16,             // LDI
    'LDIR_CONT': 21,       // LDIR (per iteration, BC≠0)
    'LDIR_LAST': 16,       // LDIR (last iteration, BC=0)
    'LDD': 16,             // LDD
    'LDDR_CONT': 21,       // LDDR (per iteration, BC≠0)
    'LDDR_LAST': 16,       // LDDR (last iteration, BC=0)
    'CPI': 16,             // CPI
    'CPIR_CONT': 21,       // CPIR (per iteration, BC≠0, no match)
    'CPIR_LAST': 16,       // CPIR (last iteration or match)
    'CPD': 16,             // CPD
    'CPDR_CONT': 21,       // CPDR (per iteration, BC≠0, no match)
    'CPDR_LAST': 16,       // CPDR (last iteration or match)

    // Bit operations (8-15 T-states)
    'BIT_B_R': 8,          // BIT b,r
    'BIT_B_(HL)': 12,      // BIT b,(HL)
    'BIT_B_(IX+D)': 20,    // BIT b,(IX+d)
    'BIT_B_(IY+D)': 20,    // BIT b,(IY+d)
    'SET_B_R': 8,          // SET b,r
    'SET_B_(HL)': 15,      // SET b,(HL)
    'RES_B_R': 8,          // RES b,r
    'RES_B_(HL)': 15,      // RES b,(HL)

    // Rotate & Shift (4-23 T-states)
    'RLCA': 4,             // RLCA
    'RRCA': 4,             // RRCA
    'RLA': 4,              // RLA
    'RRA': 4,              // RRA
    'RLC_R': 8,            // RLC r
    'RLC_(HL)': 15,        // RLC (HL)
    'RRC_R': 8,            // RRC r
    'RRC_(HL)': 15,        // RRC (HL)
    'RL_R': 8,             // RL r
    'RL_(HL)': 15,         // RL (HL)
    'RR_R': 8,             // RR r
    'RR_(HL)': 15,         // RR (HL)
    'SLA_R': 8,            // SLA r
    'SLA_(HL)': 15,        // SLA (HL)
    'SRA_R': 8,            // SRA r
    'SRA_(HL)': 15,        // SRA (HL)
    'SRL_R': 8,            // SRL r
    'SRL_(HL)': 15,        // SRL (HL)
    'RLD': 18,             // RLD
    'RRD': 18,             // RRD

    // Misc (4-19 T-states)
    'NOP': 4,              // NOP
    'DAA': 4,              // DAA
    'CPL': 4,              // CPL
    'NEG': 8,              // NEG
    'CCF': 4,              // CCF
    'SCF': 4,              // SCF
    'EX_DE_HL': 4,         // EX DE,HL
    'EX_AF_AF\'': 4,       // EX AF,AF'
    'EXX': 4,              // EXX
    'EX_(SP)_HL': 19,      // EX (SP),HL
    'EX_(SP)_IX': 23,      // EX (SP),IX
    'EX_(SP)_IY': 23,      // EX (SP),IY
};

// ===== TIMING CALCULATION FUNCTIONS =====

/**
 * Get T-states for a specific instruction
 * @param opcode - The instruction opcode (e.g., "LD", "ADD", "JP")
 * @param operands - The operands string (e.g., "A,B", "HL,1234H", "NZ,LABEL")
 * @param conditionMet - For conditional instructions, whether the condition was met
 * @returns Number of T-states consumed
 */
export function getInstructionTiming(
    opcode: string,
    operands: string,
    conditionMet?: boolean
): number {
    const op = opcode.toUpperCase();
    const args = operands.toUpperCase().split(',').map(s => s.trim());

    // Helper to check if operand is a register
    const isReg8 = (s: string) => ['A', 'B', 'C', 'D', 'E', 'H', 'L'].includes(s);
    const isReg16 = (s: string) => ['BC', 'DE', 'HL', 'SP'].includes(s);
    const isIndexReg = (s: string) => ['IX', 'IY'].includes(s);
    const isIndirect = (s: string) => s.startsWith('(') && s.endsWith(')');

    // LD instructions
    if (op === 'LD') {
        const dest = args[0] || '';
        const src = args[1] || '';

        // LD r,r'
        if (isReg8(dest) && isReg8(src)) return Z80_TIMING['LD_R_R'];

        // LD r,n
        if (isReg8(dest) && !isReg8(src) && !isIndirect(src)) return Z80_TIMING['LD_R_N'];

        // LD r,(HL)
        if (isReg8(dest) && src === '(HL)') return Z80_TIMING['LD_R_(HL)'];

        // LD (HL),r
        if (dest === '(HL)' && isReg8(src)) return Z80_TIMING['LD_(HL)_R'];

        // LD (HL),n
        if (dest === '(HL)' && !isReg8(src)) return Z80_TIMING['LD_(HL)_N'];

        // LD A,(BC/DE)
        if (dest === 'A' && (src === '(BC)' || src === '(DE)')) return 7;

        // LD (BC/DE),A
        if ((dest === '(BC)' || dest === '(DE)') && src === 'A') return 7;

        // LD A,(nn) or LD (nn),A
        if (dest === 'A' && isIndirect(src)) return Z80_TIMING['LD_A_(NN)'];
        if (isIndirect(dest) && src === 'A') return Z80_TIMING['LD_(NN)_A'];

        // LD I,A / LD R,A / LD A,I / LD A,R
        if (dest === 'I' && src === 'A') return Z80_TIMING['LD_I_A'];
        if (dest === 'R' && src === 'A') return Z80_TIMING['LD_R_A'];
        if (dest === 'A' && src === 'I') return Z80_TIMING['LD_A_I'];
        if (dest === 'A' && src === 'R') return Z80_TIMING['LD_A_R'];

        // LD dd,nn
        if (isReg16(dest)) return Z80_TIMING['LD_DD_NN'];
        if (isIndexReg(dest)) return Z80_TIMING['LD_IX_NN'];

        // LD HL,(nn) / LD (nn),HL
        if (dest === 'HL' && isIndirect(src)) return Z80_TIMING['LD_HL_(NN)'];
        if (isIndirect(dest) && src === 'HL') return Z80_TIMING['LD_(NN)_HL'];

        // LD SP,HL/IX/IY
        if (dest === 'SP' && src === 'HL') return Z80_TIMING['LD_SP_HL'];
        if (dest === 'SP' && isIndexReg(src)) return Z80_TIMING['LD_SP_IX'];

        return 10; // Default for LD
    }

    // PUSH/POP
    if (op === 'PUSH') {
        if (isIndexReg(args[0])) return Z80_TIMING['PUSH_IX'];
        return Z80_TIMING['PUSH_QQ'];
    }
    if (op === 'POP') {
        if (isIndexReg(args[0])) return Z80_TIMING['POP_IX'];
        return Z80_TIMING['POP_QQ'];
    }

    // Arithmetic 8-bit
    if (['ADD', 'ADC', 'SUB', 'SBC', 'AND', 'OR', 'XOR', 'CP'].includes(op)) {
        const operand = args[0] === 'A' ? args[1] : args[0];
        if (isReg8(operand)) return 4;
        if (operand === '(HL)') return 7;
        return 7; // Immediate
    }

    // Arithmetic 16-bit
    if (op === 'ADD' && isReg16(args[0])) return Z80_TIMING['ADD_HL_SS'];
    if (op === 'ADD' && isIndexReg(args[0])) return Z80_TIMING['ADD_IX_PP'];
    if (op === 'ADC' && args[0] === 'HL') return Z80_TIMING['ADC_HL_SS'];
    if (op === 'SBC' && args[0] === 'HL') return Z80_TIMING['SBC_HL_SS'];

    // INC/DEC
    if (op === 'INC' || op === 'DEC') {
        if (isReg8(args[0])) return 4;
        if (args[0] === '(HL)') return 11;
        if (isReg16(args[0])) return 6;
        if (isIndexReg(args[0])) return 10;
    }

    // Jumps
    if (op === 'JP') {
        if (args[0] === '(HL)' || args[0] === '(IX)' || args[0] === '(IY)') return 4;
        return Z80_TIMING['JP_NN'];
    }

    if (op === 'JR') {
        // Conditional JR
        if (args.length > 1) {
            return conditionMet ? Z80_TIMING['JR_CC_E_T'] : Z80_TIMING['JR_CC_E_NT'];
        }
        return Z80_TIMING['JR_E'];
    }

    if (op === 'DJNZ') {
        return conditionMet ? Z80_TIMING['DJNZ_E_T'] : Z80_TIMING['DJNZ_E_NT'];
    }

    // Calls & Returns
    if (op === 'CALL') {
        if (args.length > 1) {
            return conditionMet ? Z80_TIMING['CALL_CC_NN_T'] : Z80_TIMING['CALL_CC_NN_NT'];
        }
        return Z80_TIMING['CALL_NN'];
    }

    if (op === 'RET') {
        if (args.length > 0 && args[0] !== '') {
            return conditionMet ? Z80_TIMING['RET_CC_T'] : Z80_TIMING['RET_CC_NT'];
        }
        return Z80_TIMING['RET'];
    }

    if (op === 'RETI') return Z80_TIMING['RETI'];
    if (op === 'RETN') return Z80_TIMING['RETN'];
    if (op === 'RST') return Z80_TIMING['RST_P'];

    // Bit operations
    if (['BIT', 'SET', 'RES'].includes(op)) {
        const operand = args[1] || '';
        if (isReg8(operand)) return 8;
        if (operand === '(HL)') return op === 'BIT' ? 12 : 15;
        if (operand.includes('IX') || operand.includes('IY')) return 20;
    }

    // Rotates & Shifts
    if (['RLCA', 'RRCA', 'RLA', 'RRA'].includes(op)) return 4;
    if (['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SRL'].includes(op)) {
        return args[0] === '(HL)' ? 15 : 8;
    }
    if (op === 'RLD' || op === 'RRD') return 18;

    // I/O
    if (op === 'IN') return args[0].includes('(C)') ? 12 : 11;
    if (op === 'OUT') return args[0].includes('(C)') ? 12 : 11;

    // Block operations
    if (['LDIR', 'LDDR', 'CPIR', 'CPDR', 'INIR', 'INDR', 'OTIR', 'OTDR'].includes(op)) {
        return 21; // Per iteration (simplified)
    }
    if (['LDI', 'LDD', 'CPI', 'CPD', 'INI', 'IND', 'OUTI', 'OUTD'].includes(op)) {
        return 16;
    }

    // Interrupts
    if (op === 'EI' || op === 'DI') return 4;
    if (op === 'IM') return 8;
    if (op === 'HALT') return 4;

    // Misc
    if (op === 'NOP') return Z80_TIMING['NOP'];
    if (op === 'DAA') return Z80_TIMING['DAA'];
    if (op === 'CPL') return Z80_TIMING['CPL'];
    if (op === 'NEG') return Z80_TIMING['NEG'];
    if (op === 'CCF') return Z80_TIMING['CCF'];
    if (op === 'SCF') return Z80_TIMING['SCF'];

    if (op === 'EX') {
        if (args[0] === 'DE' || args[0] === 'HL') return Z80_TIMING['EX_DE_HL'];
        if (args[0] === 'AF') return Z80_TIMING['EX_AF_AF\''];
        if (args[0] === '(SP)') {
            if (args[1] === 'HL') return Z80_TIMING['EX_(SP)_HL'];
            return Z80_TIMING['EX_(SP)_IX'];
        }
    }

    if (op === 'EXX') return Z80_TIMING['EXX'];

    // Default fallback
    return 4;
}

/**
 * Check if a VBLANK interrupt should occur
 */
export function checkVBlankInterrupt(
    currentCycles: number,
    cyclesPerFrame: number
): boolean {
    return currentCycles >= cyclesPerFrame;
}

/**
 * Format timing for display
 */
export function formatTiming(cycles: number, config: MSXTimingConfig): string {
    const microseconds = (cycles / config.cpuFrequency) * 1_000_000;
    const milliseconds = microseconds / 1000;

    if (milliseconds >= 1) {
        return `${milliseconds.toFixed(2)} ms`;
    }
    return `${microseconds.toFixed(2)} µs`;
}

/**
 * Format T-states with thousands separator
 */
export function formatCycles(cycles: number): string {
    return cycles.toLocaleString();
}

/**
 * Calculate FPS based on current frame count and time
 */
export function calculateFPS(frameCount: number, totalCycles: number, config: MSXTimingConfig): number {
    if (totalCycles === 0) return 0;
    const seconds = totalCycles / config.cpuFrequency;
    return frameCount / seconds;
}
