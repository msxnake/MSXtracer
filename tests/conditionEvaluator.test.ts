import { describe, it, expect } from 'vitest';
import { evaluateCondition, parseConditionString, validateConditionString, formatCondition, resolveOperand } from '../src/services/conditionEvaluator';
import { Z80Registers } from '../src/types';

describe('Condition Evaluator', () => {
    const testRegisters: Z80Registers = {
        a: 0xFF, b: 0x10, c: 0x20, d: 0x30, e: 0x40, h: 0x50, l: 0x60,
        a_prime: 0, f_prime: 0, b_prime: 0, c_prime: 0,
        d_prime: 0, e_prime: 0, h_prime: 0, l_prime: 0,
        ix: 0x1234, iy: 0x5678,
        i: 0, r: 0,
        f: 0, sp: 0xF380, pc: 0x4000
    };

    const testMemory = {
        'PLAYER_HEALTH': 100,
        'ENEMY_COUNT': 5
    };

    const testSymbolTable = {
        'VIDEO_RAM': 0xC000,
        'PLAYER_HEALTH': 0xD000,
        'ENEMY_COUNT': 0xD001
    };

    describe('parseConditionString', () => {
        it('should parse simple equality condition', () => {
            const result = parseConditionString('A == 0xFF');
            expect(result).toEqual({
                leftOperand: 'A',
                operator: '==',
                rightOperand: '0xFF'
            });
        });

        it('should parse greater than condition', () => {
            const result = parseConditionString('B > 15');
            expect(result).toEqual({
                leftOperand: 'B',
                operator: '>',
                rightOperand: '15'
            });
        });

        it('should parse greater than or equal condition', () => {
            const result = parseConditionString('HL >= $4000');
            expect(result).toEqual({
                leftOperand: 'HL',
                operator: '>=',
                rightOperand: '$4000'
            });
        });

        it('should parse not equal condition', () => {
            const result = parseConditionString('PLAYER_HEALTH != 0');
            expect(result).toEqual({
                leftOperand: 'PLAYER_HEALTH',
                operator: '!=',
                rightOperand: '0'
            });
        });

        it('should handle whitespace', () => {
            const result = parseConditionString('  A  ==  0xFF  ');
            expect(result).toEqual({
                leftOperand: 'A',
                operator: '==',
                rightOperand: '0xFF'
            });
        });

        it('should return null for invalid expression', () => {
            const result = parseConditionString('A 0xFF');
            expect(result).toBeNull();
        });
    });

    describe('validateConditionString', () => {
        it('should validate correct expression', () => {
            const result = validateConditionString('A == 0xFF');
            expect(result.valid).toBe(true);
        });

        it('should reject invalid expression', () => {
            const result = validateConditionString('A 0xFF');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid expression format');
        });

        it('should reject expression with missing operand', () => {
            const result = validateConditionString('== 0xFF');
            expect(result.valid).toBe(false);
        });
    });

    describe('resolveOperand', () => {
        it('should resolve register name', () => {
            const result = resolveOperand('A', testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(0xFF);
        });

        it('should resolve 16-bit register pair', () => {
            const result = resolveOperand('HL', testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(0x5060); // H=0x50, L=0x60
        });

        it('should resolve hex literal with 0x prefix', () => {
            const result = resolveOperand('0xFF', testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(255);
        });

        it('should resolve hex literal with $ prefix', () => {
            const result = resolveOperand('$FF', testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(255);
        });

        it('should resolve decimal literal', () => {
            const result = resolveOperand('100', testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(100);
        });

        it('should resolve memory label', () => {
            const result = resolveOperand('PLAYER_HEALTH', testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(100);
        });

        it('should resolve symbol table entry', () => {
            const result = resolveOperand('VIDEO_RAM', testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(0xC000);
        });

        it('should resolve IX register', () => {
            const result = resolveOperand('IX', testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(0x1234);
        });
    });

    describe('evaluateCondition', () => {
        it('should evaluate == correctly', () => {
            const condition = { leftOperand: 'A', operator: '==' as const, rightOperand: '0xFF' };
            const result = evaluateCondition(condition, testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(true);
        });

        it('should evaluate != correctly', () => {
            const condition = { leftOperand: 'B', operator: '!=' as const, rightOperand: '0xFF' };
            const result = evaluateCondition(condition, testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(true);
        });

        it('should evaluate > correctly', () => {
            const condition = { leftOperand: 'A', operator: '>' as const, rightOperand: '100' };
            const result = evaluateCondition(condition, testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(true);
        });

        it('should evaluate < correctly', () => {
            const condition = { leftOperand: 'B', operator: '<' as const, rightOperand: '100' };
            const result = evaluateCondition(condition, testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(true);
        });

        it('should evaluate >= correctly', () => {
            const condition = { leftOperand: 'A', operator: '>=' as const, rightOperand: '0xFF' };
            const result = evaluateCondition(condition, testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(true);
        });

        it('should evaluate <= correctly', () => {
            const condition = { leftOperand: 'B', operator: '<=' as const, rightOperand: '16' };
            const result = evaluateCondition(condition, testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(true);
        });

        it('should compare two registers', () => {
            const condition = { leftOperand: 'A', operator: '>' as const, rightOperand: 'B' };
            const result = evaluateCondition(condition, testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(true); // A (0xFF) > B (0x10)
        });

        it('should compare register to memory label', () => {
            const condition = { leftOperand: 'PLAYER_HEALTH', operator: '==' as const, rightOperand: '100' };
            const result = evaluateCondition(condition, testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(true);
        });

        it('should return false for unmet condition', () => {
            const condition = { leftOperand: 'A', operator: '==' as const, rightOperand: '0' };
            const result = evaluateCondition(condition, testRegisters, testMemory, testSymbolTable);
            expect(result).toBe(false);
        });
    });

    describe('formatCondition', () => {
        it('should format condition as string', () => {
            const condition = { leftOperand: 'A', operator: '==' as const, rightOperand: '0xFF' };
            const result = formatCondition(condition);
            expect(result).toBe('A == 0xFF');
        });
    });
});
