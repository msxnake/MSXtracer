
import React, { useRef, useState } from 'react';
import { Upload, SkipForward, RotateCcw, FileCode, AlertTriangle, Cpu, CornerDownRight, CornerUpLeft, Layers, Search, X, CheckCircle, XCircle, Undo2, Play, Pause, Edit, Eye, Monitor, Zap, FastForward, HardDrive } from 'lucide-react';
import { AppState, StepType, ReachabilityResult, Z80Registers } from '../types';

interface ControlPanelProps {
  appState: AppState;
  onFileUpload: (content: string, fileName: string) => void;
  onStep: () => void;
  onStepIn: () => void;
  onStepOut: () => void;
  onUndo: () => void;
  onReset: () => void;
  onAnalyze: () => void;
  onCheckLabel?: (label: string) => ReachabilityResult;
  onTogglePlay: () => void;
  onToggleEdit: () => void;
  onToggleVDP: () => void;
  onToggleCBios: () => void;
  onRegisterChange: (reg: keyof Z80Registers, value: number) => void;
  onRunLoop?: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  appState,
  onFileUpload,
  onStep,
  onStepIn,
  onStepOut,
  onUndo,
  onReset,
  onAnalyze,
  onCheckLabel,
  onTogglePlay,
  onToggleEdit,
  onToggleVDP,
  onToggleCBios,
  onRegisterChange,
  onRunLoop
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [searchLabel, setSearchLabel] = useState('');
  const [searchResult, setSearchResult] = useState<ReachabilityResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onFileUpload(event.target.result as string, file.name);
        }
      };
      reader.readAsText(file);
    }
  };
  
  const executeLabelCheck = () => {
    if(!onCheckLabel || !searchLabel) return;
    const result = onCheckLabel(searchLabel);
    setSearchResult(result);
  };

  const closeDialog = () => {
    setShowSearchDialog(false);
    setSearchLabel('');
    setSearchResult(null);
  };

  const currentStep = appState.analysis?.steps[appState.currentStepIndex];
  const totalSteps = appState.analysis?.steps.length || 0;
  const isFinished = !appState.manualLine && appState.analysis && appState.currentStepIndex >= totalSteps - 1;
  
  const isManualMode = appState.manualLine !== null;
  const canStepIn = isManualMode 
    ? true 
    : currentStep?.type === StepType.CALL;
    
  const canStepOut = appState.callStack.length > 0;
  const canUndo = appState.history.length > 0;
  const isDJNZ = currentStep?.opcode === 'DJNZ';

  return (
    <div className="w-80 bg-[#111] border-r border-gray-800 flex flex-col h-full overflow-y-auto relative">
      {/* File Loader */}
      <div className="p-6 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider flex items-center gap-2">
            <FileCode size={16} /> Source Code
        </h2>
        <input type="file" accept=".asm,.z80,.txt" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
        
        {!appState.fileName && !appState.code ? (
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-32 border-2 border-dashed border-gray-700 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:border-blue-500 hover:text-blue-400 transition-colors bg-gray-900/50"
          >
            <Upload size={24} className="mb-2" />
            <span className="text-sm">Load .ASM File</span>
          </button>
        ) : (
          <div className="bg-gray-800 rounded p-3 flex items-center justify-between border border-gray-700">
            <div className="flex items-center gap-2 overflow-hidden">
              <FileCode size={18} className="text-blue-400 flex-shrink-0" />
              <span className="text-sm truncate font-mono text-gray-200">{appState.fileName || "untitled.asm"}</span>
            </div>
            <div className="flex gap-2">
                 <button onClick={onToggleEdit} className="text-xs text-blue-400 hover:text-white" title={appState.isEditing ? "View Mode" : "Edit Code"}>
                    {appState.isEditing ? <Eye size={16} /> : <Edit size={16} />}
                 </button>
                 <button onClick={() => fileInputRef.current?.click()} className="text-xs text-gray-400 hover:text-white underline">Change</button>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-4">
           {appState.code && !appState.isLoading && (
            <button
              onClick={onAnalyze}
              className="flex-1 bg-blue-700 hover:bg-blue-600 text-white py-2 rounded font-medium transition-colors shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
            >
              <Cpu size={16} />
              {appState.analysis ? "Re-Analyze" : "Analyze Flow"}
            </button>
          )}
          
          {appState.code && (
            <button
               onClick={() => setShowSearchDialog(true)}
               className="w-10 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded flex items-center justify-center text-gray-300"
               title="Check Label Usage"
            >
               <Search size={16} />
            </button>
          )}
        </div>
        
        {appState.analysis && (
            <div className="mt-4 flex items-center gap-2 bg-green-950/20 border border-green-900/30 p-2 rounded">
                <Zap size={14} className="text-green-500" />
                <span className="text-[10px] text-green-400 font-bold uppercase tracking-widest">Live Patching Enabled</span>
            </div>
        )}
      </div>

      {/* Execution Controls */}
      <div className="p-6 flex-1">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
               {appState.biosContext?.active ? "BIOS Debugger" : isManualMode ? "Manual Debugger" : "Flow Debugger"}
            </h2>
            {/* Breakpoint status */}
            {appState.breakpoints.size > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded border border-red-900/50">
                   <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                   {appState.breakpoints.size} BPs Active
                </div>
            )}
        </div>

        {/* BIOS Mode Indicator */}
        {appState.biosContext?.active && (
           <div className="mb-4 bg-purple-900/30 border border-purple-600 rounded p-3 animate-fade-in">
             <div className="flex items-center gap-2 mb-2">
               <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse shadow-[0_0_8px_#a855f7]"></div>
               <span className="text-xs font-bold text-purple-300 uppercase tracking-wide">BIOS Trace Active</span>
             </div>
             <div className="space-y-1">
               <div className="flex justify-between text-[10px]">
                 <span className="text-purple-400">Routine:</span>
                 <span className="text-white font-mono font-bold">{appState.biosContext.routineName}</span>
               </div>
               <div className="flex justify-between text-[10px]">
                 <span className="text-purple-400">PC:</span>
                 <span className="text-yellow-400 font-mono">${appState.biosContext.currentPC.toString(16).toUpperCase().padStart(4, '0')}</span>
               </div>
               <div className="flex justify-between text-[10px]">
                 <span className="text-purple-400">Entry:</span>
                 <span className="text-gray-400 font-mono">${appState.biosContext.entryAddress.toString(16).toUpperCase().padStart(4, '0')}</span>
               </div>
             </div>
             <p className="text-[10px] text-purple-400/70 mt-2 italic">
               Step through BIOS code. RET will return to user code.
             </p>
           </div>
        )}
        
        {/* Play/Step/Reset */}
        <div className="flex gap-2 mb-2">
          {appState.analysis && !isFinished ? (
              <button
                onClick={onTogglePlay}
                className={`w-14 flex items-center justify-center rounded transition-all shadow-md ${
                    appState.isPlaying 
                    ? 'bg-red-800 hover:bg-red-700 text-white' 
                    : 'bg-green-700 hover:bg-green-600 text-white'
                }`}
                title={appState.isPlaying ? "Pause Auto-Run" : "Run (Auto Step)"}
              >
                  {appState.isPlaying ? <Pause size={20} /> : <Play size={20} fill="currentColor" />}
              </button>
          ) : null}

          <button
            onClick={onStep}
            disabled={!appState.analysis || isFinished || appState.isPlaying}
            className={`flex-1 text-white py-3 rounded flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-md ${
              isManualMode 
                ? 'bg-purple-700 hover:bg-purple-600' 
                : 'bg-blue-700 hover:bg-blue-600 disabled:opacity-30 disabled:hover:bg-blue-700'
            }`}
          >
            <SkipForward size={20} />
            <span className="text-xs font-bold">STEP</span>
          </button>

          <div className="flex flex-col gap-2">
            <button onClick={onUndo} disabled={!canUndo || appState.isPlaying} className="w-14 flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-white rounded flex flex-col items-center justify-center gap-0.5 border border-gray-600 transition-all active:scale-95">
              <Undo2 size={16} className="text-yellow-500" />
              <span className="text-[9px]">UNDO</span>
            </button>
            <button onClick={onReset} disabled={!appState.analysis} className="w-14 flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-white rounded flex flex-col items-center justify-center gap-0.5 border border-gray-600 transition-all active:scale-95">
              <RotateCcw size={16} />
              <span className="text-[9px]">RST</span>
            </button>
          </div>
        </div>

        {/* Step In / Out */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={onStepIn}
            disabled={!canStepIn || appState.isPlaying}
            className={`flex-1 py-2 rounded flex items-center justify-center gap-2 border transition-all ${
              canStepIn 
                ? 'bg-purple-900/50 border-purple-500 text-purple-200 hover:bg-purple-800/50 cursor-pointer shadow-[0_0_10px_rgba(168,85,247,0.2)]' 
                : 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed'
            }`}
          >
            <CornerDownRight size={16} />
            <span className="text-xs font-bold">IN</span>
          </button>

          <button
            onClick={onStepOut}
            disabled={!canStepOut || appState.isPlaying}
            className={`flex-1 py-2 rounded flex items-center justify-center gap-2 border transition-all ${
              canStepOut 
                ? 'bg-orange-900/50 border-orange-500 text-orange-200 hover:bg-orange-800/50 cursor-pointer' 
                : 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed'
            }`}
          >
            <CornerUpLeft size={16} />
            <span className="text-xs font-bold">OUT</span>
          </button>
        </div>
        
        {/* DJNZ Controls */}
        {isDJNZ && (
             <div className="space-y-2 mb-4">
                 <button 
                    onClick={onRunLoop}
                    className="w-full bg-blue-900/50 hover:bg-blue-800/70 text-blue-200 border border-blue-700/50 py-2 rounded flex items-center justify-center gap-2 transition-all text-xs font-bold shadow-[0_0_10px_rgba(59,130,246,0.3)] animate-pulse"
                    title="Simulates every iteration of the loop instantly, updating memory and VRAM."
                 >
                    <Zap size={14} fill="currentColor" /> ⚡ Run Loop (Full Dump)
                 </button>

                 <button 
                    onClick={() => onRegisterChange('b', 1)}
                    className="w-full bg-yellow-900/20 hover:bg-yellow-800/40 text-yellow-500 border border-yellow-800/30 py-1.5 rounded flex items-center justify-center gap-2 transition-all text-[10px] font-bold"
                    title="Sets B register to 1, ensuring the loop finishes on the next step."
                 >
                    <FastForward size={12} /> Shortcut (Set B=1)
                 </button>
             </div>
        )}

        {/* VDP Monitor Toggle */}
        <div className="mb-2">
           <button
              onClick={onToggleVDP}
              disabled={!appState.analysis}
              className="w-full bg-[#1a1a1a] border border-gray-700 hover:border-blue-500 hover:text-white text-gray-400 py-2 rounded flex items-center justify-center gap-2 transition-all disabled:opacity-50"
           >
              <Monitor size={16} />
              <span className="text-xs font-bold">VDP MONITOR (Screen 2)</span>
           </button>
        </div>

        {/* C-BIOS Loader Toggle */}
        <div className="mb-6">
           <button
              onClick={onToggleCBios}
              className={`w-full border py-2 rounded flex items-center justify-center gap-2 transition-all ${
                appState.cbiosState.loaded
                  ? 'bg-green-900/20 border-green-700 text-green-400 hover:border-green-500'
                  : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:border-cyan-500 hover:text-cyan-400'
              }`}
           >
              <HardDrive size={16} />
              <span className="text-xs font-bold">
                {appState.cbiosState.loaded ? `C-BIOS ${appState.cbiosState.version.toUpperCase()} LOADED` : 'LOAD C-BIOS ROM'}
              </span>
           </button>
        </div>

        {/* Call Stack */}
        {appState.callStack.length > 0 && (
          <div className="mb-4 bg-[#0a0a0a] border border-gray-800 rounded p-3">
             <div className="flex items-center gap-2 mb-2 border-b border-gray-800 pb-2">
               <Layers size={12} className="text-purple-400" />
               <span className="text-xs font-bold text-gray-300 uppercase">Call Stack (Depth: {appState.callStack.length})</span>
             </div>
             <div className="space-y-1">
                <div className="text-[10px] text-purple-300 font-mono pl-2 border-l-2 border-purple-500 truncate">
                  &gt; Current Execution
                </div>
               {[...appState.callStack].reverse().map((frame, i) => (
                 <div key={i} className="text-[10px] text-gray-500 font-mono pl-2 border-l-2 border-gray-700 truncate">
                   {frame.subroutineName || 'Unknown'} (Line {frame.returnLine})
                 </div>
               ))}
             </div>
          </div>
        )}

        {/* Current State Info */}
        {appState.analysis && !isManualMode && (
          <div className="space-y-4">
             <div className="bg-[#0a0a0a] border border-gray-800 rounded p-3">
              <span className="text-xs text-gray-500 block mb-1">Execution Progress</span>
              <div className="flex justify-between items-end">
                <span className="text-2xl font-mono text-blue-400">
                  {String(appState.currentStepIndex + 1).padStart(3, '0')}
                </span>
                <span className="text-xs text-gray-600 mb-1">/ {totalSteps}</span>
              </div>
              <div className="w-full bg-gray-800 h-1 mt-2 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${((appState.currentStepIndex + 1) / totalSteps) * 100}%` }} />
              </div>
            </div>

            {currentStep && (
              <div className="animate-fade-in">
                <div className={`border-l-4 p-3 rounded bg-opacity-10 ${
                  currentStep.type === 'BUG_WARNING' ? 'border-red-500 bg-red-900' :
                  currentStep.type === 'LOOP' ? 'border-yellow-500 bg-yellow-900' :
                  currentStep.type === 'CALL' ? 'border-purple-500 bg-purple-900' :
                  'border-blue-500 bg-blue-900'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      currentStep.type === 'BUG_WARNING' ? 'bg-red-600 text-white' :
                      currentStep.type === 'LOOP' ? 'bg-yellow-600 text-black' :
                      'bg-gray-700 text-gray-300'
                    }`}>
                      {currentStep.type}
                    </span>
                    <span className="text-xs font-mono text-gray-400">Line {currentStep.lineNumber}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-100 mb-1">{currentStep.opcode} {currentStep.operands}</p>
                  <p className="text-xs text-gray-400 leading-relaxed">{currentStep.description}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {isManualMode && (
           <div className="bg-purple-900/20 border border-purple-800 p-3 rounded">
             <h4 className="text-xs font-bold text-purple-300 mb-1">Manual Investigation Mode</h4>
             <p className="text-[10px] text-gray-400">
               You are manually stepping through code. The automated flow analysis is paused.
             </p>
           </div>
        )}
      </div>

      {/* Bugs Detected Summary */}
      {appState.analysis && appState.analysis.detectedBugs.length > 0 && (
        <div className="p-4 bg-red-900/20 border-t border-red-900/50">
          <div className="flex items-center gap-2 text-red-400 mb-2">
            <AlertTriangle size={16} />
            <span className="text-xs font-bold uppercase">Bugs Detected</span>
          </div>
          <ul className="text-xs text-red-300 list-disc list-inside space-y-1">
            {appState.analysis.detectedBugs.slice(0, 3).map((bug, i) => (
              <li key={i} className="truncate">{bug}</li>
            ))}
          </ul>
        </div>
      )}

      {/* MODAL DIALOG: SEARCH LABEL */}
      {showSearchDialog && (
         <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col p-4 animate-fade-in">
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-sm font-bold text-white flex items-center gap-2">
                 <Search size={16} /> Check Label Reachability
               </h3>
               <button onClick={closeDialog} className="text-gray-400 hover:text-white"><X size={18} /></button>
             </div>
             
             <div className="bg-[#1a1a1a] rounded p-3 mb-4">
               <label className="text-xs text-gray-500 block mb-1">Label Name</label>
               <div className="flex gap-2">
                 <input 
                   type="text" 
                   value={searchLabel}
                   onChange={(e) => setSearchLabel(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && executeLabelCheck()}
                   className="flex-1 bg-black border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-blue-500 outline-none font-mono"
                   placeholder="Enter label..."
                   autoFocus
                 />
                 <button onClick={executeLabelCheck} className="bg-blue-700 hover:bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold">CHECK</button>
               </div>
             </div>
             
             {searchResult && (
               <div className="flex-1 overflow-auto">
                 {/* Search Result Display Code */}
                 <div className={`p-3 rounded border mb-2 ${
                    searchResult.isReachable ? 'bg-green-900/20 border-green-500/50' : 
                    searchResult.status === 'NOT_FOUND' ? 'bg-gray-800 border-gray-600' :
                    'bg-red-900/20 border-red-500/50'
                 }`}>
                    <div className="flex items-center gap-2 mb-2">
                       {searchResult.isReachable ? <CheckCircle size={18} className="text-green-500" /> : <XCircle size={18} className="text-red-500" />}
                       <span className={`font-bold text-sm ${searchResult.isReachable ? 'text-green-400' : 'text-red-400'}`}>
                         {searchResult.status.replace('_', ' ')}
                       </span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed mb-2">
                       {searchResult.status === 'EXECUTED' && "Reachable."}
                       {searchResult.status === 'DEAD_CODE' && "Dead code."}
                       {searchResult.status === 'REFERENCED' && "Referenced but not executed."}
                       {searchResult.status === 'NOT_FOUND' && "Not found."}
                    </p>
                 </div>
                 {searchResult.tracePath.length > 0 && (
                   <div className="bg-[#0a0a0a] rounded p-3 border border-gray-800">
                     <h4 className="text-[10px] text-gray-500 font-bold uppercase mb-2">Trace Path</h4>
                     <div className="flex flex-wrap gap-1">
                       {searchResult.tracePath.map((node, i) => (
                         <React.Fragment key={i}>
                           <span className="text-[10px] bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded font-mono">{node}</span>
                           {i < searchResult.tracePath.length - 1 && <span className="text-gray-600">→</span>}
                         </React.Fragment>
                       ))}
                     </div>
                   </div>
                 )}
               </div>
             )}
         </div>
      )}
    </div>
  );
};
