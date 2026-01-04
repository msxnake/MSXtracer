import React from 'react';
import { Bug, Cpu } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="h-16 bg-[#1a1a1a] border-b border-gray-800 flex items-center px-6 justify-between shadow-md z-10">
      <div className="flex items-center gap-3">
        <div className="bg-blue-700 p-2 rounded text-white shadow-[0_0_10px_rgba(37,99,235,0.5)]">
          <Cpu size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-blue-400 tracking-wider">MSX Z80 <span className="text-white">TRACER</span></h1>
          <p className="text-xs text-gray-500 font-mono">Static Parser & Flow Analyzer</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-900 py-1 px-3 rounded border border-gray-800">
        <Cpu size={14} className="text-green-500" />
        <span>Local Mode Active</span>
      </div>
    </header>
  );
};