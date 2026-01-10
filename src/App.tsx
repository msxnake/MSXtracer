
import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { CodeViewer } from './components/CodeViewer';
import { AnalysisPanel } from './components/AnalysisPanel';
import { VdpViewer } from './components/VdpViewer';
import { CBiosLoader } from './components/CBiosLoader';
import { BreakpointManager } from './components/BreakpointManager';
import { WatchlistPanel } from './components/WatchlistPanel';
import { TimingPanel } from './components/TimingPanel';
import { AppState, NavigationSnapshot, StepType, Z80Flags, Z80Registers, BiosExecutionContext, WatchlistItem } from './types';
import { analyzeZ80Code } from './services/geminiService';
import { simulateLine, executeSubroutine, checkCondition, executeLoopUntilCompletion, simulateBiosInstruction } from './services/z80Simulator';
import { loadRomFromBuffer, setCBiosVersion, getCBiosState, loadCBiosFromPublic, isCBiosLoaded, createBiosRomReader, getBiosRoutineInfo } from './services/cbiosService';
import {
  isBiosAddress,
  enterBiosContext,
  getCurrentBiosInstruction,
  advanceBiosPC,
  BiosExecutionContextFull,
  getVisibleBiosSteps
} from './services/biosExecutionService';
import { disassembleInstruction, isReturnInstruction, isJumpInstruction, isCallInstruction, getTargetAddress } from './services/z80Disassembler';
import { exportToROM, downloadROM, getROMInfo } from './services/romExporter';
import { checkAllBreakpoints, incrementBreakpointHitCount } from './services/breakpointChecker';
import { MSX_TIMING_NTSC, checkVBlankInterrupt } from './services/timingService';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>({
    code: '',
    fileName: null,
    isLoading: false,
    error: null,
    analysis: null,
    currentStepIndex: 0,
    manualLine: null,
    callStack: [],
    history: [],
    liveRegisters: {
      // Main registers
      a: 0, f: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0,
      // Alternate registers
      a_prime: 0, f_prime: 0, b_prime: 0, c_prime: 0,
      d_prime: 0, e_prime: 0, h_prime: 0, l_prime: 0,
      // Index registers
      ix: 0, iy: 0,
      // System registers
      i: 0, r: 0,
      // Stack pointer & Program counter
      sp: 0xF380, pc: 0x4000
    },
    liveFlags: { z: false, c: false, s: false, pv: false },
    liveMemory: {},
    liveVDP: { vram: new Array(16384).fill(0), addressRegister: 0, writeLatch: false, registerLatch: 0 },
    isPlaying: false,
    executionSpeed: 1,
    isEditing: false,
    showVDP: false,
    showCBios: false,
    breakpoints: new Set<number>(),

    // Advanced Debugging
    conditionalBreakpoints: [],
    memoryWatchpoints: [],
    registerWatchpoints: [],
    accessBreakpoints: [],
    showBreakpointManager: false,
    lastBreakpointTrigger: null,

    // Watchlist
    watchlist: [],
    showWatchlist: false,

    // Timing & Performance
    timingState: {
      totalCycles: 0,
      cyclesSinceVBlank: 0,
      frameCount: 0,
      lastInstructionCycles: 0,
      interruptPending: false
    },
    timingConfig: MSX_TIMING_NTSC,
    interruptState: {
      maskable: true,
      mode: 1,
      enabled: true,  // Changed to true - MSX BIOS enables interrupts by default
      vector: 0
    },
    showTiming: false,

    // CPU Execution State
    isHalted: false,
    haltCyclesAccumulated: 0,

    cbiosState: {
      loaded: false,
      version: 'msx2',
      mainRomSize: 0,
      subRomSize: 0
    },
    biosContext: null
  });

  // Extended BIOS context with step tracking (stored separately for performance)
  const [biosContextFull, setBiosContextFull] = useState<BiosExecutionContextFull | null>(null);

  const playIntervalRef = useRef<number | null>(null);

  const saveHistory = (state: AppState): NavigationSnapshot => ({
    currentStepIndex: state.currentStepIndex,
    manualLine: state.manualLine,
    callStack: [...state.callStack],
    liveRegisters: { ...state.liveRegisters },
    liveFlags: { ...state.liveFlags },
    liveMemory: { ...state.liveMemory },
    liveVDP: { ...state.liveVDP, vram: [...state.liveVDP.vram] },
    biosContext: state.biosContext ? { ...state.biosContext } : null
  });

  const handleFileUpload = (content: string, fileName: string) => {
    setAppState(prev => ({
      ...prev,
      code: content,
      fileName: fileName,
      analysis: null,
      currentStepIndex: 0,
      manualLine: null,
      isPlaying: false,
      isEditing: false,
      history: []
    }));
  };

  const handleToggleFlag = (flag: keyof Z80Flags) => {
    setAppState(prev => ({
      ...prev,
      liveFlags: {
        ...prev.liveFlags,
        [flag]: !prev.liveFlags[flag]
      }
    }));
  };

  const handleRegisterChange = (reg: keyof Z80Registers, value: number) => {
    setAppState(prev => ({
      ...prev,
      liveRegisters: {
        ...prev.liveRegisters,
        [reg]: value & 0xFFFF
      }
    }));
  };

  const handleAnalyze = async () => {
    if (!appState.code) return;
    setAppState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const result = await analyzeZ80Code(appState.code);
      setAppState(prev => {
        let newIndex = 0;

        if (prev.analysis && prev.analysis.steps[prev.currentStepIndex]) {
          const oldLine = prev.analysis.steps[prev.currentStepIndex].lineNumber;
          const foundIndex = result.steps.findIndex(s => s.lineNumber >= oldLine);
          if (foundIndex !== -1) newIndex = foundIndex;
        }
        else if (result.entryLine) {
          const foundIndex = result.steps.findIndex(s => s.lineNumber >= result.entryLine!);
          if (foundIndex !== -1) newIndex = foundIndex;
        }

        return {
          ...prev,
          isLoading: false,
          analysis: result,
          currentStepIndex: newIndex,
          manualLine: null
        };
      });
    } catch (err: any) {
      setAppState(prev => ({ ...prev, isLoading: false, error: "Error analizando código" }));
    }
  };

  const handleRunLoop = () => {
    setAppState(prev => {
      if (!prev.analysis) return prev;
      const step = prev.analysis.steps[prev.currentStepIndex];
      if (step.opcode !== 'DJNZ') return prev;

      const historySnapshot = [saveHistory(prev), ...prev.history.slice(0, 49)];
      const lines = prev.code.split('\n');
      const args = step.operands.split(',').map(s => s.trim());
      const label = args[0]; // DJNZ label

      // Run complete simulation
      const finalState = executeLoopUntilCompletion(
        step.lineNumber,
        label,
        { registers: prev.liveRegisters, flags: prev.liveFlags, memory: prev.liveMemory, vdp: prev.liveVDP },
        lines,
        prev.analysis.labels,
        prev.analysis.symbolTable,
        prev.analysis.memoryMap || {}
      );

      // Move to next line after loop
      return {
        ...prev,
        currentStepIndex: prev.currentStepIndex + 1,
        history: historySnapshot,
        liveRegisters: finalState.registers,
        liveFlags: finalState.flags,
        liveMemory: finalState.memory,
        liveVDP: finalState.vdp
      };
    });
  };

  const getAddressOfNextLine = (currentLineNumber: number, analysis: AppState['analysis']) => {
    if (!analysis) return 0;
    // Heuristic: Try to find address of next available line
    let nextLine = currentLineNumber + 1;
    while (nextLine < currentLineNumber + 10) {
      if (analysis.lineAddresses[nextLine] !== undefined) return analysis.lineAddresses[nextLine];
      nextLine++;
    }
    return 0; // Fallback
  };

  // Resolve a call/jump target to an address
  const resolveTargetAddress = (operands: string, analysis: AppState['analysis']): number | null => {
    if (!analysis) return null;
    const args = operands.split(',').map(s => s.trim());
    const label = args.length > 1 ? args[1] : args[0];
    const upperLabel = label.toUpperCase();

    // Check symbol table first
    if (analysis.symbolTable[upperLabel] !== undefined) {
      return analysis.symbolTable[upperLabel];
    }

    // Try parsing as hex address
    if (upperLabel.startsWith('$') || upperLabel.startsWith('#')) {
      return parseInt(upperLabel.substring(1), 16);
    }
    if (upperLabel.endsWith('H')) {
      return parseInt(upperLabel.substring(0, upperLabel.length - 1), 16);
    }

    // Check if it's a known BIOS routine name
    const biosInfo = getBiosRoutineInfo(parseInt(upperLabel, 16));
    if (biosInfo) {
      return parseInt(upperLabel, 16);
    }

    return null;
  };

  // Handle BIOS step execution
  const handleBiosStep = () => {
    if (!biosContextFull || !biosContextFull.active) return;

    setAppState(prev => {
      const historySnapshot = [saveHistory(prev), ...prev.history.slice(0, 49)];
      const instruction = getCurrentBiosInstruction(biosContextFull);

      if (!instruction) {
        // No valid instruction, exit BIOS context
        setBiosContextFull(null);
        return { ...prev, biosContext: null, history: historySnapshot };
      }

      const romReader = createBiosRomReader();

      // Simulate the instruction
      const simState = simulateBiosInstruction(
        instruction,
        { registers: prev.liveRegisters, flags: prev.liveFlags, memory: prev.liveMemory, vdp: prev.liveVDP },
        romReader
      );

      // Check for RET - should we exit BIOS?
      if (isReturnInstruction(instruction)) {
        // Check if it's unconditional or condition is met
        const isConditional = instruction.operands !== '';
        let shouldReturn = !isConditional;

        if (isConditional) {
          // Evaluate condition
          const cond = instruction.operands.toUpperCase();
          shouldReturn = checkCondition(cond, prev.liveFlags);
        }

        if (shouldReturn) {
          // Read return address from stack
          const sp = simState.registers.sp;
          const low = prev.liveMemory[`STACK:${(sp - 2) & 0xFFFF}`] || 0;
          const high = prev.liveMemory[`STACK:${(sp - 1) & 0xFFFF}`] || 0;
          const returnAddr = (high << 8) | low;

          // Check if returning to user code (outside BIOS)
          if (!isBiosAddress(returnAddr)) {
            // Exit BIOS, return to user code
            setBiosContextFull(null);

            // Find step index for return address
            let returnStepIndex = prev.currentStepIndex + 1;
            if (prev.analysis) {
              const foundLine = Object.entries(prev.analysis.lineAddresses).find(
                ([, addr]) => addr === returnAddr
              );
              if (foundLine) {
                const lineNum = parseInt(foundLine[0]);
                const idx = prev.analysis.steps.findIndex(s => s.lineNumber >= lineNum);
                if (idx !== -1) returnStepIndex = idx;
              }
            }

            // Pop from call stack
            const newCallStack = prev.callStack.length > 0 ? prev.callStack.slice(0, -1) : [];

            return {
              ...prev,
              currentStepIndex: returnStepIndex,
              callStack: newCallStack,
              history: historySnapshot,
              liveRegisters: simState.registers,
              liveFlags: simState.flags,
              liveMemory: simState.memory,
              liveVDP: simState.vdp,
              biosContext: null
            };
          }
        }
      }

      // Check for JP/JR/CALL within BIOS
      let nextPC = biosContextFull.currentPC + instruction.size;

      if (isJumpInstruction(instruction) || isCallInstruction(instruction)) {
        const targetAddr = getTargetAddress(instruction);
        if (targetAddr !== null) {
          // Check if conditional
          const args = instruction.operands.split(',').map(s => s.trim());
          const isConditional = args.length > 1;
          let shouldJump = !isConditional;

          if (isConditional) {
            shouldJump = checkCondition(args[0], prev.liveFlags);
          }

          if (shouldJump) {
            nextPC = targetAddr;
          }
        }
      }

      // Advance BIOS context
      const newBiosContext = advanceBiosPC(biosContextFull, nextPC);
      setBiosContextFull(newBiosContext);

      // Update simplified biosContext in AppState
      const simpleBiosContext: BiosExecutionContext = {
        active: newBiosContext.active,
        entryAddress: newBiosContext.entryAddress,
        currentPC: newBiosContext.currentPC,
        returnAddress: newBiosContext.returnAddress,
        routineName: newBiosContext.routineName,
        callDepth: newBiosContext.callDepth
      };

      return {
        ...prev,
        history: historySnapshot,
        liveRegisters: simState.registers,
        liveFlags: simState.flags,
        liveMemory: simState.memory,
        liveVDP: simState.vdp,
        biosContext: simpleBiosContext
      };
    });
  };

  const handleStep = () => {
    // If in BIOS context, delegate to BIOS step handler
    if (biosContextFull && biosContextFull.active) {
      handleBiosStep();
      return;
    }

    setAppState(prev => {
      if (!prev.analysis || prev.currentStepIndex >= prev.analysis.steps.length) {
        return { ...prev, isPlaying: false };
      }

      // === HALT STATE HANDLING ===
      if (prev.isHalted) {
        // CPU is halted - check if interrupts are enabled
        if (prev.interruptState.enabled) {
          // Fast-forward to next VBLANK interrupt
          const cyclesUntilVBlank = prev.timingConfig.cyclesPerFrame - prev.timingState.cyclesSinceVBlank;
          const newTotalCycles = prev.timingState.totalCycles + cyclesUntilVBlank;
          const newHaltCycles = prev.haltCyclesAccumulated + cyclesUntilVBlank;

          // Wake CPU immediately (skip to VBLANK)
          return {
            ...prev,
            isHalted: false,
            currentStepIndex: prev.currentStepIndex + 1,
            timingState: {
              totalCycles: newTotalCycles,
              cyclesSinceVBlank: 0, // Reset to 0 after VBLANK
              frameCount: prev.timingState.frameCount + 1,
              lastInstructionCycles: cyclesUntilVBlank,
              interruptPending: true
            },
            haltCyclesAccumulated: 0 // Reset after wake
          };
        } else {
          // Interrupts disabled - stay halted, accumulate 4 cycles per step
          const haltCycles = 4;
          const newTotalCycles = prev.timingState.totalCycles + haltCycles;
          const newCyclesSinceVBlank = prev.timingState.cyclesSinceVBlank + haltCycles;
          const newHaltCycles = prev.haltCyclesAccumulated + haltCycles;

          return {
            ...prev,
            haltCyclesAccumulated: newHaltCycles,
            timingState: {
              ...prev.timingState,
              totalCycles: newTotalCycles,
              cyclesSinceVBlank: newCyclesSinceVBlank,
              lastInstructionCycles: haltCycles
            }
          };
        }
      }

      // === NORMAL INSTRUCTION EXECUTION ===
      const step = prev.analysis.steps[prev.currentStepIndex];
      const lines = prev.code.split('\n');
      const lineContent = lines[step.lineNumber - 1];
      const historySnapshot = [saveHistory(prev), ...prev.history.slice(0, 49)];

      // 1. CALL Handling (With Real Stack Push + Dynamic Return Trace)
      if (step.type === StepType.CALL) {
        const args = step.operands.split(',').map(s => s.trim());
        let label = args[0];
        let condition = "";

        if (args.length > 1) {
          condition = args[0];
          label = args[1];
        }

        if (!condition || checkCondition(condition, prev.liveFlags)) {
          const targetLine = prev.analysis.labels[label.toUpperCase()];

          if (targetLine) {
            // Calculate Expected Return Address (Next Line)
            const expectedRetAddr = getAddressOfNextLine(step.lineNumber, prev.analysis);

            // --- FIX FOR STEP OVER LOGIC ---
            // 1. Simulate the PUSH of the CALL instruction before running subroutine.
            const sp = prev.liveRegisters.sp;
            const preCallSp = (sp - 2) & 0xFFFF;
            const preCallMemory = { ...prev.liveMemory };

            // Push Return Address (Little Endian)
            preCallMemory[`STACK:${(sp - 1) & 0xFFFF}`] = (expectedRetAddr >> 8) & 0xFF;
            preCallMemory[`STACK:${(sp - 2) & 0xFFFF}`] = expectedRetAddr & 0xFF;

            const preCallState = {
              registers: { ...prev.liveRegisters, sp: preCallSp },
              flags: prev.liveFlags,
              memory: preCallMemory,
              vdp: prev.liveVDP
            };

            // 2. Execute Subroutine
            const finalState = executeSubroutine(
              targetLine,
              preCallState,
              lines,
              prev.analysis.labels,
              prev.analysis.symbolTable,
              prev.analysis.memoryMap || {}
            );

            // 3. Map expected return address to next step index
            // Use the expectedRetAddr calculated earlier instead of reading from stack
            // This correctly handles the return to the instruction after the CALL
            let nextStepIdx = prev.currentStepIndex + 1; // Default fallback

            // Map expected return address to line
            const foundLine = Object.entries(prev.analysis.lineAddresses)
              .find(([line, addr]) => addr === expectedRetAddr);

            if (foundLine) {
              const lineNum = parseInt(foundLine[0]);
              const foundIdx = prev.analysis.steps.findIndex(s => s.lineNumber >= lineNum);
              if (foundIdx !== -1) nextStepIdx = foundIdx;
            }

            return {
              ...prev,
              currentStepIndex: nextStepIdx,
              history: historySnapshot,
              liveRegisters: finalState.registers,
              liveFlags: finalState.flags,
              liveMemory: finalState.memory,
              liveVDP: finalState.vdp
            };
          }
          // Check if it's a BIOS call (treat as black box - SP unchanged)
          // Only treat as BIOS if label is NOT in user code labels (it's an EQU to BIOS address)
          else if (!prev.analysis.labels[label.toUpperCase()]) {
            const targetAddr = resolveTargetAddress(label, prev.analysis);
            if (targetAddr !== null && targetAddr >= 0 && targetAddr < 0x4000) {
              // BIOS call: Still run simulateLine to trigger BIOS hooks (LDIRVM, WRTVRM, etc.)
              // Then treat as black box: CALL pushes, BIOS RETs - net SP change is 0
              const biosState = simulateLine(
                lineContent,
                { registers: prev.liveRegisters, flags: prev.liveFlags, memory: prev.liveMemory, vdp: prev.liveVDP },
                prev.analysis.symbolTable,
                prev.analysis.memoryMap || {}
              );

              return {
                ...prev,
                currentStepIndex: prev.currentStepIndex + 1,
                history: historySnapshot,
                liveRegisters: biosState.registers,
                liveFlags: biosState.flags,
                liveMemory: biosState.memory,
                liveVDP: biosState.vdp  // This now contains VRAM updates from LDIRVM!
              };
            }
          }
        } else {
          return { ...prev, currentStepIndex: prev.currentStepIndex + 1, history: historySnapshot };
        }
      }

      // 2. RET Handling (REAL MEMORY READ)
      if (step.type === StepType.RETURN) {
        const condition = step.operands.trim();
        if (!condition || checkCondition(condition, prev.liveFlags)) {
          // READ RETURN ADDRESS FROM STACK MEMORY
          const sp = prev.liveRegisters.sp;
          const low = prev.liveMemory[`STACK:${sp}`] || 0;
          const high = prev.liveMemory[`STACK:${(sp + 1) & 0xFFFF}`] || 0;
          const returnAddr = (high << 8) | low;

          // FIND LINE FOR ADDRESS
          // We need to find which step corresponds to this address
          let returnStepIndex = -1;

          // Search in Analysis Line Addresses
          const foundLine = Object.entries(prev.analysis.lineAddresses).find(([line, addr]) => addr === returnAddr);
          if (foundLine) {
            const lineNum = parseInt(foundLine[0]);
            returnStepIndex = prev.analysis.steps.findIndex(s => s.lineNumber >= lineNum);
          }

          // Perform State Update (SP += 2) via simulator
          const finalState = simulateLine(
            lineContent,
            { registers: prev.liveRegisters, flags: prev.liveFlags, memory: prev.liveMemory, vdp: prev.liveVDP },
            prev.analysis.symbolTable,
            prev.analysis.memoryMap || {}
          );

          // If address not found (e.g. invalid stack), fallback to Call Stack logic
          if (returnStepIndex === -1 && prev.callStack.length > 0) {
            const frame = prev.callStack[prev.callStack.length - 1];
            returnStepIndex = frame.returnStepIndex;
          }

          const nextCallStack = prev.callStack.length > 0 ? prev.callStack.slice(0, -1) : [];

          if (returnStepIndex !== -1) {
            return {
              ...prev,
              currentStepIndex: returnStepIndex,
              callStack: nextCallStack,
              history: historySnapshot,
              liveRegisters: finalState.registers,
              liveFlags: finalState.flags,
              liveMemory: finalState.memory,
              liveVDP: finalState.vdp
            };
          }
        }
      }

      // 3. Normal Simulation
      const finalState = simulateLine(
        lineContent,
        {
          registers: prev.liveRegisters,
          flags: prev.liveFlags,
          memory: prev.liveMemory,
          vdp: prev.liveVDP,
          interruptState: prev.interruptState  // Pass current interrupt state
        },
        prev.analysis.symbolTable,
        prev.analysis.memoryMap || {}
      );

      let nextIndex = prev.currentStepIndex + 1;
      let nextCallStack = [...prev.callStack];

      // Sync interrupt state from simulator if it changed
      let newInterruptState = prev.interruptState;
      if (finalState.interruptState) {
        newInterruptState = {
          ...prev.interruptState,
          enabled: finalState.interruptState.enabled,
          mode: finalState.interruptState.mode
        };
      }

      // Handle Jumps
      if (step.type === StepType.JUMP) {
        const op = step.opcode;
        if (op === 'DJNZ') {
          if (finalState.registers.b !== 0) {
            const label = step.operands.trim();
            const targetLine = prev.analysis.labels[label.toUpperCase()];
            if (targetLine) {
              const targetIndex = prev.analysis.steps.findIndex(s => s.lineNumber >= targetLine);
              if (targetIndex !== -1) nextIndex = targetIndex;
            }
          }
        } else {
          const args = step.operands.split(',').map(s => s.trim());
          let target = args[0];
          let condition = "";
          if (args.length > 1) {
            condition = args[0];
            target = args[1];
          }

          if (!condition || checkCondition(condition, prev.liveFlags)) {
            const upperTarget = target.toUpperCase();
            if (upperTarget === '(HL)') {
              const addr = (finalState.registers.h << 8) | finalState.registers.l;
              const foundLine = Object.entries(prev.analysis.lineAddresses).find(([line, a]) => a === addr);
              if (foundLine) {
                const lineNum = parseInt(foundLine[0]);
                const idx = prev.analysis.steps.findIndex(s => s.lineNumber >= lineNum);
                if (idx !== -1) nextIndex = idx;
              }
            } else {
              const targetLine = prev.analysis.labels[upperTarget];
              if (targetLine) {
                const idx = prev.analysis.steps.findIndex(s => s.lineNumber >= targetLine);
                if (idx !== -1) nextIndex = idx;
              } else {
                // Fallback: Try parsing as absolute address
                const addr = resolveTargetAddress(target, prev.analysis);
                if (addr !== null) {
                  const foundLine = Object.entries(prev.analysis.lineAddresses).find(([_, a]) => a === addr);
                  if (foundLine) {
                    const lineNum = parseInt(foundLine[0]);
                    const idx = prev.analysis.steps.findIndex(s => s.lineNumber >= lineNum);
                    if (idx !== -1) nextIndex = idx;
                  }
                }
              }
            }
          }
        }
      }

      if (nextIndex >= prev.analysis.steps.length) {
        return {
          ...prev,
          isPlaying: false,
          liveRegisters: finalState.registers,
          liveFlags: finalState.flags,
          liveMemory: finalState.memory,
          liveVDP: finalState.vdp,
          interruptState: newInterruptState
        };
      }

      // Update timing state with cycles from this instruction
      const instructionCycles = finalState.cycles || 0;
      const newTotalCycles = prev.timingState.totalCycles + instructionCycles;
      const newCyclesSinceVBlank = prev.timingState.cyclesSinceVBlank + instructionCycles;

      // Check for VBLANK interrupt
      let frameCount = prev.timingState.frameCount;
      let cyclesSinceVBlank = newCyclesSinceVBlank;
      let interruptPending = prev.timingState.interruptPending;

      if (checkVBlankInterrupt(newCyclesSinceVBlank, prev.timingConfig.cyclesPerFrame)) {
        frameCount++;
        cyclesSinceVBlank = newCyclesSinceVBlank - prev.timingConfig.cyclesPerFrame;

        // Trigger VBLANK interrupt if interrupts are enabled
        if (newInterruptState.enabled) {
          interruptPending = true;
        }
      }

      const nextStep = prev.analysis.steps[nextIndex];
      if (nextStep && prev.breakpoints.has(nextStep.lineNumber)) {
        return {
          ...prev,
          currentStepIndex: nextIndex,
          isPlaying: false,
          callStack: nextCallStack,
          history: historySnapshot,
          liveRegisters: finalState.registers,
          liveFlags: finalState.flags,
          liveMemory: finalState.memory,
          liveVDP: finalState.vdp,
          interruptState: newInterruptState,
          timingState: {
            totalCycles: newTotalCycles,
            cyclesSinceVBlank,
            frameCount,
            lastInstructionCycles: instructionCycles,
            interruptPending
          }
        };
      }

      return {
        ...prev,
        currentStepIndex: nextIndex,
        callStack: nextCallStack,
        history: historySnapshot,
        liveRegisters: finalState.registers,
        liveFlags: finalState.flags,
        liveMemory: finalState.memory,
        liveVDP: finalState.vdp,
        interruptState: newInterruptState,
        timingState: {
          totalCycles: newTotalCycles,
          cyclesSinceVBlank,
          frameCount,
          lastInstructionCycles: instructionCycles,
          interruptPending
        },
        isHalted: finalState.halted || false,
        haltCyclesAccumulated: finalState.halted ? 0 : prev.haltCyclesAccumulated
      };
    });
  };

  const handleStepIn = () => {
    setAppState(prev => {
      if (!prev.analysis) return prev;
      const step = prev.analysis.steps[prev.currentStepIndex];
      const historySnapshot = [saveHistory(prev), ...prev.history.slice(0, 49)];

      // CALL/JP Handling: Check if target is BIOS address
      if (step.type === StepType.CALL || step.type === StepType.JUMP) {
        const args = step.operands.split(',').map(s => s.trim());
        let label = args[0];
        let condition = "";

        if (args.length > 1) {
          condition = args[0];
          label = args[1];
        }

        if (!condition || checkCondition(condition, prev.liveFlags)) {
          // Try to resolve target address
          const targetAddress = resolveTargetAddress(step.operands, prev.analysis);

          // Check if target is a BIOS address
          if (targetAddress !== null && isBiosAddress(targetAddress) && isCBiosLoaded()) {
            // Enter BIOS context!
            const retAddr = getAddressOfNextLine(step.lineNumber, prev.analysis);

            // Push return address to stack (for CALL)
            const sp = prev.liveRegisters.sp;
            let newSp = sp;
            const newMemory = { ...prev.liveMemory };

            if (step.type === StepType.CALL) {
              newSp = (sp - 2) & 0xFFFF;
              newMemory[`STACK:${(sp - 1) & 0xFFFF}`] = (retAddr >> 8) & 0xFF;
              newMemory[`STACK:${(sp - 2) & 0xFFFF}`] = retAddr & 0xFF;
            }

            // Create BIOS context
            const newBiosContextFull = enterBiosContext(targetAddress, retAddr, 0);
            setBiosContextFull(newBiosContextFull);

            const simpleBiosContext: BiosExecutionContext = {
              active: true,
              entryAddress: targetAddress,
              currentPC: targetAddress,
              returnAddress: retAddr,
              routineName: newBiosContextFull.routineName,
              callDepth: 0
            };

            return {
              ...prev,
              callStack: [...prev.callStack, {
                returnLine: step.lineNumber + 1,
                returnStepIndex: prev.currentStepIndex + 1,
                subroutineName: newBiosContextFull.routineName,
                isBiosCall: true,
                biosEntryAddress: targetAddress
              }],
              history: historySnapshot,
              liveRegisters: {
                ...prev.liveRegisters,
                sp: newSp
              },
              liveMemory: newMemory,
              biosContext: simpleBiosContext
            };
          }

          // Regular user code CALL (not BIOS)
          if (step.type === StepType.CALL) {
            const targetLine = prev.analysis.labels[label.toUpperCase()];
            if (targetLine) {
              const targetIndex = prev.analysis.steps.findIndex(s => s.lineNumber >= targetLine);
              if (targetIndex !== -1) {

                // 1. Calculate Return Address (Instruction AFTER this call)
                const retAddr = getAddressOfNextLine(step.lineNumber, prev.analysis);

                // 2. Perform Stack PUSH in Memory
                const sp = prev.liveRegisters.sp;
                const newSp = (sp - 2) & 0xFFFF;
                const newMemory = { ...prev.liveMemory };

                // Little Endian Push:
                // SP-1 = High Byte
                // SP-2 = Low Byte
                newMemory[`STACK:${(sp - 1) & 0xFFFF}`] = (retAddr >> 8) & 0xFF;
                newMemory[`STACK:${(sp - 2) & 0xFFFF}`] = retAddr & 0xFF;

                return {
                  ...prev,
                  currentStepIndex: targetIndex,
                  callStack: [...prev.callStack, {
                    returnLine: step.lineNumber + 1,
                    returnStepIndex: prev.currentStepIndex + 1,
                    subroutineName: label.toUpperCase()
                  }],
                  history: historySnapshot,
                  liveRegisters: {
                    ...prev.liveRegisters,
                    sp: newSp
                  },
                  liveMemory: newMemory
                };
              }
            }
          }
        }
      }

      // Fallback to standard simulation
      const lines = prev.code.split('\n');
      const lineContent = lines[step.lineNumber - 1];

      const finalState = simulateLine(
        lineContent,
        { registers: prev.liveRegisters, flags: prev.liveFlags, memory: prev.liveMemory, vdp: prev.liveVDP },
        prev.analysis.symbolTable,
        prev.analysis.memoryMap || {}
      );

      return {
        ...prev,
        currentStepIndex: prev.currentStepIndex + 1,
        history: historySnapshot,
        liveRegisters: finalState.registers,
        liveFlags: finalState.flags,
        liveMemory: finalState.memory,
        liveVDP: finalState.vdp
      };
    });
  };

  const handleStepOut = () => {
    setAppState(prev => {
      // Step Out essentially runs until a RET is hit in current context
      // Simplified: Just pop the synthetic stack, but update state
      if (prev.callStack.length === 0) return prev;
      const stack = [...prev.callStack];
      const frame = stack.pop()!;
      const historySnapshot = [saveHistory(prev), ...prev.history.slice(0, 49)];

      const currentStep = prev.analysis!.steps[prev.currentStepIndex];
      const lines = prev.code.split('\n');

      const finalState = executeSubroutine(
        currentStep.lineNumber,
        { registers: prev.liveRegisters, flags: prev.liveFlags, memory: prev.liveMemory, vdp: prev.liveVDP },
        lines,
        prev.analysis!.labels,
        prev.analysis!.symbolTable,
        prev.analysis!.memoryMap || {}
      );

      let returnIndex = frame.returnStepIndex;
      if (returnIndex >= prev.analysis!.steps.length) returnIndex = prev.analysis!.steps.length - 1;

      return {
        ...prev,
        currentStepIndex: returnIndex,
        callStack: stack,
        history: historySnapshot,
        liveRegisters: finalState.registers,
        liveFlags: finalState.flags,
        liveMemory: finalState.memory,
        liveVDP: finalState.vdp
      };
    });
  };

  const handleUndo = () => {
    setAppState(prev => {
      if (prev.history.length === 0) return prev;
      const [last, ...remaining] = prev.history;
      return {
        ...prev,
        ...last,
        history: remaining
      };
    });
  };

  const handleExportROM = () => {
    if (!appState.analysis) return;

    try {
      // Get ROM info
      const info = getROMInfo(appState.analysis.memoryMap);

      // Export ROM
      const romData = exportToROM(appState.analysis.memoryMap);

      // Generate filename based on loaded file
      const baseName = appState.fileName?.replace(/\.(asm|z80|txt)$/i, '') || 'output';
      const filename = `${baseName}.rom`;

      // Download
      downloadROM(romData, filename);

      console.log(`ROM exported: ${filename}`);
      console.log(`Size: ${info.size} bytes (${info.usedBytes} used)`);
      console.log(`Range: $${info.startAddress.toString(16).toUpperCase()} - $${info.endAddress.toString(16).toUpperCase()}`);
    } catch (error) {
      console.error('ROM export failed:', error);
      alert('Failed to export ROM: ' + (error as Error).message);
    }
  };

  useEffect(() => {
    if (appState.isPlaying) {
      playIntervalRef.current = window.setInterval(() => {
        // Execute multiple steps based on executionSpeed
        for (let i = 0; i < appState.executionSpeed; i++) {
          // Check if we should stop (finished or paused)
          if (!appState.analysis ||
            appState.currentStepIndex >= appState.analysis.steps.length ||
            !appState.isPlaying) {
            setAppState(prev => ({ ...prev, isPlaying: false }));
            break;
          }

          // Execute one step (handleStep will check for breakpoints internally)
          handleStep();

          // Note: handleStep already checks for simple breakpoints and sets isPlaying: false
          // Advanced breakpoints are also checked during simulation
        }
      }, 100); // Keep 100ms interval
    } else if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
    }
    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
  }, [appState.isPlaying, appState.executionSpeed]);

  // Auto-load C-BIOS from public/roms on startup
  useEffect(() => {
    loadCBiosFromPublic().then(() => {
      setAppState(prev => ({
        ...prev,
        cbiosState: getCBiosState()
      }));
    });
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#111]">
      <Header />
      <main className="flex-1 flex overflow-hidden">
        <ControlPanel
          appState={appState}
          onFileUpload={handleFileUpload}
          onStep={handleStep}
          onStepIn={handleStepIn}
          onStepOut={handleStepOut}
          onUndo={handleUndo}
          onReset={() => {
            setBiosContextFull(null);
            setAppState(prev => ({ ...prev, currentStepIndex: 0, isPlaying: false, history: [], callStack: [], biosContext: null }));
          }}
          onAnalyze={handleAnalyze}
          onTogglePlay={() => setAppState(prev => ({ ...prev, isPlaying: !prev.isPlaying }))}
          onSpeedChange={(speed) => setAppState(prev => ({ ...prev, executionSpeed: speed }))}
          onToggleEdit={() => setAppState(prev => ({ ...prev, isEditing: !prev.isEditing }))}
          onToggleVDP={() => setAppState(prev => ({ ...prev, showVDP: !prev.showVDP }))}
          onToggleCBios={() => setAppState(prev => ({ ...prev, showCBios: !prev.showCBios }))}
          onToggleBreakpoints={() => setAppState(prev => ({ ...prev, showBreakpointManager: !prev.showBreakpointManager }))}
          onToggleWatchlist={() => setAppState(prev => ({ ...prev, showWatchlist: !prev.showWatchlist }))}
          onToggleTiming={() => setAppState(prev => ({ ...prev, showTiming: !prev.showTiming }))}
          onRegisterChange={handleRegisterChange}
          onRunLoop={handleRunLoop}
          onExportROM={handleExportROM}
        />
        <CodeViewer
          appState={appState}
          biosContextFull={biosContextFull}
          onToggleBreakpoint={(line) => setAppState(prev => {
            const bps = new Set(prev.breakpoints);
            if (bps.has(line)) bps.delete(line); else bps.add(line);
            return { ...prev, breakpoints: bps };
          })}
          onCodeChange={(code) => setAppState(prev => ({ ...prev, code }))}
          onAnalyze={handleAnalyze}
        />
        <AnalysisPanel appState={appState} onToggleFlag={handleToggleFlag} onRegisterChange={handleRegisterChange} />
        {appState.showVDP && <VdpViewer vdpState={appState.liveVDP} onClose={() => setAppState(prev => ({ ...prev, showVDP: false }))} />}
        {appState.showCBios && (
          <CBiosLoader
            cbiosState={appState.cbiosState}
            onLoadRom={async (file, type) => {
              const buffer = await file.arrayBuffer();
              loadRomFromBuffer(buffer, type);
              setAppState(prev => ({
                ...prev,
                cbiosState: getCBiosState()
              }));
            }}
            onVersionChange={(version) => {
              setCBiosVersion(version);
              setAppState(prev => ({
                ...prev,
                cbiosState: { ...prev.cbiosState, version }
              }));
            }}
            onClose={() => setAppState(prev => ({ ...prev, showCBios: false }))}
          />
        )}

        {/* Breakpoint Manager */}
        {appState.showBreakpointManager && (
          <BreakpointManager
            conditionalBreakpoints={appState.conditionalBreakpoints}
            memoryWatchpoints={appState.memoryWatchpoints}
            registerWatchpoints={appState.registerWatchpoints}
            accessBreakpoints={appState.accessBreakpoints}
            onUpdateConditional={(bps) => setAppState(prev => ({ ...prev, conditionalBreakpoints: bps }))}
            onUpdateMemory={(wps) => setAppState(prev => ({ ...prev, memoryWatchpoints: wps }))}
            onUpdateRegister={(wps) => setAppState(prev => ({ ...prev, registerWatchpoints: wps }))}
            onUpdateAccess={(bps) => setAppState(prev => ({ ...prev, accessBreakpoints: bps }))}
            onClose={() => setAppState(prev => ({ ...prev, showBreakpointManager: false }))}
          />
        )}

        {/* Watchlist Panel */}
        {appState.showWatchlist && (
          <WatchlistPanel
            watchlist={appState.watchlist}
            liveRegisters={appState.liveRegisters}
            liveFlags={appState.liveFlags}
            liveMemory={appState.liveMemory}
            symbolTable={appState.analysis?.symbolTable || {}}
            onAddWatch={(item) => {
              const newItem: WatchlistItem = {
                ...item,
                id: crypto.randomUUID(),
                previousValue: undefined,
                currentValue: undefined
              };
              setAppState(prev => ({ ...prev, watchlist: [...prev.watchlist, newItem] }));
            }}
            onRemoveWatch={(id) => {
              setAppState(prev => ({
                ...prev,
                watchlist: prev.watchlist.filter(w => w.id !== id)
              }));
            }}
            onToggleWatch={(id) => {
              setAppState(prev => ({
                ...prev,
                watchlist: prev.watchlist.map(w =>
                  w.id === id ? { ...w, enabled: !w.enabled } : w
                )
              }));
            }}
            onClearAll={() => {
              setAppState(prev => ({ ...prev, watchlist: [] }));
            }}
            onClose={() => setAppState(prev => ({ ...prev, showWatchlist: false }))}
          />
        )}
      </main>
    </div>
  );
};

export default App;
