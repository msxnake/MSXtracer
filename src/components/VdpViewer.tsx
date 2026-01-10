
import React, { useEffect, useRef, useState } from 'react';
import { VDPState } from '../types';
import { X, Grid, Image, Binary, RefreshCw, Ghost, ArrowRight, Eye, EyeOff } from 'lucide-react';

interface VdpViewerProps {
    vdpState: VDPState;
    onClose: () => void;
}

export const VdpViewer: React.FC<VdpViewerProps> = ({ vdpState, onClose }) => {
    const [activeTab, setActiveTab] = useState<'SCREEN' | 'PATTERNS' | 'SPRITES' | 'MEM'>('SCREEN');
    const [forceUpdate, setForceUpdate] = useState(0);
    const [viewBaseAddress, setViewBaseAddress] = useState(0);
    const [addressInput, setAddressInput] = useState("0000");
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // VRAM Change Tracking
    const [prevVramSnapshot, setPrevVramSnapshot] = useState<number[]>([]);
    const [changedAddresses, setChangedAddresses] = useState<Set<number>>(new Set());
    const [showChanges, setShowChanges] = useState(true);
    const [changeStats, setChangeStats] = useState({ bytes: 0, tiles: 0, sprites: 0 });

    const PALETTE = [
        '#00000000', // 0 Transparent
        '#000000',   // 1 Black
        '#20C020',   // 2 Medium Green
        '#60E060',   // 3 Light Green
        '#2020E0',   // 4 Dark Blue
        '#4060E0',   // 5 Light Blue
        '#A02020',   // 6 Dark Red
        '#4060E0',   // 7 Cyan
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
        if (hex.length > 7) return [0, 0, 0, 0]; // Transparent
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b, 255];
    };

    // Detect VRAM changes
    useEffect(() => {
        if (prevVramSnapshot.length === 0) {
            // First render - initialize snapshot
            setPrevVramSnapshot([...vdpState.vram]);
            return;
        }

        const changes = new Set<number>();
        let tilesChanged = new Set<number>();
        let spritesChanged = new Set<number>();

        // Detect changed bytes
        for (let i = 0; i < vdpState.vram.length; i++) {
            if (vdpState.vram[i] !== prevVramSnapshot[i]) {
                changes.add(i);

                // Classify changes
                const PNT_BASE = 0x1800;
                const SAT_BASE = 0x1B00;
                const SPT_BASE = 0x3800;

                // Pattern Name Table (tiles on screen)
                if (i >= PNT_BASE && i < SAT_BASE) {
                    const offset = i - PNT_BASE;
                    const tileIndex = offset;
                    tilesChanged.add(tileIndex);
                }
                // Sprite Attribute Table
                else if (i >= SAT_BASE && i < SPT_BASE) {
                    const spriteIndex = Math.floor((i - SAT_BASE) / 4);
                    spritesChanged.add(spriteIndex);
                }
            }
        }

        setChangedAddresses(changes);
        setChangeStats({
            bytes: changes.size,
            tiles: tilesChanged.size,
            sprites: spritesChanged.size
        });
        setPrevVramSnapshot([...vdpState.vram]);
    }, [vdpState.vram]);


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

            // Render background (tiles)
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

            // Now render sprites on top
            for (let i = 0; i < 32; i++) {
                const addr = SAT_BASE + (i * 4);
                const y = vram[addr];
                if (y === 208) break; // End of sprite list

                const x = vram[addr + 1];
                const pattern = vram[addr + 2];
                const colorByte = vram[addr + 3];
                const colorIdx = colorByte & 0x0F;
                const ec = (colorByte & 0x80) !== 0; // Early clock bit

                // Sprite position calculation
                const realX = ec ? x - 32 : x;
                const realY = y + 1;

                // Skip if sprite color is transparent (0)
                if (colorIdx === 0) continue;

                const spriteColor = parseColor(PALETTE[colorIdx]);
                const patternAddr = SPT_BASE + (pattern * 8);

                // Draw 8x8 sprite pattern
                for (let py = 0; py < 8; py++) {
                    const byte = vram[patternAddr + py] || 0;
                    for (let px = 0; px < 8; px++) {
                        if ((byte >> (7 - px)) & 1) {
                            const screenX = realX + px;
                            const screenY = realY + py;

                            // Check if pixel is within screen bounds
                            if (screenX >= 0 && screenX < 256 && screenY >= 0 && screenY < 192) {
                                const pixelIdx = (screenY * 256 + screenX) * 4;
                                data[pixelIdx] = spriteColor[0];
                                data[pixelIdx + 1] = spriteColor[1];
                                data[pixelIdx + 2] = spriteColor[2];
                                data[pixelIdx + 3] = 255; // Opaque
                            }
                        }
                    }
                }
            }

            ctx.putImageData(imgData, 0, 0);

            // === RENDER CHANGE HIGHLIGHTS ===
            if (showChanges && changedAddresses.size > 0) {
                const PNT_BASE = 0x1800;
                const SAT_BASE = 0x1B00;

                // Highlight changed tiles (Name Table)
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 2;

                for (let addr of changedAddresses) {
                    if (addr >= PNT_BASE && addr < SAT_BASE) {
                        const offset = addr - PNT_BASE;
                        const col = offset % 32;
                        const row = Math.floor(offset / 32);
                        ctx.strokeRect(col * 8 + 1, row * 8 + 1, 6, 6);
                    }
                }

                // Highlight changed sprites (Sprite Attribute Table)
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 2;

                for (let addr of changedAddresses) {
                    if (addr >= SAT_BASE && addr < SAT_BASE + 128) {
                        const spriteIndex = Math.floor((addr - SAT_BASE) / 4);
                        const satAddr = SAT_BASE + (spriteIndex * 4);
                        const y = vram[satAddr];
                        if (y === 208) continue; // Skip inactive sprites

                        const x = vram[satAddr + 1];
                        const colorByte = vram[satAddr + 3];
                        const ec = (colorByte & 0x80) !== 0;
                        const realX = ec ? x - 32 : x;
                        const realY = y + 1;

                        // Draw yellow box around changed sprite
                        if (realX >= -8 && realX < 256 && realY >= -8 && realY < 192) {
                            ctx.strokeRect(realX, realY, 8, 8);
                        }
                    }
                }
            }
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
            ctx.clearRect(0, 0, 256, 192);
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
                y, x: vdpState.vram[addr + 1],
                p: vdpState.vram[addr + 2],
                c: vdpState.vram[addr + 3] & 0x0F,
                ec: (vdpState.vram[addr + 3] & 0x80) !== 0
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
        const rows = 128; // Show 2KB
        const currentPointer = vdpState.addressRegister & 0x3FFF;

        const handleAddressSubmit = () => {
            let val = parseInt(addressInput, 16);
            if (isNaN(val)) val = 0;
            val = val & 0x3FFF; // Clamp to 16KB
            val = val & 0xFFF0; // Align to 16 bytes
            setViewBaseAddress(val);
            setAddressInput(val.toString(16).toUpperCase().padStart(4, '0'));
        };

        return (
            <div className="w-full h-full bg-[#090909] font-mono text-[11px] overflow-hidden flex flex-col border border-gray-900 rounded">
                {/* Status Bar / Footer style Header */}
                <div className="bg-[#2d2d2d] text-gray-300 px-3 py-1.5 text-[11px] flex items-center gap-4 border-b border-black font-sans shadow-sm flex-shrink-0">
                    <span className="font-bold text-gray-400">View Addr</span>

                    <div className="flex items-center bg-gray-800 border border-gray-600 rounded overflow-hidden">
                        <span className="text-gray-500 pl-1.5 pr-0.5 text-[10px]">0x</span>
                        <input
                            type="text"
                            value={addressInput}
                            onChange={(e) => setAddressInput(e.target.value)}
                            onBlur={handleAddressSubmit}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddressSubmit()}
                            className="bg-transparent border-none outline-none text-white text-[11px] font-mono w-10 py-0.5 focus:bg-gray-700 transition-colors"
                        />
                    </div>

                    <div className="h-4 w-px bg-gray-600 mx-2"></div>

                    <span className="font-bold text-gray-400">VDP Ptr</span>
                    <div className="flex items-center gap-1 text-yellow-500 font-mono">
                        <ArrowRight size={10} />
                        <span>0x{vdpState.addressRegister.toString(16).toUpperCase().padStart(4, '0')}</span>
                    </div>

                    <span className="ml-auto opacity-50 text-gray-500 cursor-help" title="Enter Hex Address to Jump">(Type & Enter)</span>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar bg-[#050505]">
                    <div className="inline-block min-w-full p-2">
                        {Array.from({ length: rows }).map((_, rowIndex) => {
                            const rowAddr = viewBaseAddress + (rowIndex * 16);
                            if (rowAddr >= 16384) return null; // Out of VRAM bounds

                            const bytes = vdpState.vram.slice(rowAddr, rowAddr + 16);

                            const asciiStr = bytes.map(b => {
                                return (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
                            }).join('');

                            return (
                                <div key={rowIndex} className="flex hover:bg-[#1a1a1a] group leading-5 min-w-max">
                                    {/* Address */}
                                    <div className="text-gray-500 w-[50px] flex-shrink-0 select-none opacity-80 group-hover:opacity-100 group-hover:text-gray-400">
                                        {rowAddr.toString(16).toUpperCase().padStart(4, '0')}:
                                    </div>

                                    {/* Hex Data */}
                                    <div className="flex gap-2 mr-4 text-gray-300 select-text">
                                        {/* First 8 bytes */}
                                        <div className="flex gap-1.5">
                                            {bytes.slice(0, 8).map((b, colIndex) => {
                                                const addr = rowAddr + colIndex;
                                                const isSelected = addr === currentPointer;
                                                return (
                                                    <span key={colIndex} className={`w-[14px] text-center ${b === 0 ? 'text-gray-700' : 'text-gray-300'} ${isSelected ? 'bg-yellow-600 text-black font-bold rounded-sm' : ''}`}>
                                                        {b.toString(16).toUpperCase().padStart(2, '0')}
                                                    </span>
                                                );
                                            })}
                                        </div>

                                        {/* Second 8 bytes */}
                                        <div className="flex gap-1.5 border-l border-gray-800 pl-2">
                                            {bytes.slice(8, 16).map((b, colIndex) => {
                                                const addr = rowAddr + 8 + colIndex;
                                                const isSelected = addr === currentPointer;
                                                return (
                                                    <span key={colIndex} className={`w-[14px] text-center ${b === 0 ? 'text-gray-700' : 'text-gray-300'} ${isSelected ? 'bg-yellow-600 text-black font-bold rounded-sm' : ''}`}>
                                                        {b.toString(16).toUpperCase().padStart(2, '0')}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* ASCII */}
                                    <div className="text-gray-500 border-l border-gray-800 pl-4 tracking-[0.15em] select-text group-hover:text-gray-300 opacity-80">
                                        {asciiStr}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {viewBaseAddress + (rows * 16) < 16384 && (
                        <div className="p-2 text-center text-gray-700 italic text-[9px] border-t border-gray-900 bg-[#0a0a0a]">
                            ...
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in p-1 md:p-2">
            <div className="bg-[#1a1a1a] rounded-lg shadow-2xl border border-gray-700 w-[98vw] h-[98vh] max-w-none max-h-none flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-[#252526] p-3 flex justify-between items-center border-b border-gray-800 flex-shrink-0">
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
                <div className="bg-[#111] p-2 flex gap-1 md:gap-2 border-b border-gray-800 overflow-x-auto no-scrollbar flex-shrink-0">
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

                    {/* Divider */}
                    <div className="h-6 w-px bg-gray-700 mx-1"></div>

                    {/* Show Changes Toggle */}
                    <button
                        onClick={() => setShowChanges(!showChanges)}
                        className={`px-2 md:px-3 py-1 text-[10px] md:text-xs rounded font-bold flex items-center gap-2 transition-all flex-shrink-0 ${showChanges ? 'bg-green-600 text-white shadow-lg' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                        title={showChanges ? "Hide VRAM changes" : "Show VRAM changes"}
                    >
                        {showChanges ? <Eye size={14} /> : <EyeOff size={14} />}
                        <span className="hidden sm:inline">Changes</span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 bg-[#0a0a0a] overflow-hidden flex flex-col lg:flex-row min-h-0">
                    <div className="p-2 md:p-4 flex flex-col gap-4 border-b lg:border-b-0 lg:border-r border-gray-800 bg-black flex-shrink-0 items-center justify-center overflow-auto">
                        <div className="border-4 border-gray-800 rounded shadow-2xl bg-black overflow-hidden flex items-center justify-center flex-shrink-0">
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
                                {/* Change Statistics Panel */}
                                {changedAddresses.size > 0 && showChanges && (
                                    <div className="bg-green-900/20 border border-green-700/40 p-3 rounded mb-3 animate-pulse">
                                        <h4 className="text-xs font-bold text-green-400 mb-2 uppercase flex items-center gap-2">
                                            <Eye size={12} />
                                            VRAM Changes Detected
                                        </h4>
                                        <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                                            <div className="bg-black/30 p-2 rounded border border-gray-800">
                                                <div className="text-gray-500 uppercase text-[9px] mb-1">Bytes</div>
                                                <div className="text-green-400 font-bold text-sm">{changeStats.bytes}</div>
                                            </div>
                                            <div className="bg-black/30 p-2 rounded border border-gray-800">
                                                <div className="text-gray-500 uppercase text-[9px] mb-1">Tiles</div>
                                                <div className="text-green-400 font-bold text-sm">{changeStats.tiles}</div>
                                            </div>
                                            <div className="bg-black/30 p-2 rounded border border-gray-800">
                                                <div className="text-gray-500 uppercase text-[9px] mb-1">Sprites</div>
                                                <div className="text-yellow-400 font-bold text-sm">{changeStats.sprites}</div>
                                            </div>
                                        </div>
                                        <p className="text-[9px] text-gray-500 mt-2 italic">
                                            Green boxes = modified tiles • Yellow boxes = modified sprites
                                        </p>
                                    </div>
                                )}

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
                <div className="bg-[#111] p-2 border-t border-gray-800 flex justify-between text-[10px] text-gray-500 font-mono flex-shrink-0">
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
