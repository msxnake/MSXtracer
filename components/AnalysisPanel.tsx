import React, { useState } from 'react';
import { AppState, StepType, Z80Flags, Z80Registers } from '../types';
import { Activity, Database, List, Tag, Cpu, Flag, Repeat, ArrowRight, Layers, Hash } from 'lucide-react';

interface AnalysisPanelProps {
  appState: AppState;
  onToggleFlag: (flag: keyof Z80Flags) => void;
  onRegisterChange: (reg: keyof Z80Registers, value: number) => void;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ appState, onToggleFlag, onRegisterChange }) => {
  const { analysis, currentStepIndex, liveRegisters, liveFlags, liveMemory } = appState;
  const [activeTab, setActiveTab] = useState<'LOG' | 'MEM' | 'CONST' | 'STACK' | 'LBL'>('LOG');

  if (!analysis) {
    return (
      <div className="w-72 bg-[#111] border-l border-gray-800 p-6 flex flex-col items-center justify-center text-center text-gray-600">
        <Activity size={48} className="mb-4 opacity-20" />
        <p className="text-sm">Run analysis to see execution flow and stats.</p>
      </div>
    );
  }

  // Helper to format Hex 8-bit
  const h8 = (val: number) => (val || 0).toString(16).toUpperCase().padStart(2, '0');
  // Helper to format Hex 16-bit
  const h16 = (high: number, low: number) => ((high << 8) | low).toString(16).toUpperCase().padStart(4, '0');
  // Helper for single number 16-bit
  const h16val = (val: number) => (val || 0).toString(16).toUpperCase().padStart(4, '0');

  const editRegister = (reg: keyof Z80Registers, currentVal: number) => {
    const newVal = prompt(`Edit ${reg.toUpperCase()} Register (Hex or Decimal):`, currentVal.toString(16).toUpperCase());
    if (newVal !== null) {
      let val = parseInt(newVal, newVal.trim().startsWith('$') || newVal.trim().startsWith('#') || newVal.trim().match(/^[0-9A-F]+$/i) ? 16 : 10);
      if (isNaN(val) && /^[0-9A-Fa-f]+$/.test(newVal.trim())) {
         val = parseInt(newVal, 16);
      }
      if (!isNaN(val)) {
        onRegisterChange(reg, val);
      }
    }
  };
  
  const editPair = (highReg: keyof Z80Registers, lowReg: keyof Z80Registers, currentVal: number) => {
      const newVal = prompt(`Edit ${highReg.toUpperCase()}${lowReg.toUpperCase()} Pair (Hex or Decimal):`, currentVal.toString(16).toUpperCase().padStart(4,'0'));
      if (newVal !== null) {
           let val = parseInt(newVal, 16); 
           if (isNaN(val)) val = parseInt(newVal);
           if (!isNaN(val)) {
               onRegisterChange(highReg, (val >> 8) & 0xFF);
               onRegisterChange(lowReg, val & 0xFF);
           }
      }
  }

  // --- MEMORY LOOKUP HELPERS ---
  const readByte = (addr: number): number => {
      // 1. Try Live Memory (Simulator writes STACK:addr for all RAM writes)
      const stackKey = `STACK:${addr}`;
      if (liveMemory[stackKey] !== undefined) return liveMemory[stackKey];
      
      // 2. Try Static Map
      if (analysis.memoryMap && analysis.memoryMap[addr] !== undefined) {
          return analysis.memoryMap[addr];
      }
      return 0;
  };

  const readWord = (addr: number): number => {
      const low = readByte(addr);
      const high = readByte((addr + 1) & 0xFFFF);
      return (high << 8) | low;
  };

  const readMemoryAtHL = (): number => {
      const addr = (liveRegisters.h << 8) | liveRegisters.l;
      return readByte(addr);
  };

  const hlValueContent = readMemoryAtHL();

  // --- MERGE STATIC VAR INFO WITH LIVE MEMORY ---
  const memoryVariables = analysis.initialVariables.map(v => {
      const upperName = v.name.toUpperCase();
      const liveVal = liveMemory[upperName];
      return {
          ...v,
          value: liveVal !== undefined ? liveVal : v.value,
          isModified: liveVal !== undefined && liveVal !== v.value
      };
  }).sort((a, b) => {
      if (a.address && b.address) return a.address.localeCompare(b.address);
      return a.name.localeCompare(b.name);
  });
  
  const constants = analysis.constants.sort((a, b) => a.name.localeCompare(b.name));

  const loopCount = analysis.steps.filter(s => s.type === StepType.LOOP).length;
  const bugCount = analysis.detectedBugs.length;
  const callCount = analysis.steps.filter(s => s.type === StepType.CALL).length;

  // --- STACK VISUALIZATION (SP Relative) ---
  const sp = liveRegisters.sp;
  const stackWords: { addr: number, val: number }[] = [];
  // Show 12 words starting from SP
  for (let i = 0; i < 12; i++) {
      const addr = (sp + i * 2) & 0xFFFF;
      const val = readWord(addr);
      stackWords.push({ addr, val });
  }

  // Jump to Line Function
  const jumpToLine = (lineNumber: number) => {
     const el = document.getElementById(`code-line-${lineNumber}`);
     if (el) {
         el.scrollIntoView({ behavior: 'smooth', block: 'center' });
         el.classList.add('bg-blue-900', 'bg-opacity-50', 'transition-colors', 'duration-500');
         setTimeout(() => {
             el.classList.remove('bg-blue-900', 'bg-opacity-50', 'transition-colors', 'duration-500');
         }, 800);
     }
  };

  return (
    <div className="w-80 bg-[#111] border-l border-gray-800 flex flex-col h-full overflow-hidden">
      
      {/* CPU REGISTERS VIEW */}
      <div className="bg-[#1a1a1a] border-b border-gray-800 p-3">
         <h3 className="text-[10px] font-bold text-gray-400 mb-2 uppercase flex items-center gap-1">
             <Cpu size={12} /> Z80 Registers (Click to Edit)
         </h3>
         
         <div className="grid grid-cols-2 gap-2 mb-2">
            {/* AF Register Pair */}
            <div className="bg-black border border-gray-700 rounded p-1.5 flex justify-between items-center relative overflow-hidden cursor-pointer hover:border-blue-500 transition-colors"
                 onClick={() => editRegister('a', liveRegisters.a)}>
               <span className="text-xs font-bold text-blue-500 z-10">AF</span>
               <div className="text-right z-10">
                  <div className="text-sm font-mono text-white font-bold tracking-widest">
                      {h8(liveRegisters.a)}{h8((liveFlags.z?0x40:0)|(liveFlags.c?0x01:0)|(liveFlags.s?0x80:0))}
                  </div>
               </div>
               {/* Flag indicators mini */}
               <div className="absolute bottom-0 right-0 left-0 h-0.5 bg-gray-800 flex">
                   <div className={`flex-1 ${liveFlags.s ? 'bg-yellow-500':''}`} title="Sign"></div>
                   <div className={`flex-1 ${liveFlags.z ? 'bg-yellow-500':''}`} title="Zero"></div>
                   <div className={`flex-1 ${liveFlags.c ? 'bg-yellow-500':''}`} title="Carry"></div>
               </div>
            </div>

            {/* HL Register Pair */}
            <div className="bg-black border border-gray-700 rounded p-1.5 flex flex-col justify-center cursor-pointer hover:border-purple-500 transition-colors"
                 onClick={() => editPair('h', 'l', (liveRegisters.h << 8) | liveRegisters.l)}>
               <div className="flex justify-between items-center w-full">
                   <span className="text-xs font-bold text-purple-500">HL</span>
                   <div className="text-sm font-mono text-white font-bold tracking-widest">
                      {h16(liveRegisters.h, liveRegisters.l)}
                   </div>
               </div>
               {/* Dereferenced Value */}
               <div className="w-full flex justify-end mt-1 pt-1 border-t border-gray-800">
                    <span className="text-[9px] text-gray-500 mr-1">(HL)=</span>
                    <span className="text-[10px] font-mono text-yellow-500 font-bold">${h8(hlValueContent)}</span>
               </div>
            </div>

            {/* BC Register Pair */}
            <div className="bg-black border border-gray-700 rounded p-1.5 flex justify-between items-center cursor-pointer hover:border-green-500 transition-colors"
                 onClick={() => editPair('b', 'c', (liveRegisters.b << 8) | liveRegisters.c)}>
               <span className="text-xs font-bold text-green-600">BC</span>
               <div className="text-right">
                  <div className="text-sm font-mono text-gray-300 font-bold tracking-widest">
                      {h16(liveRegisters.b, liveRegisters.c)}
                  </div>
               </div>
            </div>

            {/* DE Register Pair */}
            <div className="bg-black border border-gray-700 rounded p-1.5 flex justify-between items-center cursor-pointer hover:border-yellow-500 transition-colors"
                 onClick={() => editPair('d', 'e', (liveRegisters.d << 8) | liveRegisters.e)}>
               <span className="text-xs font-bold text-yellow-600">DE</span>
               <div className="text-right">
                  <div className="text-sm font-mono text-gray-300 font-bold tracking-widest">
                      {h16(liveRegisters.d, liveRegisters.e)}
                  </div>
               </div>
            </div>
            
            {/* SP Register */}
            <div className="col-span-2 bg-black border border-gray-700 rounded p-1.5 flex justify-between items-center cursor-pointer hover:border-red-500 transition-colors"
                 onClick={() => editRegister('sp', liveRegisters.sp)}>
               <span className="text-xs font-bold text-red-500">SP</span>
               <div className="text-right flex items-center gap-2">
                  <span className="text-[9px] text-gray-500 uppercase">Stack Ptr</span>
                  <div className="text-sm font-mono text-white font-bold tracking-widest">
                      {liveRegisters.sp ? liveRegisters.sp.toString(16).toUpperCase().padStart(4, '0') : 'F380'}
                  </div>
               </div>
            </div>
         </div>
         
         {/* FLAGS DETAILED */}
         <div className="bg-black border border-gray-800 rounded p-1.5 flex justify-between items-center">
             <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1"><Flag size={10}/> Flags</span>
             <div className="flex gap-2 font-mono text-xs">
                <button 
                    onClick={() => onToggleFlag('s')} 
                    className={`w-4 text-center rounded transition-colors ${liveFlags?.s ? "text-black bg-yellow-500 font-bold" : "text-gray-700 hover:text-gray-400 hover:bg-gray-800"}`} 
                    title="Toggle Sign Flag"
                >S</button>
                <button 
                    onClick={() => onToggleFlag('z')} 
                    className={`w-4 text-center rounded transition-colors ${liveFlags?.z ? "text-black bg-yellow-500 font-bold" : "text-gray-700 hover:text-gray-400 hover:bg-gray-800"}`} 
                    title="Toggle Zero Flag"
                >Z</button>
                <span className="text-gray-800 w-4 text-center cursor-default">H</span>
                <button 
                    onClick={() => onToggleFlag('pv')} 
                    className={`w-4 text-center rounded transition-colors ${liveFlags?.pv ? "text-black bg-yellow-500 font-bold" : "text-gray-700 hover:text-gray-400 hover:bg-gray-800"}`} 
                    title="Toggle Parity/Overflow Flag"
                >P</button>
                <span className="text-gray-800 w-4 text-center cursor-default">N</span>
                <button 
                    onClick={() => onToggleFlag('c')} 
                    className={`w-4 text-center rounded transition-colors ${liveFlags?.c ? "text-black bg-yellow-500 font-bold" : "text-gray-700 hover:text-gray-400 hover:bg-gray-800"}`} 
                    title="Toggle Carry Flag"
                >C</button>
             </div>
         </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        <button 
          onClick={() => setActiveTab('LOG')}
          className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${activeTab === 'LOG' ? 'text-blue-400 border-b-2 border-blue-500 bg-gray-900' : 'text-gray-500 hover:text-gray-300'}`}
          title="Execution Log"
        >
          <List size={14} /> LOG
        </button>
        <button 
          onClick={() => setActiveTab('MEM')}
          className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${activeTab === 'MEM' ? 'text-green-400 border-b-2 border-green-500 bg-gray-900' : 'text-gray-500 hover:text-gray-300'}`}
          title="Memory Variables"
        >
          <Database size={14} /> MEM
        </button>
        <button 
          onClick={() => setActiveTab('STACK')}
          className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${activeTab === 'STACK' ? 'text-red-400 border-b-2 border-red-500 bg-gray-900' : 'text-gray-500 hover:text-gray-300'}`}
          title="Stack"
        >
          <Layers size={14} /> STK
        </button>
        <button 
          onClick={() => setActiveTab('LBL')}
          className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${activeTab === 'LBL' ? 'text-purple-400 border-b-2 border-purple-500 bg-gray-900' : 'text-gray-500 hover:text-gray-300'}`}
          title="Labels & Symbols"
        >
          <Hash size={14} /> LBL
        </button>
      </div>

      {activeTab === 'LOG' ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
          <div className="p-4 space-y-3">
             <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-[#1a1a1a] p-2 rounded border border-gray-800 text-center">
                   <div className="text-lg font-bold text-yellow-500">{loopCount}</div>
                   <div className="text-[10px] text-gray-500 uppercase">Loops</div>
                </div>
                <div className="bg-[#1a1a1a] p-2 rounded border border-gray-800 text-center">
                   <div className="text-lg font-bold text-purple-500">{callCount}</div>
                   <div className="text-[10px] text-gray-500 uppercase">Calls</div>
                </div>
                <div className="bg-[#1a1a1a] p-2 rounded border border-gray-800 text-center">
                   <div className={`text-lg font-bold ${bugCount > 0 ? 'text-red-500' : 'text-green-500'}`}>{bugCount}</div>
                   <div className="text-[10px] text-gray-500 uppercase">Bugs</div>
                </div>
             </div>
             
             <div className="space-y-2">
               {analysis.steps.map((step, idx) => {
                 const isCurrent = idx === currentStepIndex;
                 const isPast = idx < currentStepIndex;

                 return (
                   <div 
                    key={step.id} 
                    id={`step-${idx}`}
                    className={`relative pl-4 py-2 border-l-2 transition-all ${
                      isCurrent 
                        ? 'border-blue-500 bg-blue-900/10' 
                        : isPast 
                          ? 'border-gray-700 opacity-50' 
                          : 'border-gray-800 opacity-60'
                    }`}
                   >
                     {isCurrent && (
                       <ArrowRight size={12} className="absolute -left-[7px] top-3 text-blue-500 fill-blue-500" />
                     )}
                     
                     <div className="flex justify-between items-start">
                       <span className={`text-xs font-mono font-bold ${
                         step.type === 'BUG_WARNING' ? 'text-red-400' :
                         step.type === 'LOOP' ? 'text-yellow-400' :
                         step.type === 'CALL' ? 'text-purple-400' :
                         'text-gray-300'
                       }`}>
                         {step.opcode}
                       </span>
                       <span className="text-[10px] text-gray-600 font-mono">L:{step.lineNumber}</span>
                     </div>
                     
                     <div className="flex justify-between items-center">
                        <div className="text-[10px] text-gray-400 truncate font-mono mb-1">
                            {step.operands}
                        </div>
                        <div className="text-[9px] text-gray-600 bg-gray-900 px-1 rounded">
                            {step.cycles}T
                        </div>
                     </div>
                     
                     {step.type === 'LOOP' && (
                       <div className="flex items-center gap-1 text-[10px] text-yellow-500 bg-yellow-900/20 px-1.5 py-0.5 rounded w-fit mt-1">
                         <Repeat size={10} />
                         Loop
                       </div>
                     )}
                   </div>
                 );
               })}
             </div>
          </div>
        </div>
      ) : activeTab === 'STACK' ? (
         <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0d0d0d]">
             <div className="p-4 space-y-1">
                 {/* Header to explain SP relative view */}
                 <div className="flex justify-between text-[10px] text-gray-500 border-b border-gray-800 pb-1 mb-2">
                     <span>ADDRESS (SP)</span>
                     <span>VALUE (16-BIT)</span>
                 </div>
                 
                 {stackWords.map((item, idx) => {
                     const isSp = idx === 0; // First item is always SP in this view
                     return (
                         <div key={item.addr} className={`flex items-center justify-between p-2 rounded border bg-[#1a1a1a] font-mono text-xs transition-all ${
                             isSp ? 'border-red-500 bg-red-900/10 shadow-[inset_0_0_10px_rgba(239,68,68,0.2)]' : 'border-gray-800'
                         }`}>
                            <div className="flex items-center gap-2">
                                {isSp && <ArrowRight size={10} className="text-red-500" />}
                                <div className={`${isSp ? 'text-red-400 font-bold' : 'text-gray-500'}`}>${h16val(item.addr)}</div>
                                {isSp && <span className="text-[9px] text-red-500 uppercase tracking-tighter">TOP</span>}
                            </div>
                            <div className="text-white font-bold tracking-wider">
                                ${h16val(item.val)}
                            </div>
                         </div>
                     );
                 })}
                 <div className="text-center mt-4 text-[9px] text-gray-600 italic">
                     Displaying top 12 words from SP
                 </div>
             </div>
         </div>
      ) : activeTab === 'MEM' ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0d0d0d]">
           {memoryVariables.length === 0 ? (
             <div className="p-8 text-center text-gray-600 flex flex-col items-center">
               <Database size={32} className="mb-3 opacity-20" />
               <p className="text-xs">No RAM variables detected.</p>
             </div>
           ) : (
             <div className="p-4">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="text-xs font-bold text-green-500 uppercase tracking-wide">RAM Variables</h3>
                 <span className="text-[10px] text-gray-500">{memoryVariables.length} tracked</span>
               </div>
               
               <div className="space-y-1">
                 {memoryVariables.map((variable) => {
                   const isModified = variable.value !== (analysis.initialVariables.find(v=>v.name===variable.name)?.value || 0);
                   return (
                     <div 
                       key={variable.name} 
                       className={`flex items-center justify-between p-2 rounded border font-mono text-xs transition-colors ${
                         isModified
                           ? 'bg-green-900/20 border-green-800' 
                           : 'bg-[#1a1a1a] border-gray-800'
                       }`}
                     >
                       <div>
                         <div className="font-bold text-gray-300">{variable.name}</div>
                         {variable.address && (
                           <div className="text-[9px] text-gray-600">{variable.address}</div>
                         )}
                       </div>
                       <div className="flex flex-col items-end">
                          <span className={`font-bold ${isModified ? 'text-green-400' : 'text-blue-300'}`}>
                            {/* Improved: Show 4 digits if value > 255 to distinguish Words from Bytes */}
                            ${variable.value > 0xFF 
                                ? variable.value.toString(16).toUpperCase().padStart(4, '0') 
                                : variable.value.toString(16).toUpperCase().padStart(2, '0')
                             }
                          </span>
                          <span className="text-[9px] text-gray-500">
                            DEC: {variable.value}
                          </span>
                       </div>
                     </div>
                   );
                 })}
               </div>
             </div>
           )}
        </div>
      ) : activeTab === 'LBL' ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0d0d0d]">
          {Object.keys(analysis.labels).length === 0 ? (
             <div className="p-8 text-center text-gray-600 flex flex-col items-center">
               <Hash size={32} className="mb-3 opacity-20" />
               <p className="text-xs">No labels detected.</p>
             </div>
          ) : (
            <div className="p-4">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="text-xs font-bold text-purple-500 uppercase tracking-wide">Labels</h3>
                 <span className="text-[10px] text-gray-500">{Object.keys(analysis.labels).length} found</span>
               </div>
               <div className="space-y-1">
                {Object.entries(analysis.labels)
                   .sort((a, b) => a[0].localeCompare(b[0]))
                   .map(([label, lineNum]) => {
                     const address = analysis.symbolTable[label];
                     return (
                      <div 
                        key={label} 
                        onClick={() => jumpToLine(lineNum as number)}
                        className="flex items-center justify-between p-2 rounded border border-gray-800 bg-[#1a1a1a] font-mono text-xs hover:bg-purple-900/20 hover:border-purple-800 cursor-pointer transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                           <span className="text-gray-500 group-hover:text-purple-400">#</span>
                           <div className="font-bold text-gray-300 group-hover:text-white truncate max-w-[130px]" title={label}>{label}</div>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="font-mono text-blue-400 font-bold">
                                ${address !== undefined ? address.toString(16).toUpperCase().padStart(4, '0') : '????'}
                            </span>
                            <span className="text-[10px] text-gray-600 group-hover:text-purple-300">
                               Line {lineNum}
                            </span>
                        </div>
                      </div>
                    );
                   })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0d0d0d]">
          {constants.length === 0 ? (
             <div className="p-8 text-center text-gray-600 flex flex-col items-center">
               <Tag size={32} className="mb-3 opacity-20" />
               <p className="text-xs">No Constants detected.</p>
             </div>
          ) : (
            <div className="p-4">
               <div className="space-y-1">
                {constants.map((constant) => (
                  <div 
                    key={constant.name} 
                    className="flex items-center justify-between p-2 rounded border border-gray-800 bg-[#1a1a1a] font-mono text-xs hover:border-orange-900/50 transition-colors"
                  >
                    <div>
                      <div className="font-bold text-gray-300">{constant.name}</div>
                    </div>
                    <div className="flex flex-col items-end">
                       <span className="font-bold text-orange-300">
                         {constant.hex}
                       </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};