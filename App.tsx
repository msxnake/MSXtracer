
import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { CodeViewer } from './components/CodeViewer';
import { AnalysisPanel } from './components/AnalysisPanel';
import { VdpViewer } from './components/VdpViewer';
import { AppState, ReachabilityResult, NavigationSnapshot, StepType, StackFrame, Z80Flags, Z80Registers } from './types';
import { analyzeZ80Code, checkLabelReachability } from './services/geminiService';
import { simulateLine, executeSubroutine, checkCondition, executeLoopUntilCompletion } from './services/z80Simulator';

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
    liveRegisters: { a: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0, sp: 0xF380 },
    liveFlags: { z: false, c: false, s: false, pv: false },
    liveMemory: {},
    liveVDP: { vram: new Array(16384).fill(0), addressRegister: 0, writeLatch: false, registerLatch: 0 },
    isPlaying: false,
    isEditing: false,
    showVDP: false,
    breakpoints: new Set<number>()
  });

  const playIntervalRef = useRef<number | null>(null);

  const saveHistory = (state: AppState): NavigationSnapshot => ({
    currentStepIndex: state.currentStepIndex,
    manualLine: state.manualLine,
    callStack: [...state.callStack],
    liveRegisters: { ...state.liveRegisters },
    liveFlags: { ...state.liveFlags },
    liveMemory: { ...state.liveMemory },
    liveVDP: { ...state.liveVDP, vram: [...state.liveVDP.vram] }
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
         if(!prev.analysis) return prev;
         const step = prev.analysis.steps[prev.currentStepIndex];
         if(step.opcode !== 'DJNZ') return prev;

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
      while(nextLine < currentLineNumber + 10) {
          if (analysis.lineAddresses[nextLine] !== undefined) return analysis.lineAddresses[nextLine];
          nextLine++;
      }
      return 0; // Fallback
  };

  const handleStep = () => {
    setAppState(prev => {
      if (!prev.analysis || prev.currentStepIndex >= prev.analysis.steps.length) {
        return { ...prev, isPlaying: false };
      }

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
                   
                   // 3. Determine actual destination from stack
                   // The final RET instruction in subroutine performed SP += 2. 
                   // The return address was popped from [SP-2, SP-1].
                   const finalSp = finalState.registers.sp;
                   const retLow = finalState.memory[`STACK:${(finalSp - 2) & 0xFFFF}`] || 0;
                   const retHigh = finalState.memory[`STACK:${(finalSp - 1) & 0xFFFF}`] || 0;
                   const actualRetAddr = (retHigh << 8) | retLow;

                   let nextStepIdx = prev.currentStepIndex + 1;

                   // Try to map address to line. If mapped, jump there. 
                   // This handles cases where subroutine modified stack to return elsewhere.
                   const foundLine = Object.entries(prev.analysis.lineAddresses).find(([line, addr]) => addr === actualRetAddr);
                   
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
        { registers: prev.liveRegisters, flags: prev.liveFlags, memory: prev.liveMemory, vdp: prev.liveVDP },
        prev.analysis.symbolTable,
        prev.analysis.memoryMap || {}
      );

      let nextIndex = prev.currentStepIndex + 1;
      let nextCallStack = [...prev.callStack];

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
                        }
                    }
               }
           }
      }

      if (nextIndex >= prev.analysis.steps.length) {
          return { ...prev, isPlaying: false, liveRegisters: finalState.registers, liveFlags: finalState.flags, liveMemory: finalState.memory, liveVDP: finalState.vdp };
      }
      
      const nextStep = prev.analysis.steps[nextIndex];
      if (nextStep && prev.breakpoints.has(nextStep.lineNumber)) {
        return { ...prev, currentStepIndex: nextIndex, isPlaying: false, callStack: nextCallStack, history: historySnapshot, liveRegisters: finalState.registers, liveFlags: finalState.flags, liveMemory: finalState.memory, liveVDP: finalState.vdp };
      }

      return {
        ...prev,
        currentStepIndex: nextIndex,
        callStack: nextCallStack,
        history: historySnapshot,
        liveRegisters: finalState.registers,
        liveFlags: finalState.flags,
        liveMemory: finalState.memory,
        liveVDP: finalState.vdp
      };
    });
  };

  const handleStepIn = () => {
    setAppState(prev => {
        if (!prev.analysis) return prev;
        const step = prev.analysis.steps[prev.currentStepIndex];
        const historySnapshot = [saveHistory(prev), ...prev.history.slice(0, 49)];

        // CALL Handling: Push Real Address to Stack
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

  useEffect(() => {
    if (appState.isPlaying) {
      playIntervalRef.current = window.setInterval(handleStep, 100);
    } else if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
    }
    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
  }, [appState.isPlaying]);

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
          onReset={() => setAppState(prev => ({ ...prev, currentStepIndex: 0, isPlaying: false, history: [], callStack: [] }))}
          onAnalyze={handleAnalyze}
          onTogglePlay={() => setAppState(prev => ({ ...prev, isPlaying: !prev.isPlaying }))}
          onToggleEdit={() => setAppState(prev => ({ ...prev, isEditing: !prev.isEditing }))}
          onToggleVDP={() => setAppState(prev => ({ ...prev, showVDP: !prev.showVDP }))}
          onRegisterChange={handleRegisterChange}
          onRunLoop={handleRunLoop}
        />
        <CodeViewer
          appState={appState}
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
      </main>
    </div>
  );
};

export default App;
