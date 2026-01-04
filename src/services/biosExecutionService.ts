// BIOS Execution Service - Manages BIOS ROM tracing context
import { ExecutionStep, StepType, BiosExecutionContext as BaseBiosContext } from '../types';
import { DisassembledInstruction, disassembleRange, isReturnInstruction, isCallInstruction, isJumpInstruction } from './z80Disassembler';
import { getBiosRoutineInfo, readBiosRom } from './cbiosService';

// Extended BIOS context with step tracking (internal use)
export interface BiosExecutionContextFull extends BaseBiosContext {
  biosSteps: BiosStep[];       // Generated steps for current BIOS execution
  currentBiosStepIndex: number; // Which step we're on within BIOS
}

export interface BiosStep {
  address: number;
  instruction: DisassembledInstruction;
  executed: boolean;
}

// BIOS ROM range constants (MSX BIOS is 16KB: 0x0000-0x3FFF)
const BIOS_START = 0x0000;
const BIOS_END = 0x3FFF;
const BIOS_SIZE = BIOS_END - BIOS_START + 1;

// Number of instructions to disassemble for the window view
const DISASSEMBLY_WINDOW_SIZE = 15;

/**
 * Check if an address is in the BIOS ROM range
 */
export const isBiosAddress = (address: number): boolean => {
  return address >= BIOS_START && address <= BIOS_END;
};

/**
 * Create a ROM reader function for the disassembler
 */
export const createBiosRomReader = (): ((address: number) => number) => {
  return (address: number): number => {
    const byte = readBiosRom(address);
    return byte !== null ? byte : 0;
  };
};

/**
 * Enter BIOS execution context
 */
export const enterBiosContext = (
  entryAddress: number,
  returnAddress: number,
  callDepth: number = 0
): BiosExecutionContextFull => {
  const routineInfo = getBiosRoutineInfo(entryAddress);
  const routineName = routineInfo?.name || `BIOS:$${entryAddress.toString(16).toUpperCase().padStart(4, '0')}`;

  // Generate initial disassembly window
  const romReader = createBiosRomReader();
  const initialSteps = generateBiosSteps(romReader, entryAddress, DISASSEMBLY_WINDOW_SIZE);

  return {
    active: true,
    entryAddress,
    currentPC: entryAddress,
    returnAddress,
    biosSteps: initialSteps,
    currentBiosStepIndex: 0,
    routineName,
    callDepth
  };
};

/**
 * Generate BiosStep array from disassembly
 */
const generateBiosSteps = (
  romReader: (address: number) => number,
  startAddress: number,
  count: number
): BiosStep[] => {
  const instructions = disassembleRange(romReader, startAddress, count);
  return instructions.map((instr, idx) => ({
    address: instr.address,
    instruction: instr,
    executed: idx === 0 // First instruction is about to be executed
  }));
};

/**
 * Convert a BiosStep to an ExecutionStep for UI compatibility
 */
export const biosStepToExecutionStep = (
  biosStep: BiosStep,
  stepId: number
): ExecutionStep => {
  const instr = biosStep.instruction;

  let stepType = StepType.INSTRUCTION;
  if (isCallInstruction(instr)) {
    stepType = StepType.CALL;
  } else if (isJumpInstruction(instr)) {
    stepType = StepType.JUMP;
  } else if (isReturnInstruction(instr)) {
    stepType = StepType.RETURN;
  }

  // Check if this address is a known BIOS routine
  const routineInfo = getBiosRoutineInfo(instr.address);
  const description = routineInfo
    ? `${routineInfo.name}: ${routineInfo.description}`
    : `${instr.mnemonic} ${instr.operands}`;

  return {
    id: stepId,
    lineNumber: -instr.address, // Negative to distinguish from user code lines
    opcode: instr.mnemonic,
    operands: instr.operands,
    type: stepType,
    description,
    cycles: instr.cycles,
  };
};

/**
 * Advance the BIOS execution context to the next instruction
 */
export const advanceBiosPC = (
  context: BiosExecutionContextFull,
  newPC: number
): BiosExecutionContextFull => {
  const romReader = createBiosRomReader();

  // Find if newPC is already in our steps
  const existingStepIdx = context.biosSteps.findIndex(s => s.address === newPC);

  if (existingStepIdx !== -1) {
    // PC is within our current window
    const updatedSteps = context.biosSteps.map((step, idx) => ({
      ...step,
      executed: idx <= existingStepIdx
    }));

    return {
      ...context,
      currentPC: newPC,
      biosSteps: updatedSteps,
      currentBiosStepIndex: existingStepIdx
    };
  }

  // PC jumped outside our window, regenerate around new PC
  const newSteps = generateBiosSteps(romReader, newPC, DISASSEMBLY_WINDOW_SIZE);

  return {
    ...context,
    currentPC: newPC,
    biosSteps: newSteps,
    currentBiosStepIndex: 0
  };
};

/**
 * Get the current BIOS instruction
 */
export const getCurrentBiosInstruction = (
  context: BiosExecutionContextFull
): DisassembledInstruction | null => {
  if (!context.active || context.currentBiosStepIndex >= context.biosSteps.length) {
    return null;
  }
  return context.biosSteps[context.currentBiosStepIndex].instruction;
};

/**
 * Check if current instruction would exit BIOS
 * Returns the return address if exiting, null otherwise
 */
export const checkBiosExit = (
  context: BiosExecutionContextFull,
  instruction: DisassembledInstruction,
  stackPointer: number,
  readMemory: (address: number) => number
): number | null => {
  if (!isReturnInstruction(instruction)) {
    return null;
  }

  // For unconditional RET, always check return address
  // For conditional RET, the caller must evaluate the condition first
  if (instruction.operands === '' || instruction.mnemonic === 'RETI' || instruction.mnemonic === 'RETN') {
    // Read return address from stack (little endian)
    const lowByte = readMemory(stackPointer);
    const highByte = readMemory(stackPointer + 1);
    const returnAddr = (highByte << 8) | lowByte;

    // If return address is outside BIOS, we're exiting
    if (!isBiosAddress(returnAddr)) {
      return returnAddr;
    }
  }

  return null;
};

/**
 * Get visible BIOS steps for the UI (window around current PC)
 */
export const getVisibleBiosSteps = (
  context: BiosExecutionContextFull,
  windowSize: number = DISASSEMBLY_WINDOW_SIZE
): BiosStep[] => {
  if (!context.active) {
    return [];
  }

  const currentIdx = context.currentBiosStepIndex;
  const halfWindow = Math.floor(windowSize / 2);

  // Calculate start index to center current instruction
  let startIdx = Math.max(0, currentIdx - halfWindow);
  let endIdx = Math.min(context.biosSteps.length, startIdx + windowSize);

  // Adjust if we hit the end
  if (endIdx - startIdx < windowSize && startIdx > 0) {
    startIdx = Math.max(0, endIdx - windowSize);
  }

  return context.biosSteps.slice(startIdx, endIdx);
};

/**
 * Expand BIOS steps if needed (when scrolling forward)
 */
export const expandBiosSteps = (
  context: BiosExecutionContextFull,
  additionalCount: number = 10
): BiosExecutionContextFull => {
  if (!context.active || context.biosSteps.length === 0) {
    return context;
  }

  const lastStep = context.biosSteps[context.biosSteps.length - 1];
  const nextAddress = lastStep.address + lastStep.instruction.size;

  // Don't expand beyond BIOS
  if (nextAddress > BIOS_END) {
    return context;
  }

  const romReader = createBiosRomReader();
  const newSteps = generateBiosSteps(romReader, nextAddress, additionalCount);

  return {
    ...context,
    biosSteps: [...context.biosSteps, ...newSteps]
  };
};

/**
 * Get BIOS routine info for display
 */
export const getBiosContextInfo = (context: BiosExecutionContextFull): {
  routineName: string;
  entryAddress: string;
  currentPC: string;
  description: string;
} => {
  const routineInfo = getBiosRoutineInfo(context.entryAddress);

  return {
    routineName: context.routineName,
    entryAddress: `$${context.entryAddress.toString(16).toUpperCase().padStart(4, '0')}`,
    currentPC: `$${context.currentPC.toString(16).toUpperCase().padStart(4, '0')}`,
    description: routineInfo?.description || 'Unknown BIOS routine'
  };
};

/**
 * Create an empty/inactive BIOS context
 */
export const createInactiveBiosContext = (): BiosExecutionContextFull => ({
  active: false,
  entryAddress: 0,
  currentPC: 0,
  returnAddress: 0,
  biosSteps: [],
  currentBiosStepIndex: 0,
  routineName: '',
  callDepth: 0
});

/**
 * Format a BIOS address as a hex string
 */
export const formatBiosAddress = (address: number): string => {
  return `$${address.toString(16).toUpperCase().padStart(4, '0')}`;
};

/**
 * Get the instruction bytes as a formatted hex string
 */
export const formatInstructionBytes = (instruction: DisassembledInstruction): string => {
  return instruction.bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
};
