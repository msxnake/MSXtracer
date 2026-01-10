
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
  // Main registers
  a: number;
  f: number;  // Flags register (8-bit)
  b: number;
  c: number;
  d: number;
  e: number;
  h: number;
  l: number;

  // Alternate register set (shadow registers)
  a_prime: number;  // A'
  f_prime: number;  // F'
  b_prime: number;  // B'
  c_prime: number;  // C'
  d_prime: number;  // D'
  e_prime: number;  // E'
  h_prime: number;  // H'
  l_prime: number;  // L'

  // Index registers
  ix: number;  // Index Register X (16-bit)
  iy: number;  // Index Register Y (16-bit)

  // Special purpose registers
  i: number;   // Interrupt Vector Register
  r: number;   // Memory Refresh Register

  // Stack Pointer
  sp: number;  // Stack Pointer (16-bit)

  // Program Counter (for reference, though usually tracked separately)
  pc: number;  // Program Counter (16-bit)
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

// ===== ADVANCED DEBUGGING TYPES =====

// Comparison operators for conditional expressions
export type ComparisonOperator = '==' | '!=' | '>' | '<' | '>=' | '<=';

// Condition expression for breakpoints
export interface BreakpointCondition {
  leftOperand: string;    // Register name ('A', 'HL', 'BC', etc.) or memory address
  operator: ComparisonOperator;
  rightOperand: string;   // Value (hex/dec) or another register name
}

// Conditional breakpoint - stops when condition is true at a specific line
export interface ConditionalBreakpoint {
  id: string;
  lineNumber: number;
  condition: BreakpointCondition;
  enabled: boolean;
  hitCount: number;
  description?: string;   // User-friendly description
}

// Memory watchpoint - monitors memory address or label for changes
export interface MemoryWatchpoint {
  id: string;
  addressOrLabel: string;  // Memory address (hex like '0xC000') or label name
  type: 'read' | 'write' | 'both';
  enabled: boolean;
  hitCount: number;
  lastValue?: number;      // Track previous value for change detection
  description?: string;
}

// Register watchpoint - triggers when register meets condition
export interface RegisterWatchpoint {
  id: string;
  register: keyof Z80Registers;
  condition: BreakpointCondition;
  enabled: boolean;
  hitCount: number;
  description?: string;
}

// Access breakpoint - stops on specific memory access type
export interface AccessBreakpoint {
  id: string;
  addressOrLabel: string;
  accessType: 'read' | 'write';
  enabled: boolean;
  hitCount: number;
  description?: string;
}

// Memory access tracking for simulator
export interface MemoryAccess {
  reads: number[];   // Addresses read during instruction
  writes: number[];  // Addresses written during instruction
}

// Register change tracking for simulator
export interface RegisterChange {
  register: keyof Z80Registers;
  oldValue: number;
  newValue: number;
}

// Breakpoint trigger information
export interface BreakpointTrigger {
  type: 'conditional' | 'memory' | 'register' | 'access';
  id: string;
  description: string;
  address?: number;
}

// ===== WATCHLIST TYPES =====

// Type of value to watch
export type WatchType = 'register' | 'memory' | 'flag';

// Watchlist item for monitoring specific values
export interface WatchlistItem {
  id: string;
  type: WatchType;
  name: string;              // Display name (e.g., "A Register", "Player X Position")
  expression: string;        // What to watch: "a", "hl", "0xC000", "PLAYER_X"
  previousValue?: number;    // Previous value for change detection
  currentValue?: number;     // Current resolved value
  enabled: boolean;
}

// ===== TIMING & PERFORMANCE TYPES =====

// MSX timing configuration
export interface MSXTimingConfig {
  cpuFrequency: number;      // CPU frequency in Hz (3579545 for NTSC, 3546894 for PAL)
  vblankFrequency: number;   // VBLANK frequency in Hz (60 for NTSC, 50 for PAL)
  cyclesPerFrame: number;    // Calculated T-states per frame
  name: 'NTSC' | 'PAL';      // Timing mode name
}

// Timing state for simulation
export interface TimingState {
  totalCycles: number;           // Total accumulated T-states
  cyclesSinceVBlank: number;     // Cycles since last VBLANK
  frameCount: number;            // Number of VBLANKs occurred
  lastInstructionCycles: number; // T-states of last executed instruction
  interruptPending: boolean;     // Is interrupt pending?
}

// Interrupt state
export interface InterruptState {
  maskable: boolean;        // IM mode enabled
  mode: 0 | 1 | 2;         // Interrupt mode
  enabled: boolean;         // EI/DI state
  vector: number;          // Interrupt vector (for IM 2)
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
  executionSpeed: number; // Instructions per interval in Play mode (1, 10, 100, 1000)
  breakpoints: Set<number>; // Line numbers (simple breakpoints)
  showVDP: boolean; // Show VDP Dialog

  // Advanced Debugging State
  conditionalBreakpoints: ConditionalBreakpoint[];
  memoryWatchpoints: MemoryWatchpoint[];
  registerWatchpoints: RegisterWatchpoint[];
  accessBreakpoints: AccessBreakpoint[];
  showBreakpointManager: boolean; // Show advanced breakpoint manager
  lastBreakpointTrigger: BreakpointTrigger | null; // Info about last triggered breakpoint

  // Watchlist State
  watchlist: WatchlistItem[];
  showWatchlist: boolean;

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

  // Timing & Performance State
  timingState: TimingState;
  timingConfig: MSXTimingConfig;
  interruptState: InterruptState;
  showTiming: boolean; // Toggle for timing panel

  // CPU Execution State
  isHalted: boolean;              // CPU in HALT state
  haltCyclesAccumulated: number;  // T-states consumed during HALT

  // C-BIOS State
  showCBios: boolean; // Show C-BIOS loader dialog
  cbiosState: CBiosState;

  // BIOS ROM Tracing
  biosContext: BiosExecutionContext | null; // Active BIOS execution context
}
