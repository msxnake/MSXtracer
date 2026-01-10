
import {
    ConditionalBreakpoint,
    MemoryWatchpoint,
    RegisterWatchpoint,
    AccessBreakpoint,
    BreakpointTrigger,
    Z80Registers
} from '../types';
import { SimulationState } from './z80Simulator';
import { evaluateCondition } from './conditionEvaluator';

/**
 * Check if a conditional breakpoint should trigger
 */
export const checkConditionalBreakpoint = (
    breakpoint: ConditionalBreakpoint,
    lineNumber: number,
    registers: Z80Registers,
    memory: { [name: string]: number },
    symbolTable: { [label: string]: number }
): BreakpointTrigger | null => {
    if (!breakpoint.enabled || breakpoint.lineNumber !== lineNumber) {
        return null;
    }

    const conditionMet = evaluateCondition(
        breakpoint.condition,
        registers,
        memory,
        symbolTable
    );

    if (conditionMet) {
        return {
            type: 'conditional',
            id: breakpoint.id,
            description: `Conditional breakpoint: ${breakpoint.condition.leftOperand} ${breakpoint.condition.operator} ${breakpoint.condition.rightOperand} `
        };
    }

    return null;
};

/**
 * Resolve address from label or hex string
 */
const resolveAddress = (
    addressOrLabel: string,
    symbolTable: { [label: string]: number }
): number | null => {
    const trimmed = addressOrLabel.trim().toUpperCase();

    // Check if it's a hex address
    if (trimmed.startsWith('0X')) {
        return parseInt(trimmed.substring(2), 16);
    }
    if (trimmed.startsWith('$')) {
        return parseInt(trimmed.substring(1), 16);
    }

    // Check symbol table for label
    if (symbolTable[trimmed] !== undefined) {
        return symbolTable[trimmed];
    }

    // Try parsing as decimal
    const num = parseInt(trimmed);
    if (!isNaN(num)) {
        return num;
    }

    return null;
};

/**
 * Check if a memory watchpoint should trigger
 */
export const checkMemoryWatchpoints = (
    watchpoints: MemoryWatchpoint[],
    simState: SimulationState,
    symbolTable: { [label: string]: number }
): BreakpointTrigger | null => {
    if (!simState.memoryAccesses) return null;

    for (const wp of watchpoints) {
        if (!wp.enabled) continue;

        const addr = resolveAddress(wp.addressOrLabel, symbolTable);
        if (addr === null) continue;

        let triggered = false;
        let accessType = '';

        // Check for read access
        if ((wp.type === 'read' || wp.type === 'both') && simState.memoryAccesses.reads.includes(addr)) {
            triggered = true;
            accessType = 'read';
        }

        // Check for write access
        if ((wp.type === 'write' || wp.type === 'both') && simState.memoryAccesses.writes.includes(addr)) {
            triggered = true;
            accessType = accessType ? 'read/write' : 'write';
        }

        if (triggered) {
            return {
                type: 'memory',
                id: wp.id,
                description: `Memory watchpoint: ${accessType} at ${wp.addressOrLabel} (0x${addr.toString(16).toUpperCase()})`,
                address: addr
            };
        }
    }

    return null;
};

/**
 * Check if a register watchpoint should trigger
 */
export const checkRegisterWatchpoints = (
    watchpoints: RegisterWatchpoint[],
    registers: Z80Registers,
    memory: { [name: string]: number },
    symbolTable: { [label: string]: number }
): BreakpointTrigger | null => {
    for (const rw of watchpoints) {
        if (!rw.enabled) continue;

        const conditionMet = evaluateCondition(
            rw.condition,
            registers,
            memory,
            symbolTable
        );

        if (conditionMet) {
            const regValue = registers[rw.register];
            return {
                type: 'register',
                id: rw.id,
                description: `Register watchpoint: ${rw.register} = 0x${regValue.toString(16).toUpperCase()} (${rw.condition.leftOperand} ${rw.condition.operator} ${rw.condition.rightOperand})`
            };
        }
    }

    return null;
};

/**
 * Check if an access breakpoint should trigger
 */
export const checkAccessBreakpoints = (
    breakpoints: AccessBreakpoint[],
    simState: SimulationState,
    symbolTable: { [label: string]: number }
): BreakpointTrigger | null => {
    if (!simState.memoryAccesses) return null;

    for (const bp of breakpoints) {
        if (!bp.enabled) continue;

        const addr = resolveAddress(bp.addressOrLabel, symbolTable);
        if (addr === null) continue;

        let triggered = false;

        if (bp.accessType === 'read' && simState.memoryAccesses.reads.includes(addr)) {
            triggered = true;
        } else if (bp.accessType === 'write' && simState.memoryAccesses.writes.includes(addr)) {
            triggered = true;
        }

        if (triggered) {
            return {
                type: 'access',
                id: bp.id,
                description: `Access breakpoint: ${bp.accessType} at ${bp.addressOrLabel} (0x${addr.toString(16).toUpperCase()})`,
                address: addr
            };
        }
    }

    return null;
};

/**
 * Check all advanced breakpoint types
 */
export const checkAllBreakpoints = (
    appState: {
        conditionalBreakpoints: ConditionalBreakpoint[];
        memoryWatchpoints: MemoryWatchpoint[];
        registerWatchpoints: RegisterWatchpoint[];
        accessBreakpoints: AccessBreakpoint[];
    },
    lineNumber: number,
    simState: SimulationState,
    symbolTable: { [label: string]: number }
): BreakpointTrigger | null => {
    // Check conditional breakpoints
    for (const bp of appState.conditionalBreakpoints) {
        const trigger = checkConditionalBreakpoint(
            bp,
            lineNumber,
            simState.registers,
            simState.memory,
            symbolTable
        );
        if (trigger) return trigger;
    }

    // Check memory watchpoints
    const memTrigger = checkMemoryWatchpoints(
        appState.memoryWatchpoints,
        simState,
        symbolTable
    );
    if (memTrigger) return memTrigger;

    // Check register watchpoints
    const regTrigger = checkRegisterWatchpoints(
        appState.registerWatchpoints,
        simState.registers,
        simState.memory,
        symbolTable
    );
    if (regTrigger) return regTrigger;

    // Check access breakpoints
    const accessTrigger = checkAccessBreakpoints(
        appState.accessBreakpoints,
        simState,
        symbolTable
    );
    if (accessTrigger) return accessTrigger;

    return null;
};

/**
 * Increment hit counter for triggered breakpoint
 */
export const incrementBreakpointHitCount = (
    appState: {
        conditionalBreakpoints: ConditionalBreakpoint[];
        memoryWatchpoints: MemoryWatchpoint[];
        registerWatchpoints: RegisterWatchpoint[];
        accessBreakpoints: AccessBreakpoint[];
    },
    trigger: BreakpointTrigger
): void => {
    switch (trigger.type) {
        case 'conditional':
            const cbp = appState.conditionalBreakpoints.find(b => b.id === trigger.id);
            if (cbp) cbp.hitCount++;
            break;
        case 'memory':
            const mwp = appState.memoryWatchpoints.find(w => w.id === trigger.id);
            if (mwp) mwp.hitCount++;
            break;
        case 'register':
            const rwp = appState.registerWatchpoints.find(w => w.id === trigger.id);
            if (rwp) rwp.hitCount++;
            break;
        case 'access':
            const abp = appState.accessBreakpoints.find(b => b.id === trigger.id);
            if (abp) abp.hitCount++;
            break;
    }
};
