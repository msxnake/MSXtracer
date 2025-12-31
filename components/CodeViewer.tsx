
import React, { useEffect, useRef, useState } from 'react';
import { AppState } from '../types';
import { Edit2, Check, X as CloseX, Microscope, CornerRightDown, Tag } from 'lucide-react';

interface CodeViewerProps {
  appState: AppState;
  onToggleBreakpoint: (line: number) => void;
  onCodeChange: (code: string) => void;
  onAnalyze: () => void;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({ appState, onToggleBreakpoint, onCodeChange, onAnalyze }) => {
  const lineRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  
  const lines = appState.code ? appState.code.split('\n') : [];
  const currentStep = appState.analysis?.steps[appState.currentStepIndex];
  const activeLineNumber = appState.manualLine || currentStep?.lineNumber;

  useEffect(() => {
    if (activeLineNumber && lineRefs.current[activeLineNumber] && !appState.isEditing && editingLine === null) {
      lineRefs.current[activeLineNumber]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [activeLineNumber, appState.isEditing, editingLine]);

  const scrollToLine = (lineNum: number) => {
     const el = lineRefs.current[lineNum];
     if (el) {
         el.scrollIntoView({ behavior: 'smooth', block: 'center' });
         // Visual Highlight effect
         el.classList.add('bg-purple-900', 'bg-opacity-80', 'transition-colors', 'duration-500');
         setTimeout(() => {
             el.classList.remove('bg-purple-900', 'bg-opacity-80', 'transition-colors', 'duration-500');
         }, 800);
     }
  };

  const handleStartEdit = (lineNum: number, content: string) => {
    setEditingLine(lineNum);
    setEditValue(content);
  };

  const handleLineDoubleClick = (lineNum: number, content: string) => {
      if (editingLine === lineNum) return;

      // 1. Try Navigation: Get selected text (the word clicked)
      const selection = window.getSelection();
      if (selection && appState.analysis) {
          // Clean the selection: remove commas, colons, parens to get raw label
          const selectedText = selection.toString().trim().replace(/[^A-Z0-9_.]/gi, '').toUpperCase();
          
          if (selectedText) {
              const targetLine = appState.analysis.labels[selectedText];
              // If label exists AND it's not the line we are currently on (so we don't block editing definition)
              if (targetLine && targetLine !== lineNum) {
                  scrollToLine(targetLine);
                  selection.removeAllRanges(); // Deselect text to avoid confusion
                  return; // Skip editing mode, we navigated instead
              }
          }
      }

      // 2. Fallback: Edit Mode
      handleStartEdit(lineNum, content);
  };

  const handleSaveEdit = () => {
    if (editingLine === null) return;
    const newLines = [...lines];
    newLines[editingLine - 1] = editValue;
    onCodeChange(newLines.join('\n'));
    setEditingLine(null);
    setTimeout(onAnalyze, 10);
  };

  const handleCancelEdit = () => {
    setEditingLine(null);
  };

  // Helper to read memory safely from AppState
  const readMemoryValue = (addr: number): number => {
      // 1. Try Live Memory (Stack/Raw)
      const stackKey = `STACK:${addr}`;
      if (appState.liveMemory[stackKey] !== undefined) return appState.liveMemory[stackKey];

      // 2. Try Live Memory (Labels)
      // We need to reverse lookup the address to a label
      if (appState.analysis?.symbolTable) {
          const labelEntry = Object.entries(appState.analysis.symbolTable).find(([_, val]) => val === addr);
          if (labelEntry) {
              const labelName = labelEntry[0];
              if (appState.liveMemory[labelName] !== undefined) return appState.liveMemory[labelName];
          }
      }

      // 3. Try Static Map
      if (appState.analysis?.memoryMap && appState.analysis.memoryMap[addr] !== undefined) {
          return appState.analysis.memoryMap[addr];
      }

      return 0; // Default or 0x00
  };

  // Helper to get register pair value
  const getPairValue = (pair: string): number => {
      const { h, l, b, c, d, e } = appState.liveRegisters;
      if (pair === 'HL') return (h << 8) | l;
      if (pair === 'BC') return (b << 8) | c;
      if (pair === 'DE') return (d << 8) | e;
      return 0;
  };

  if (appState.isEditing) {
      return (
          <div className="flex-1 bg-[#050505] flex flex-col h-full overflow-hidden">
              <div className="bg-[#1a1a1a] h-9 flex items-center px-4 border-b border-[#333] justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-blue-400 font-bold uppercase tracking-tighter">Full Editor</span>
                    <span className="text-[10px] text-gray-600 px-2 py-0.5 border border-gray-800 rounded">RAW MODE</span>
                </div>
              </div>
              <textarea 
                 className="flex-1 bg-[#050505] text-green-500 font-mono text-sm p-4 outline-none resize-none leading-6"
                 value={appState.code}
                 onChange={(e) => onCodeChange(e.target.value)}
                 spellCheck={false}
              />
          </div>
      );
  }

  return (
    <div className="flex-1 bg-[#0a0a0a] flex flex-col h-full overflow-hidden relative">
      <div className="bg-[#111] h-9 flex items-center px-4 border-b border-gray-900 justify-between shrink-0">
          <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Live Trace View</span>
          </div>
          <div className="text-[9px] text-gray-600 font-mono italic">
              Double-click to Edit or Jump to Label
          </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2" ref={containerRef}>
        <div className="min-w-full inline-block">
          {lines.map((line, idx) => {
            const lineNum = idx + 1;
            const isActive = lineNum === activeLineNumber;
            const isBreakpoint = appState.breakpoints.has(lineNum);
            const isEditingThis = editingLine === lineNum;
            
            let infoTag = null;

            // 1. Pointer Inspector Logic (Active Line Only)
            if (isActive && !isEditingThis) {
                const match = line.toUpperCase().match(/\((HL|DE|BC)\)/);
                if (match) {
                    const pair = match[1];
                    const addr = getPairValue(pair);
                    const val = readMemoryValue(addr);
                    infoTag = (
                        <div className="ml-4 flex items-center gap-2 bg-teal-900/40 border border-teal-500/30 px-2 py-0.5 rounded animate-fade-in whitespace-nowrap">
                            <Microscope size={12} className="text-teal-400" />
                            <span className="text-[10px] text-teal-200 font-mono">
                                {pair}: <span className="text-white font-bold">${addr.toString(16).toUpperCase().padStart(4,'0')}</span>
                            </span>
                            <span className="text-[10px] text-gray-400">-></span>
                            <span className="text-[10px] text-teal-200 font-mono">
                                Val: <span className="text-yellow-400 font-bold">${val.toString(16).toUpperCase().padStart(2,'0')}</span>
                            </span>
                        </div>
                    );
                }
            }
            
            // 2. Constant Usage Inspector (Active Line Only)
            if (isActive && !isEditingThis && !infoTag && appState.analysis?.constants) {
                 const cleanLine = line.split(';')[0].toUpperCase();
                 
                 // Find if any known constant appears in the line as a whole word
                 const matchedConst = appState.analysis.constants.find(c => {
                     // Check if line contains the constant name as a whole word
                     const regex = new RegExp(`\\b${c.name}\\b`);
                     
                     // Must match regex
                     if (!regex.test(cleanLine)) return false;
                     
                     // Must NOT be the definition itself (LABEL EQU VAL)
                     // Usually definitions have the label at the start. 
                     // We skip if the line starts with the name followed by colon or EQU
                     if (cleanLine.startsWith(c.name + ':') || cleanLine.startsWith(c.name + ' EQU')) return false;

                     return true; 
                 });

                 if (matchedConst) {
                     infoTag = (
                         <div className="ml-4 flex items-center gap-1.5 bg-indigo-900/40 border border-indigo-500/30 px-2 py-0.5 rounded animate-fade-in whitespace-nowrap">
                            <Tag size={12} className="text-indigo-400" />
                            <span className="text-[10px] text-indigo-200 font-mono">
                                {matchedConst.name} = <span className="text-yellow-400 font-bold">{matchedConst.hex}</span>
                                <span className="text-gray-500 ml-1">({matchedConst.value})</span>
                            </span>
                        </div>
                     );
                 }
            }

            // 3. EQU Value Inspector (Show on definition lines)
            if (!infoTag && !isEditingThis) {
                // Regex to find "LABEL EQU VALUE"
                const equMatch = line.match(/^\s*([A-Z0-9_]+)[:]?\s+EQU\b/i);
                if (equMatch && appState.analysis?.symbolTable) {
                    const label = equMatch[1].trim().toUpperCase();
                    const val = appState.analysis.symbolTable[label];
                    if (val !== undefined) {
                        infoTag = (
                             <div className="ml-4 flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded opacity-80 whitespace-nowrap">
                                <Tag size={10} className="text-indigo-400" />
                                <span className="text-[10px] text-indigo-300 font-mono">
                                    <span className="font-bold">${val.toString(16).toUpperCase()}</span>
                                    <span className="text-gray-600 ml-1">({val})</span>
                                </span>
                            </div>
                        );
                    }
                }
            }
            
            return (
              <div 
                key={idx}
                ref={el => lineRefs.current[lineNum] = el}
                id={`code-line-${lineNum}`}
                className={`flex group h-6 items-center font-mono text-sm relative ${isActive ? 'bg-blue-900/30' : 'hover:bg-gray-900/50'}`}
                onDoubleClick={() => !isEditingThis && handleLineDoubleClick(lineNum, line)}
              >
                {/* Gutter */}
                <div 
                  className={`w-12 flex-shrink-0 text-right pr-4 select-none cursor-pointer border-r border-gray-800 mr-4 flex items-center justify-end gap-1 ${
                    isActive ? 'text-blue-400 font-bold' : 'text-gray-700'
                  }`}
                  onClick={() => onToggleBreakpoint(lineNum)}
                >
                  {isBreakpoint && <div className="w-2 h-2 bg-red-600 rounded-full shrink-0 shadow-[0_0_5px_red]" />}
                  <span>{lineNum}</span>
                </div>
                
                {/* Code or Editor */}
                {isEditingThis ? (
                    <div className="flex-1 flex items-center h-full bg-blue-950 z-20">
                        <input 
                            autoFocus
                            className="flex-1 bg-transparent text-white outline-none border-none h-full px-1"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit();
                                if (e.key === 'Escape') handleCancelEdit();
                            }}
                            onBlur={handleSaveEdit}
                        />
                        <div className="flex gap-1 px-2">
                            <Check size={14} className="text-green-500 cursor-pointer" onClick={handleSaveEdit} />
                            <CloseX size={14} className="text-red-500 cursor-pointer" onClick={handleCancelEdit} />
                        </div>
                    </div>
                ) : (
                    <div className={`whitespace-pre flex items-center flex-1 cursor-text ${isActive ? 'text-white font-bold' : 'text-gray-400'}`}>
                        <span>{line || ' '}</span>
                        {infoTag}
                        
                        {/* Hover Actions */}
                        <div className="opacity-0 group-hover:opacity-100 ml-auto mr-2 flex gap-1 transition-opacity">
                             {/* Hint icon for navigation */}
                             {line.trim().length > 0 && (
                                <span title="Double click label to jump" className="p-1 text-gray-600">
                                   <CornerRightDown size={10} />
                                </span>
                             )}
                             <button 
                                onClick={() => handleStartEdit(lineNum, line)}
                                className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-blue-400"
                                title="Edit Line"
                            >
                                <Edit2 size={10} />
                            </button>
                        </div>
                    </div>
                )}
                
                {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 shadow-[0_0_10px_#3b82f6]"></div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
