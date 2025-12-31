
import React, { useEffect, useRef, useState } from 'react';
import { VDPState } from '../types';
import { X, Grid, Image, Binary, RefreshCw, Ghost } from 'lucide-react';

interface VdpViewerProps {
  vdpState: VDPState;
  onClose: () => void;
}

export const VdpViewer: React.FC<VdpViewerProps> = ({ vdpState, onClose }) => {
  const [activeTab, setActiveTab] = useState<'SCREEN' | 'PATTERNS' | 'SPRITES' | 'MEM'>('SCREEN');
  const [forceUpdate, setForceUpdate] = useState(0); 
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const PALETTE = [
    '#00000000', // 0 Transparent
    '#000000',   // 1 Black
    '#20C020',   // 2 Medium Green
    '#60E060',   // 3 Light Green
    '#2020E0',   // 4 Dark Blue
    '#4060E0',   // 5 Light Blue
    '#A02020',   // 6 Dark Red
    '#40C0E0',   // 7 Cyan
    '#E02020',   // 8 Medium Red
    '#E06060',   // 9 Light Red
    '#C0C020',   // 10 Dark Yellow
    '#C0C080',   // 11 Light Yellow
    '#208020',   // 12 Dark Green
    '#C040A0',   // 13 Magenta
    '#A0A0A0',   // 14 Gray
    '#FFFFFF',   // 15 White
  ];

  const parseColor = (hex: string) => {
    if (hex.length > 7) return [0,0,0,0]; // Transparent
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b, 255];
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    const { vram } = vdpState;
    const PGT_BASE = 0x0000;
    const PCT_BASE = 0x2000;
    const PNT_BASE = 0x1800;
    const SAT_BASE = 0x1B00;
    const SPT_BASE = 0x3800;

    if (activeTab === 'SCREEN') {
        const imgData = ctx.createImageData(256, 192);
        const data = imgData.data;

        for (let row = 0; row < 24; row++) {
            for (let col = 0; col < 32; col++) {
                const pntIndex = PNT_BASE + (row * 32) + col;
                const charCode = vram[pntIndex] || 0;
                const bank = Math.floor(row / 8); 
                const offset = (bank * 0x800) + (charCode * 8);
                const pgtAddr = PGT_BASE + offset;
                const pctAddr = PCT_BASE + offset;

                for (let y = 0; y < 8; y++) {
                    const patternByte = vram[pgtAddr + y] || 0;
                    const colorByte = vram[pctAddr + y] || 0;
                    const fgColor = parseColor(PALETTE[(colorByte >> 4) & 0x0F]);
                    const bgColor = parseColor(PALETTE[colorByte & 0x0F]);

                    for (let x = 0; x < 8; x++) {
                        const bit = (patternByte >> (7 - x)) & 1;
                        const pixelX = (col * 8) + x;
                        const pixelY = (row * 8) + y;
                        const pixelIdx = (pixelY * 256 + pixelX) * 4;
                        const color = bit ? fgColor : bgColor;
                        data[pixelIdx] = color[0];
                        data[pixelIdx + 1] = color[1];
                        data[pixelIdx + 2] = color[2];
                        data[pixelIdx + 3] = color[3];
                    }
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);
    } 
    else if (activeTab === 'PATTERNS') {
        const imgData = ctx.createImageData(256, 192);
        const data = imgData.data;
        for (let i = 0; i < 768; i++) {
             const bank = Math.floor(i / 256);
             const charCode = i % 256;
             const tileCol = i % 32;
             const tileRow = Math.floor(i / 32);
             const offset = (bank * 0x800) + (charCode * 8);
             const pgtAddr = PGT_BASE + offset;
             const pctAddr = PCT_BASE + offset;

             for (let y = 0; y < 8; y++) {
                const patternByte = vram[pgtAddr + y] || 0;
                const colorByte = vram[pctAddr + y] || 0;
                let fgIdx = (colorByte >> 4) & 0x0F;
                let bgIdx = colorByte & 0x0F;
                if (fgIdx === bgIdx) { fgIdx = 15; bgIdx = 4; }
                const fgColor = parseColor(PALETTE[fgIdx]);
                const bgColor = parseColor(PALETTE[bgIdx]);

                for (let x = 0; x < 8; x++) {
                    const bit = (patternByte >> (7 - x)) & 1;
                    const pixelX = (tileCol * 8) + x;
                    const pixelY = (tileRow * 8) + y;
                    const pixelIdx = (pixelY * 256 + pixelX) * 4;
                    const color = bit ? fgColor : bgColor;
                    data[pixelIdx] = color[0];
                    data[pixelIdx + 1] = color[1];
                    data[pixelIdx + 2] = color[2];
                    data[pixelIdx + 3] = 255;
                }
             }
        }
        ctx.putImageData(imgData, 0, 0);
    }
    else if (activeTab === 'SPRITES') {
        ctx.clearRect(0,0, 256, 192);
        for (let i = 0; i < 32; i++) {
            const addr = SAT_BASE + (i * 4);
            const y = vram[addr];
            if (y === 208) break; 

            const x = vram[addr + 1];
            const pattern = vram[addr + 2];
            const colorByte = vram[addr + 3];
            const colorIdx = colorByte & 0x0F;
            const ec = (colorByte & 0x80) !== 0;
            const realX = ec ? x - 32 : x;
            const realY = y + 1;

            const color = PALETTE[colorIdx === 0 ? 1 : colorIdx];
            ctx.fillStyle = color;

            const patternAddr = SPT_BASE + (pattern * 8);
            for (let py = 0; py < 8; py++) {
                const byte = vram[patternAddr + py] || 0;
                for (let px = 0; px < 8; px++) {
                    if ((byte >> (7 - px)) & 1) {
                        ctx.fillRect(realX + px, realY + py, 1, 1);
                    }
                }
            }
        }
    }
  }, [vdpState, activeTab, forceUpdate]);

  const renderSpriteAttributes = () => {
    const sprites = [];
    for (let i = 0; i < 32; i++) {
        const addr = 0x1B00 + (i * 4);
        const y = vdpState.vram[addr];
        if (y === 208) break;
        sprites.push({
            id: i,
            y, x: vdpState.vram[addr+1],
            p: vdpState.vram[addr+2],
            c: vdpState.vram[addr+3] & 0x0F,
            ec: (vdpState.vram[addr+3] & 0x80) !== 0
        });
    }

    return (
        <div className="grid grid-cols-1 gap-2 p-2">
            {sprites.map(s => (
                <div key={s.id} className="flex items-center gap-4 bg-gray-900 border border-gray-800 p-2 rounded text-[10px] font-mono hover:border-blue-500 transition-colors">
                    <div className="w-6 h-6 bg-black border border-gray-700 flex items-center justify-center">
                        <div style={{ backgroundColor: PALETTE[s.c === 0 ? 1 : s.c], width: '8px', height: '8px' }} />
                    </div>
                    <div className="grid grid-cols-5 gap-4 flex-1">
                        <div><span className="text-gray-600">ID:</span> <span className="text-white">{s.id}</span></div>
                        <div><span className="text-gray-600">X:</span> <span className="text-blue-400">{s.x}</span></div>
                        <div><span className="text-gray-600">Y:</span> <span className="text-blue-400">{s.y}</span></div>
                        <div><span className="text-gray-600">PTN:</span> <span className="text-purple-400">{s.p}</span></div>
                        <div><span className="text-gray-600">EC:</span> <span className={s.ec ? "text-yellow-500" : "text-gray-700"}>{s.ec ? 'Y' : 'N'}</span></div>
                    </div>
                </div>
            ))}
            {sprites.length === 0 && <div className="text-center py-8 text-gray-600 text-xs">No active sprites (SAT empty or $D0 at first entry)</div>}
        </div>
    );
  };

  const renderHexDump = () => {
    const rows = 128; // Muestra 2KB de VRAM para evitar saturar el DOM
    const currentPointer = vdpState.addressRegister & 0x3FFF;

    return (
      <div className="w-full font-mono text-[10px] text-gray-400 overflow-x-auto select-text custom-scrollbar">
          <div className="min-w-max inline-block bg-black/50 rounded-sm">
            <table className="border-collapse w-full">
              <thead>
                <tr className="bg-gray-900 text-gray-600 border-b border-gray-800">
                  <th className="px-2 py-1 text-left font-bold sticky left-0 bg-gray-900 z-10">ADDR</th>
                  <th className="px-2 py-1 text-center" colSpan={16}>DATA (0-F)</th>
                  <th className="px-2 py-1 text-left border-l border-gray-800">ASCII</th>
                </tr>
              </thead>
              <tbody>
                  {[...Array(rows)].map((_, row) => {
                      const addr = row * 16;
                      const bytes = vdpState.vram.slice(addr, addr + 16);
                      const ascii = bytes.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
                      
                      return (
                        <tr key={addr} className="hover:bg-blue-900/10 group border-b border-gray-900/30">
                          <td className="px-2 py-0.5 text-blue-900 font-bold border-r border-gray-800 sticky left-0 bg-black group-hover:bg-gray-900 z-10">
                            ${addr.toString(16).toUpperCase().padStart(4, '0')}
                          </td>
                          <td className="px-2 py-0.5 whitespace-nowrap">
                            {bytes.map((b, i) => {
                                const cellAddr = addr + i;
                                const isPointer = cellAddr === currentPointer;
                                return (
                                  <span 
                                    key={i} 
                                    className={`inline-block w-4 text-center ${
                                        isPointer ? 'bg-yellow-500 text-black font-bold rounded-sm' : 
                                        (b === 0 ? 'text-gray-800' : 'text-gray-300')
                                    } ${i === 7 ? 'mr-3' : 'mr-1'}`}
                                  >
                                    {b.toString(16).toUpperCase().padStart(2, '0')}
                                  </span>
                                );
                            })}
                          </td>
                          <td className="px-2 py-0.5 text-gray-600 border-l border-gray-800 bg-gray-950/20 italic tracking-widest">
                            {ascii}
                          </td>
                        </tr>
                      );
                  })}
              </tbody>
            </table>
          </div>
          {vdpState.vram.length > rows * 16 && (
            <div className="p-2 text-[9px] text-gray-600 text-center italic">
              * Showing first 2KB of VRAM. Full dump available in emulator builds.
            </div>
          )}
      </div>
    );
  };

  return (
    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in p-2 md:p-4">
       <div className="bg-[#1a1a1a] rounded-lg shadow-2xl border border-gray-700 w-full max-w-4xl flex flex-col overflow-hidden max-h-[95vh]">
          {/* Header */}
          <div className="bg-[#252526] p-3 flex justify-between items-center border-b border-gray-800">
             <div className="flex items-center gap-2 text-gray-200">
                <Image size={18} className="text-blue-400" />
                <h2 className="font-bold text-sm tracking-wide uppercase">VDP MONITOR</h2>
             </div>
             <div className="flex gap-2">
                 <button onClick={() => setForceUpdate(n => n + 1)} className="text-gray-400 hover:text-white transition-colors p-1" title="Refresh VRAM View">
                     <RefreshCw size={16} />
                 </button>
                 <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1"><X size={20} /></button>
             </div>
          </div>

          {/* Controls */}
          <div className="bg-[#111] p-2 flex gap-1 md:gap-2 border-b border-gray-800 overflow-x-auto no-scrollbar">
              <button onClick={() => setActiveTab('SCREEN')} className={`px-2 md:px-3 py-1 text-[10px] md:text-xs rounded font-bold flex items-center gap-2 transition-all flex-shrink-0 ${activeTab === 'SCREEN' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  <Image size={14} /> Screen View
              </button>
              <button onClick={() => setActiveTab('PATTERNS')} className={`px-2 md:px-3 py-1 text-[10px] md:text-xs rounded font-bold flex items-center gap-2 transition-all flex-shrink-0 ${activeTab === 'PATTERNS' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  <Grid size={14} /> Patterns
              </button>
              <button onClick={() => setActiveTab('SPRITES')} className={`px-2 md:px-3 py-1 text-[10px] md:text-xs rounded font-bold flex items-center gap-2 transition-all flex-shrink-0 ${activeTab === 'SPRITES' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  <Ghost size={14} /> Sprites
              </button>
              <button onClick={() => setActiveTab('MEM')} className={`px-2 md:px-3 py-1 text-[10px] md:text-xs rounded font-bold flex items-center gap-2 transition-all flex-shrink-0 ${activeTab === 'MEM' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  <Binary size={14} /> Hex Dump
              </button>
          </div>

          {/* Content */}
          <div className="flex-1 bg-[#0a0a0a] overflow-hidden flex flex-col lg:flex-row">
              <div className="p-2 md:p-4 flex flex-col gap-4 border-b lg:border-b-0 lg:border-r border-gray-800 bg-black flex-shrink-0 items-center justify-center">
                  <div className="border-4 border-gray-800 rounded shadow-2xl bg-black overflow-hidden flex items-center justify-center">
                    <canvas ref={canvasRef} width={256} height={192} className="image-pixelated w-[256px] sm:w-[384px] md:w-[480px] h-auto" style={{ imageRendering: 'pixelated' }} />
                  </div>
                  <div className="flex justify-between w-full text-[10px] text-gray-500 font-mono">
                    <span>256 x 192</span>
                    <span className="text-blue-500">TMS9918 CORE</span>
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0d0d0d] p-1 md:p-2">
                  {activeTab === 'SPRITES' && (
                      <div className="space-y-4">
                        <div className="bg-blue-900/10 border border-blue-900/30 p-2 rounded mb-2">
                           <h4 className="text-[10px] font-bold text-blue-400 uppercase mb-1">Sprite Attribute Table ($1B00)</h4>
                           <p className="text-[9px] text-gray-500">Showing hardware sprite slots. Y=208 ($D0) terminates processing.</p>
                        </div>
                        {renderSpriteAttributes()}
                      </div>
                  )}
                  {activeTab === 'MEM' && renderHexDump()}
                  {activeTab === 'PATTERNS' && (
                      <div className="p-2">
                          <p className="text-[9px] text-gray-500 mb-2 uppercase font-bold">Graphic Pattern Table (0000h - 17FFh)</p>
                          <p className="text-[9px] text-gray-600 italic">Tile visualization based on current VRAM content.</p>
                      </div>
                  )}
                  {activeTab === 'SCREEN' && (
                      <div className="p-4 space-y-4">
                          <div className="bg-gray-900/50 p-3 rounded border border-gray-800">
                             <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase">VDP Registers (Live)</h4>
                             <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                                <div className="flex justify-between border-b border-gray-800 py-1"><span>Mode:</span> <span className="text-green-400">Screen 2</span></div>
                                <div className="flex justify-between border-b border-gray-800 py-1"><span>Addr:</span> <span className="text-blue-400">${vdpState.addressRegister.toString(16).toUpperCase()}</span></div>
                                <div className="flex justify-between border-b border-gray-800 py-1"><span>Latch:</span> <span className="text-yellow-400">{vdpState.writeLatch ? '1' : '0'}</span></div>
                             </div>
                          </div>
                      </div>
                  )}
              </div>
          </div>
          
          {/* Footer Info */}
          <div className="bg-[#111] p-2 border-t border-gray-800 flex justify-between text-[10px] text-gray-500 font-mono">
             <div className="hidden sm:flex gap-4">
                <span>PGT: $0000</span>
                <span>PNT: $1800</span>
                <span>SAT: $1B00</span>
                <span>SPT: $3800</span>
             </div>
             <span className="text-blue-700 ml-auto uppercase tracking-tighter">VDP Debugger Ready</span>
          </div>
       </div>
    </div>
  );
};
