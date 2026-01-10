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

describe('Z80 Simulator - Rotate & Shift Instructions', () => {
    describe('Accumulator Rotates', () => {
        it('RLCA - Rotate Left Circular A', () => {
            const state = createInitialState();
            state.registers.a = 0b10000001;

            const result = simulateLine('RLCA', state, {});

            expect(result.registers.a).toBe(0b00000011);
            expect(result.flags.c).toBe(true); // Bit 7 goes to carry
        });

        it('RRCA - Rotate Right Circular A', () => {
            const state = createInitialState();
            state.registers.a = 0b10000001;

            const result = simulateLine('RRCA', state, {});

            expect(result.registers.a).toBe(0b11000000);
            expect(result.flags.c).toBe(true); // Bit 0 goes to carry
        });

        it('RLA - Rotate Left through Carry', () => {
            const state = createInitialState();
            state.registers.a = 0b10000000;
            state.flags.c = true;

            const result = simulateLine('RLA', state, {});

            expect(result.registers.a).toBe(0b00000001); // Carry rotates in
            expect(result.flags.c).toBe(true); // Bit 7 goes to carry
        });

        it('RRA - Rotate Right through Carry', () => {
            const state = createInitialState();
            state.registers.a = 0b00000001;
            state.flags.c = true;

            const result = simulateLine('RRA', state, {});

            expect(result.registers.a).toBe(0b10000000); // Carry rotates in
            expect(result.flags.c).toBe(true); // Bit 0 goes to carry
        });
    });

    describe('Extended Rotates (All Registers)', () => {
        it('RLC B - Rotate Left Circular', () => {
            const state = createInitialState();
            state.registers.b = 0b10101010;

            const result = simulateLine('RLC B', state, {});

            expect(result.registers.b).toBe(0b01010101);
            expect(result.flags.c).toBe(true);
        });

        it('RRC C - Rotate Right Circular', () => {
            const state = createInitialState();
            state.registers.c = 0b10101011;

            const result = simulateLine('RRC C', state, {});

            expect(result.registers.c).toBe(0b11010101);
            expect(result.flags.c).toBe(true);
        });

        it('RL D - Rotate Left through Carry', () => {
            const state = createInitialState();
            state.registers.d = 0b01111111;
            state.flags.c = false;

            const result = simulateLine('RL D', state, {});

            expect(result.registers.d).toBe(0b11111110);
            expect(result.flags.c).toBe(false);
        });

        it('RR E - Rotate Right through Carry', () => {
            const state = createInitialState();
            state.registers.e = 0b11111110;
            state.flags.c = true;

            const result = simulateLine('RR E', state, {});

            expect(result.registers.e).toBe(0b11111111);
            expect(result.flags.c).toBe(false);
        });
    });

    describe('Shift Instructions', () => {
        it('SLA A - Shift Left Arithmetic', () => {
            const state = createInitialState();
            state.registers.a = 0b01010101;

            const result = simulateLine('SLA A', state, {});

            expect(result.registers.a).toBe(0b10101010); // Multiply by 2
            expect(result.flags.c).toBe(false); // Bit 7 was 0
        });

        it('SLA with overflow', () => {
            const state = createInitialState();
            state.registers.a = 0b11000000;

            const result = simulateLine('SLA A', state, {});

            expect(result.registers.a).toBe(0b10000000);
            expect(result.flags.c).toBe(true); // Bit 7 was 1
        });

        it('SRA A - Shift Right Arithmetic (preserve sign)', () => {
            const state = createInitialState();
            state.registers.a = 0b11000000; // Negative number

            const result = simulateLine('SRA A', state, {});

            expect(result.registers.a).toBe(0b11100000); // Sign bit preserved
            expect(result.flags.c).toBe(false);
        });

        it('SRL A - Shift Right Logical', () => {
            const state = createInitialState();
            state.registers.a = 0b11000001;

            const result = simulateLine('SRL A', state, {});

            expect(result.registers.a).toBe(0b01100000); // Divide by 2, sign not preserved
            expect(result.flags.c).toBe(true); // Bit 0 was 1
        });
    });

    describe('BCD Rotates', () => {
        it('RLD - Rotate Left Digit', () => {
            const state = createInitialState();
            state.registers.a = 0x7A; // A = 0111 1010
            state.registers.h = 0x80;
            state.registers.l = 0x00;
            state.memory['STACK:32768'] = 0x31; // (HL) = 0011 0001

            const result = simulateLine('RLD', state, {});

            // A low nibble gets (HL) high nibble
            // A[3:0] ← (HL)[7:4] ← (HL)[3:0] ← A[3:0]
            expect(result.registers.a).toBe(0x73); // 0111 0011
            expect(result.memory['STACK:32768']).toBe(0x1A); // 0001 1010
        });

        it('RRD - Rotate Right Digit', () => {
            const state = createInitialState();
            state.registers.a = 0x84; // A = 1000 0100
            state.registers.h = 0x80;
            state.registers.l = 0x00;
            state.memory['STACK:32768'] = 0x20; // (HL) = 0010 0000

            const result = simulateLine('RRD', state, {});

            // A[3:0] ← (HL)[3:0] ← (HL)[7:4] ← A[3:0]
            expect(result.registers.a).toBe(0x80); // 1000 0000
            expect(result.memory['STACK:32768']).toBe(0x42); // 0100 0010
        });
    });
});

describe('Z80 Simulator - Block Operations', () => {
    describe('LDI/LDIR - Load Block', () => {
        it('LDI - Load and Increment', () => {
            const state = createInitialState();
            state.registers.h = 0x80;
            state.registers.l = 0x00;
            state.registers.d = 0x90;
            state.registers.e = 0x00;
            state.registers.b = 0x00;
            state.registers.c = 0x10; // BC = 16
            state.memory['STACK:32768'] = 42;

            const result = simulateLine('LDI', state, {});

            expect(result.memory['STACK:36864']).toBe(42); // Copied to DE
            expect(result.registers.h).toBe(0x80);
            expect(result.registers.l).toBe(0x01); // HL++
            expect(result.registers.d).toBe(0x90);
            expect(result.registers.e).toBe(0x01); // DE++
            expect((result.registers.b << 8) | result.registers.c).toBe(15); // BC--
        });

        it('LDIR - Load, Increment, Repeat', () => {
            const state = createInitialState();
            state.registers.h = 0x80;
            state.registers.l = 0x00; // HL = source
            state.registers.d = 0x90;
            state.registers.e = 0x00; // DE = dest
            state.registers.b = 0x00;
            state.registers.c = 0x04; // BC = 4 bytes to copy

            // Setup source data
            state.memory['STACK:32768'] = 1;
            state.memory['STACK:32769'] = 2;
            state.memory['STACK:32770'] = 3;
            state.memory['STACK:32771'] = 4;

            const result = simulateLine('LDIR', state, {});

            // Verify data copied
            expect(result.memory['STACK:36864']).toBe(1);
            expect(result.memory['STACK:36865']).toBe(2);
            expect(result.memory['STACK:36866']).toBe(3);
            expect(result.memory['STACK:36867']).toBe(4);

            // Verify registers updated
            expect(result.registers.h).toBe(0x80);
            expect(result.registers.l).toBe(0x04); // HL += 4
            expect(result.registers.d).toBe(0x90);
            expect(result.registers.e).toBe(0x04); // DE += 4
            expect((result.registers.b << 8) | result.registers.c).toBe(0); // BC = 0
        });

        it('LDDR - Load, Decrement, Repeat', () => {
            const state = createInitialState();
            state.registers.h = 0x80;
            state.registers.l = 0x03; // HL = source end
            state.registers.d = 0x90;
            state.registers.e = 0x03; // DE = dest end
            state.registers.b = 0x00;
            state.registers.c = 0x04; // BC = 4 bytes

            // Setup source data
            state.memory['STACK:32768'] = 1;
            state.memory['STACK:32769'] = 2;
            state.memory['STACK:32770'] = 3;
            state.memory['STACK:32771'] = 4;

            const result = simulateLine('LDDR', state, {});

            // Verify copied backwards
            expect(result.memory['STACK:36864']).toBe(1);
            expect(result.memory['STACK:36865']).toBe(2);
            expect(result.memory['STACK:36866']).toBe(3);
            expect(result.memory['STACK:36867']).toBe(4);
        });
    });

    describe('CPI/CPIR - Compare Block', () => {
        it('CPI - Compare and Increment', () => {
            const state = createInitialState();
            state.registers.a = 42;
            state.registers.h = 0x80;
            state.registers.l = 0x00;
            state.registers.b = 0x00;
            state.registers.c = 0x10;
            state.memory['STACK:32768'] = 50; // Not equal

            const result = simulateLine('CPI', state, {});

            expect(result.flags.z).toBe(false); // Not found
            expect(result.registers.l).toBe(0x01); // HL++
            expect((result.registers.b << 8) | result.registers.c).toBe(15); // BC--
        });

        it('CPIR - Search for byte', () => {
            const state = createInitialState();
            state.registers.a = 42; // Looking for 42
            state.registers.h = 0x80;
            state.registers.l = 0x00;
            state.registers.b = 0x00;
            state.registers.c = 0x05; // Search 5 bytes

            // Setup data with target at position 3
            state.memory['STACK:32768'] = 10;
            state.memory['STACK:32769'] = 20;
            state.memory['STACK:32770'] = 30;
            state.memory['STACK:32771'] = 42; // Found!
            state.memory['STACK:32772'] = 50;

            const result = simulateLine('CPIR', state, {});

            expect(result.flags.z).toBe(true); // Found
            // HL increments during search, stops when found at position 3
            expect(result.registers.l).toBe(0x03);
        });

        it('CPIR - Not found', () => {
            const state = createInitialState();
            state.registers.a = 99; // Looking for 99
            state.registers.h = 0x80;
            state.registers.l = 0x00;
            state.registers.b = 0x00;
            state.registers.c = 0x03;

            state.memory['STACK:32768'] = 1;
            state.memory['STACK:32769'] = 2;
            state.memory['STACK:32770'] = 3;

            const result = simulateLine('CPIR', state, {});

            expect(result.flags.z).toBe(false); // Not found
            expect((result.registers.b << 8) | result.registers.c).toBe(0); // BC exhausted
        });
    });
});

describe('Z80 Simulator - Control Flow', () => {
    describe('NOP and HALT', () => {
        it('NOP - No Operation', () => {
            const state = createInitialState();
            state.registers.a = 42;

            const result = simulateLine('NOP', state, {});

            expect(result.registers.a).toBe(42); // Nothing changed
        });

        it('HALT - Halt execution', () => {
            const state = createInitialState();

            const result = simulateLine('HALT', state, {});

            // In simulation, HALT is acknowledged but doesn't block
            expect(result).toBeDefined();
        });
    });

    describe('Flags Operations', () => {
        it('SCF - Set Carry Flag', () => {
            const state = createInitialState();
            state.flags.c = false;

            const result = simulateLine('SCF', state, {});

            expect(result.flags.c).toBe(true);
        });

        it('CCF - Complement Carry Flag', () => {
            const state = createInitialState();
            state.flags.c = true;

            const result = simulateLine('CCF', state, {});

            expect(result.flags.c).toBe(false);
        });
    });

    describe('Interrupt Control', () => {
        it('DI - Disable Interrupts', () => {
            const state = createInitialState();

            const result = simulateLine('DI', state, {});

            expect(result).toBeDefined(); // Acknowledged
        });

        it('EI - Enable Interrupts', () => {
            const state = createInitialState();

            const result = simulateLine('EI', state, {});

            expect(result).toBeDefined(); // Acknowledged
        });

        it('IM 1 - Set Interrupt Mode', () => {
            const state = createInitialState();

            const result = simulateLine('IM 1', state, {});

            expect(result).toBeDefined(); // Acknowledged
        });
    });
});

describe('Z80 Simulator - IX/IY Index Registers', () => {
    describe('LD with IX/IY displacement', () => {
        it('LD A, (IX+5) - Load with positive displacement', () => {
            const state = createInitialState();
            state.registers.ix = 0x8000;
            state.memory['STACK:32773'] = 99; // 0x8000 + 5 = 0x8005 = 32773

            const result = simulateLine('LD A, (IX+5)', state, {});

            expect(result.registers.a).toBe(99);
        });

        it('LD B, (IY+10) - Load with IY', () => {
            const state = createInitialState();
            state.registers.iy = 0x9000;
            state.memory['STACK:36874'] = 123; // 0x9000 + 10 = 36874

            const result = simulateLine('LD B, (IY+10)', state, {});

            expect(result.registers.b).toBe(123);
        });

        it('LD A, (IX+0) - Zero displacement', () => {
            const state = createInitialState();
            state.registers.ix = 0x8000;
            state.memory['STACK:32768'] = 77;

            const result = simulateLine('LD A, (IX+0)', state, {});

            expect(result.registers.a).toBe(77);
        });

        it('LD A, (IX) - No displacement', () => {
            const state = createInitialState();
            state.registers.ix = 0x8000;
            state.memory['STACK:32768'] = 55;

            const result = simulateLine('LD A, (IX)', state, {});

            expect(result.registers.a).toBe(55);
        });
    });
});
