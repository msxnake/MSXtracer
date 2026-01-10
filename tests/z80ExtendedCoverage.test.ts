import { describe, it, expect } from 'vitest';
import { simulateLine, SimulationState } from '../src/services/z80Simulator';

// Helper to create initial state
const createInitialState = (): SimulationState => ({
    registers: {
        a: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0,
        f: 0,
        a_prime: 0, b_prime: 0, c_prime: 0, d_prime: 0, e_prime: 0, h_prime: 0, l_prime: 0,
        f_prime: 0,
        ix: 0, iy: 0, sp: 0xF380, pc: 0, i: 0, r: 0,
    },
    flags: {
        z: false, s: false, c: false, pv: false,
    },
    memory: {},
    vdp: {
        vram: new Array(16384).fill(0),
        addressRegister: 0,
        writeLatch: false,
        registerLatch: 0,
    },
});

describe('Z80 Simulator - Extended Coverage Tests', () => {
    describe('Conditional Jumps', () => {
        it('JP Z - Jump if Zero flag set', () => {
            const state = createInitialState();
            state.flags.z = true;

            const result = simulateLine('JP Z, $8000', state, {});

            // Should set jump target
            expect((result as any).__jumpTarget).toBe(0x8000);
        });

        it('JP NZ - Jump if Zero flag clear', () => {
            const state = createInitialState();
            state.flags.z = false;

            const result = simulateLine('JP NZ, $9000', state, {});

            expect((result as any).__jumpTarget).toBe(0x9000);
        });

        it('JP C - Jump if Carry flag set', () => {
            const state = createInitialState();
            state.flags.c = true;

            const result = simulateLine('JP C, $A000', state, {});

            expect((result as any).__jumpTarget).toBe(0xA000);
        });

        it('JP NC - Jump if Carry flag clear', () => {
            const state = createInitialState();
            state.flags.c = false;

            const result = simulateLine('JP NC, $B000', state, {});

            expect((result as any).__jumpTarget).toBe(0xB000);
        });

        it('JR Z - Relative jump if Zero', () => {
            const state = createInitialState();
            state.flags.z = true;

            const result = simulateLine('JR Z, 10', state, {});

            expect((result as any).__relativeJump).toBe(10);
        });

        it('JR NZ - Relative jump if Not Zero', () => {
            const state = createInitialState();
            state.flags.z = false;

            const result = simulateLine('JR NZ, 5', state, {});

            expect((result as any).__relativeJump).toBe(5);
        });
    });

    describe('IX/IY with Negative Displacement', () => {
        it('LD A, (IX-5) - Negative displacement', () => {
            const state = createInitialState();
            state.registers.ix = 0x8010;
            state.memory['STACK:32779'] = 88; // 0x8010 - 5 = 0x800B = 32779 decimal? No, 0x8010 = 32784, -5 = 32779

            // 0x8010 = 32784 decimal
            // 32784 - 5 = 32779
            state.memory['STACK:32779'] = 88;

            const result = simulateLine('LD A, (IX-5)', state, {});

            expect(result.registers.a).toBe(88);
        });

        it('LD B, (IY-10) - Negative IY displacement', () => {
            const state = createInitialState();
            state.registers.iy = 0x9000;
            state.memory['STACK:36854'] = 77; // 0x9000 - 10 = 0x8FF6 = 36854

            const result = simulateLine('LD B, (IY-10)', state, {});

            expect(result.registers.b).toBe(77);
        });
    });

    describe('Edge Cases - Overflow and Underflow', () => {
        it('DEC B - Underflow from 0 to 255', () => {
            const state = createInitialState();
            state.registers.b = 0;

            const result = simulateLine('DEC B', state, {});

            expect(result.registers.b).toBe(255);
        });

        it('ADD HL, HL - 16-bit overflow', () => {
            const state = createInitialState();
            state.registers.h = 0x80;
            state.registers.l = 0x00;

            const result = simulateLine('ADD HL, HL', state, {});

            expect(result.registers.h).toBe(0x00); // Overflow wraps
            expect(result.registers.l).toBe(0x00);
            expect(result.flags.c).toBe(true); // Carry set
        });

        it('SUB with larger value - Underflow', () => {
            const state = createInitialState();
            state.registers.a = 10;

            const result = simulateLine('SUB 20', state, {});

            expect(result.registers.a).toBe(246); // 256 - 10 = 246 (wraps)
            expect(result.flags.c).toBe(true); // Borrow (carry) set
        });
    });

    describe('Additional I/O Operations', () => {
        it('IND - Input and Decrement', () => {
            const state = createInitialState();
            state.registers.h = 0x80;
            state.registers.l = 0x10;
            state.registers.b = 5;
            state.registers.c = 0x99;

            const result = simulateLine('IND', state, {});

            // HL should decrement
            expect(result.registers.l).toBe(0x0F);
            // B should decrement
            expect(result.registers.b).toBe(4);
        });

        it('OUTD - Output and Decrement', () => {
            const state = createInitialState();
            state.registers.h = 0x80;
            state.registers.l = 0x10;
            state.registers.b = 5;

            const result = simulateLine('OUTD', state, {});

            expect(result.registers.l).toBe(0x0F);
            expect(result.registers.b).toBe(4);
        });

        it('INDR - Input, Decrement, Repeat', () => {
            const state = createInitialState();
            state.registers.h = 0x80;
            state.registers.l = 0x05;
            state.registers.b = 3;
            state.registers.c = 0x99;

            const result = simulateLine('INDR', state, {});

            expect(result.registers.b).toBe(0);
            expect(result.flags.z).toBe(true);
        });

        it('OTDR - Output, Decrement, Repeat', () => {
            const state = createInitialState();
            state.registers.h = 0x80;
            state.registers.l = 0x05;
            state.registers.b = 3;

            const result = simulateLine('OTDR', state, {});

            expect(result.registers.b).toBe(0);
            expect(result.flags.z).toBe(true);
        });
    });

    describe('Block Operations Edge Cases', () => {
        it('LDD - Load and Decrement', () => {
            const state = createInitialState();
            state.registers.h = 0x80;
            state.registers.l = 0x10;
            state.registers.d = 0x90;
            state.registers.e = 0x10;
            state.registers.b = 0x00;
            state.registers.c = 0x05;
            state.memory['STACK:32784'] = 42;

            const result = simulateLine('LDD', state, {});

            expect(result.memory['STACK:36880']).toBe(42);
            expect(result.registers.l).toBe(0x0F); // Decremented
            expect(result.registers.e).toBe(0x0F); // Decremented
        });

        it('CPD - Compare and Decrement', () => {
            const state = createInitialState();
            state.registers.a = 42;
            state.registers.h = 0x80;
            state.registers.l = 0x10;
            state.registers.b = 0x00;
            state.registers.c = 0x10;
            state.memory['STACK:32784'] = 50;

            const result = simulateLine('CPD', state, {});

            expect(result.flags.z).toBe(false); // Not found
            expect(result.registers.l).toBe(0x0F); // Decremented
        });

        it('CPDR - Compare, Decrement, Repeat - Not Found', () => {
            const state = createInitialState();
            state.registers.a = 99; // Looking for 99 (not in data)
            state.registers.h = 0x80;
            state.registers.l = 0x05;
            state.registers.b = 0x00;
            state.registers.c = 0x06;

            // Setup data without target value
            state.memory['STACK:32773'] = 10;
            state.memory['STACK:32774'] = 20;
            state.memory['STACK:32775'] = 30;
            state.memory['STACK:32776'] = 40;
            state.memory['STACK:32777'] = 50;
            state.memory['STACK:32778'] = 60;

            const result = simulateLine('CPDR', state, {});

            expect(result.flags.z).toBe(false); // Not found
            expect((result.registers.b << 8) | result.registers.c).toBe(0); // BC exhausted
        });
    });

    describe('Special Flag Conditions', () => {
        it('Parity flag - Even parity', () => {
            const state = createInitialState();
            state.registers.a = 0b00000011; // 2 bits set = even parity

            const result = simulateLine('OR A', state, {}); // Sets PV to parity

            expect(result.flags.pv).toBe(true); // Even parity = 1
        });

        it('Parity flag - Odd parity', () => {
            const state = createInitialState();
            state.registers.a = 0b00000111; // 3 bits set = odd parity

            const result = simulateLine('OR A', state, {});

            expect(result.flags.pv).toBe(false); // Odd parity = 0
        });

        it('Sign flag - Negative number', () => {
            const state = createInitialState();
            state.registers.a = 200;

            const result = simulateLine('OR A', state, {});

            expect(result.flags.s).toBe(true); // Bit 7 set = negative
        });

        it('Sign flag - Positive number', () => {
            const state = createInitialState();
            state.registers.a = 100;

            const result = simulateLine('OR A', state, {});

            expect(result.flags.s).toBe(false); // Bit 7 clear = positive
        });
    });

    describe('16-bit Arithmetic Edge Cases', () => {
        it('ADD HL, BC - No carry', () => {
            const state = createInitialState();
            state.registers.h = 0x10;
            state.registers.l = 0x20;
            state.registers.b = 0x05;
            state.registers.c = 0x30;

            const result = simulateLine('ADD HL, BC', state, {});

            expect(result.registers.h).toBe(0x15);
            expect(result.registers.l).toBe(0x50);
        });

        it('DEC HL - 16-bit decrement', () => {
            const state = createInitialState();
            state.registers.h = 0x10;
            state.registers.l = 0x00;

            const result = simulateLine('DEC HL', state, {});

            expect(result.registers.h).toBe(0x0F);
            expect(result.registers.l).toBe(0xFF);
        });

        it('DEC HL - Underflow', () => {
            const state = createInitialState();
            state.registers.h = 0x00;
            state.registers.l = 0x00;

            const result = simulateLine('DEC HL', state, {});

            expect(result.registers.h).toBe(0xFF);
            expect(result.registers.l).toBe(0xFF);
        });
    });

    describe('Multiple Register Operations', () => {
        it('LD BC, nn - 16-bit load', () => {
            const state = createInitialState();

            const result = simulateLine('LD BC, $1234', state, {});

            expect(result.registers.b).toBe(0x12);
            expect(result.registers.c).toBe(0x34);
        });

        it('LD DE, nn - 16-bit load', () => {
            const state = createInitialState();

            const result = simulateLine('LD DE, $ABCD', state, {});

            expect(result.registers.d).toBe(0xAB);
            expect(result.registers.e).toBe(0xCD);
        });

        it('LD IX, nn - Index register load', () => {
            const state = createInitialState();

            const result = simulateLine('LD IX, $8888', state, {});

            expect(result.registers.ix).toBe(0x8888);
        });

        it('LD IY, nn - Index register load', () => {
            const state = createInitialState();

            const result = simulateLine('LD IY, $9999', state, {});

            expect(result.registers.iy).toBe(0x9999);
        });
    });

    describe('Memory Addressing Modes', () => {
        it('LD (BC), A - Indirect store via BC', () => {
            const state = createInitialState();
            state.registers.a = 77;
            state.registers.b = 0x80;
            state.registers.c = 0x00;

            const result = simulateLine('LD (BC), A', state, {});

            expect(result.memory['STACK:32768']).toBe(77);
        });

        it('LD (DE), A - Indirect store via DE', () => {
            const state = createInitialState();
            state.registers.a = 88;
            state.registers.d = 0x90;
            state.registers.e = 0x00;

            const result = simulateLine('LD (DE), A', state, {});

            expect(result.memory['STACK:36864']).toBe(88);
        });

        it('LD A, (BC) - Indirect load via BC', () => {
            const state = createInitialState();
            state.registers.b = 0x80;
            state.registers.c = 0x00;
            state.memory['STACK:32768'] = 99;

            const result = simulateLine('LD A, (BC)', state, {});

            expect(result.registers.a).toBe(99);
        });

        it('LD A, (DE) - Indirect load via DE', () => {
            const state = createInitialState();
            state.registers.d = 0x90;
            state.registers.e = 0x00;
            state.memory['STACK:36864'] = 111;

            const result = simulateLine('LD A, (DE)', state, {});

            expect(result.registers.a).toBe(111);
        });
    });
});
