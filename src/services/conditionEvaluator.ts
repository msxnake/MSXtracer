
import { BreakpointCondition, ComparisonOperator, Z80Registers } from '../types';

/**
 * Parse a numeric value from various formats (hex, decimal, binary)
 */
const parseNumericValue = (value: string): number | null => {
    if (!value) return null;
    const trimmed = value.trim().toUpperCase();

    try {
        // Hex: 0xFF, $FF, FFh
        if (trimmed.startsWith('0X')) return parseInt(trimmed.substring(2), 16);
        if (trimmed.startsWith('$')) return parseInt(trimmed.substring(1), 16);
        if (trimmed.endsWith('H')) return parseInt(trimmed.substring(0, trimmed.length - 1), 16);

        // Binary: 0b11111111, %11111111
        if (trimmed.startsWith('0B')) return parseInt(trimmed.substring(2), 2);
        if (trimmed.startsWith('%')) return parseInt(trimmed.substring(1), 2);

        // Decimal
        if (!isNaN(parseInt(trimmed))) return parseInt(trimmed);
    } catch (e) {
        return null;
    }

    return null;
};

/**
 * Get the value of a register (supports 8-bit and 16-bit registers)
 */
const getRegisterValue = (registerName: string, registers: Z80Registers): number | null => {
    const name = registerName.toUpperCase();

    // 8-bit registers
    switch (name) {
        case 'A': return registers.a;
        case 'B': return registers.b;
        case 'C': return registers.c;
        case 'D': return registers.d;
        case 'E': return registers.e;
        case 'H': return registers.h;
        case 'L': return registers.l;
        case 'I': return registers.i;
        case 'R': return registers.r;

        // Alternate registers
        case "A'": case 'A_PRIME': return registers.a_prime;
        case "F'": case 'F_PRIME': return registers.f_prime;
        case "B'": case 'B_PRIME': return registers.b_prime;
        case "C'": case 'C_PRIME': return registers.c_prime;
        case "D'": case 'D_PRIME': return registers.d_prime;
        case "E'": case 'E_PRIME': return registers.e_prime;
        case "H'": case 'H_PRIME': return registers.h_prime;
        case "L'": case 'L_PRIME': return registers.l_prime;

        // 16-bit registers
        case 'BC': return (registers.b << 8) | registers.c;
        case 'DE': return (registers.d << 8) | registers.e;
        case 'HL': return (registers.h << 8) | registers.l;
        case 'IX': return registers.ix;
        case 'IY': return registers.iy;
        case 'SP': return registers.sp;
        case 'PC': return registers.pc;

        default: return null;
    }
};

/**
 * Resolve an operand to a numeric value
 * Supports: register names, numeric literals, memory addresses, labels
 */
export const resolveOperand = (
    operand: string,
    registers: Z80Registers,
    memory: { [name: string]: number },
    symbolTable?: { [label: string]: number }
): number | null => {
    const trimmed = operand.trim();

    // Try to resolve as register
    const regValue = getRegisterValue(trimmed, registers);
    if (regValue !== null) return regValue;

    // Try to resolve as numeric literal
    const numValue = parseNumericValue(trimmed);
    if (numValue !== null) return numValue;

    // Try to resolve as memory label
    const upperLabel = trimmed.toUpperCase();
    if (memory[upperLabel] !== undefined) {
        return memory[upperLabel];
    }

    // Try to resolve via symbol table
    if (symbolTable && symbolTable[upperLabel] !== undefined) {
        return symbolTable[upperLabel];
    }

    return null;
};

/**
 * Perform comparison operation
 */
const performComparison = (
    left: number,
    operator: ComparisonOperator,
    right: number
): boolean => {
    switch (operator) {
        case '==': return left === right;
        case '!=': return left !== right;
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        default: return false;
    }
};

/**
 * Evaluate a breakpoint condition
 */
export const evaluateCondition = (
    condition: BreakpointCondition,
    registers: Z80Registers,
    memory: { [name: string]: number },
    symbolTable?: { [label: string]: number }
): boolean => {
    const leftValue = resolveOperand(condition.leftOperand, registers, memory, symbolTable);
    const rightValue = resolveOperand(condition.rightOperand, registers, memory, symbolTable);

    if (leftValue === null || rightValue === null) {
        console.warn(`Could not resolve condition operands: ${condition.leftOperand} ${condition.operator} ${condition.rightOperand}`);
        return false;
    }

    return performComparison(leftValue, condition.operator, rightValue);
};

/**
 * Parse a condition string into a BreakpointCondition object
 * Example: "A == 0xFF" -> { leftOperand: 'A', operator: '==', rightOperand: '0xFF' }
 */
export const parseConditionString = (expression: string): BreakpointCondition | null => {
    const trimmed = expression.trim();

    // Match operators in order of length (to handle >= and <= correctly)
    const operators: ComparisonOperator[] = ['==', '!=', '>=', '<=', '>', '<'];

    for (const operator of operators) {
        const idx = trimmed.indexOf(operator);
        if (idx !== -1) {
            const leftOperand = trimmed.substring(0, idx).trim();
            const rightOperand = trimmed.substring(idx + operator.length).trim();

            if (leftOperand && rightOperand) {
                return {
                    leftOperand,
                    operator,
                    rightOperand
                };
            }
        }
    }

    return null;
};

/**
 * Validate a condition string
 */
export const validateConditionString = (expression: string): { valid: boolean; error?: string } => {
    const condition = parseConditionString(expression);

    if (!condition) {
        return { valid: false, error: 'Invalid expression format. Use: operand operator operand (e.g., "A == 0xFF")' };
    }

    if (!condition.leftOperand) {
        return { valid: false, error: 'Missing left operand' };
    }

    if (!condition.rightOperand) {
        return { valid: false, error: 'Missing right operand' };
    }

    return { valid: true };
};

/**
 * Format a condition as a human-readable string
 */
export const formatCondition = (condition: BreakpointCondition): string => {
    return `${condition.leftOperand} ${condition.operator} ${condition.rightOperand}`;
};
