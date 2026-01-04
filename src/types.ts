
export enum StepType {
  INSTRUCTION = 'INSTRUCTION',
  CALL = 'CALL',
  JUMP = 'JUMP',
  RETURN = 'RETURN',
  LOOP = 'LOOP',
  INFINITE_LOOP = 'INFINITE_LOOP',
  BUG_WARNING = 'BUG_WARNING',
  BIOS_INSTRUCTION = 'BIOS_INSTRUCTION',
}

export interface MemoryVariable {
  name: string;
  address?: string; // Hex string like C000 if defined via EQU
  value: number; // The byte value (0-255)
  lastModifiedStepId: number;
}

export interface Constant {
  name: string;
  value: number;
  hex: string;
}

export interface ExecutionStep {
  id: number;
  lineNumber: number; // The visual line number in the source file
  opcode: string;
  operands: string;
  type: StepType;
  description: string; // "Call init_sprites", "Loop repeats 10 times"
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'; // For bugs
  cycles: number; // T-States

  // State Simulation
  registerA?: number | null; // Value of Accumulator at this step
  memoryChange?: { name: string; value: number; address?: string } | null; // Did this step write to RAM?

  // BIOS ROM tracing fields
  isBios?: boolean;           // True if this step is from BIOS ROM
  biosAddress?: number;       // Absolute address in BIOS ROM
  biosRoutineName?: string;   // Name of BIOS routine (e.g., "CHPUT")
}

export interface AnalysisResult {
  steps: ExecutionStep[];
  generalReview: string;
  detectedBugs: string[];
  initialVariables: MemoryVariable[]; // Initial state of variables detected (usually 0)
  constants: Constant[]; // Constants defined via EQU (usually ROM addresses or values)
  symbolTable: { [label: string]: number }; // Map of labels to Addresses (values)
  labels: { [label: string]: number }; // Map of labels to Line Numbers (source code)
  memoryMap: { [address: number]: number }; // Static memory map (Address -> Value) from DB statements
  lineAddresses: { [line: number]: number }; // Map of Visual Line Number -> Memory Address
  entryLine?: number; // Visual line number where execution starts (e.g. from ROM header)
}

export interface StackFrame {
  returnLine: number; // The visual line number to return to
  returnStepIndex: number; // The step index in the main analysis (if applicable)
  subroutineName: string; // Name of the subroutine we entered

  // BIOS call tracking
  isBiosCall?: boolean;       // True if this frame entered BIOS ROM
  biosEntryAddress?: number;  // BIOS entry point address if applicable
}

export interface ReachabilityResult {
  isReachable: boolean;
  status: 'EXECUTED' | 'REFERENCED' | 'DEAD_CODE' | 'NOT_FOUND';
  tracePath: string[]; // A short path example "Start -> init -> main_loop -> target"
  referenceCount: number;
  labelLine: number;
}

export interface Z80Flags {
  z: boolean;  // Zero Flag
  c: boolean;  // Carry Flag
  s: boolean;  // Sign Flag (Negative)
  pv: boolean; // Parity/Overflow Flag (New)
}

export interface Z80Registers {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  h: number;
  l: number;
  sp: number; // Stack Pointer
}

export interface VDPState {
  vram: number[]; // 16KB VRAM (0-16383)
  addressRegister: number; // The pointer set by Port $99
  writeLatch: boolean; // Toggle for Port $99 first/second byte
  registerLatch: number; // Temp storage for first byte of address
}

export interface CBiosState {
  loaded: boolean;
  version: 'msx1' | 'msx2' | 'msx2+';
  mainRomSize: number;
  subRomSize: number;
}

// BIOS ROM tracing context (simplified for AppState)
export interface BiosExecutionContext {
  active: boolean;
  entryAddress: number;        // Address where we entered BIOS
  currentPC: number;           // Current program counter in BIOS
  returnAddress: number;       // Where to return in user code
  routineName: string;         // Name of the BIOS routine (e.g., "CHPUT")
  callDepth: number;           // Track nested BIOS calls
}

export interface NavigationSnapshot {
  currentStepIndex: number;
  manualLine: number | null;
  callStack: StackFrame[];
  // Snapshot of simulation state
  liveRegisters: Z80Registers;
  liveFlags: Z80Flags;
  liveMemory: { [name: string]: number };
  liveVDP: VDPState; // Added VDP State
  biosContext: BiosExecutionContext | null; // BIOS execution state
}

export interface AppState {
  code: string;
  fileName: string | null;
  isLoading: boolean;
  error: string | null;
  analysis: AnalysisResult | null;
  currentStepIndex: number;
  
  // Interactive State
  isEditing: boolean; // Toggle editor
  isPlaying: boolean; // Auto-run mode
  breakpoints: Set<number>; // Line numbers
  showVDP: boolean; // Show VDP Dialog
  
  // Recursive Navigation State
  manualLine: number | null; // If not null, we are stepping manually at this line number (off-road)
  callStack: StackFrame[]; // Stack history for Step In/Out
  
  // History for Undo
  history: NavigationSnapshot[];

  // Live Simulation State
  liveRegisters: Z80Registers;
  liveFlags: Z80Flags; // CPU Flags
  liveMemory: { [name: string]: number }; // Map of VariableName -> Value
  liveVDP: VDPState; // Added VDP State

  // C-BIOS State
  showCBios: boolean; // Show C-BIOS loader dialog
  cbiosState: CBiosState;

  // BIOS ROM Tracing
  biosContext: BiosExecutionContext | null; // Active BIOS execution context
}
