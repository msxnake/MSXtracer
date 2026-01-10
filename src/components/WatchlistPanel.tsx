
import React, { useState } from 'react';
import { X, Plus, Eye, EyeOff, Trash2, TrendingUp } from 'lucide-react';
import { WatchlistItem, WatchType, Z80Registers, Z80Flags } from '../types';

interface WatchlistPanelProps {
    watchlist: WatchlistItem[];
    liveRegisters: Z80Registers;
    liveFlags: Z80Flags;
    liveMemory: { [name: string]: number };
    symbolTable: { [label: string]: number };
    onAddWatch: (item: Omit<WatchlistItem, 'id' | 'previousValue' | 'currentValue'>) => void;
    onRemoveWatch: (id: string) => void;
    onToggleWatch: (id: string) => void;
    onClearAll: () => void;
    onClose: () => void;
}

export const WatchlistPanel: React.FC<WatchlistPanelProps> = ({
    watchlist,
    liveRegisters,
    liveFlags,
    liveMemory,
    symbolTable,
    onAddWatch,
    onRemoveWatch,
    onToggleWatch,
    onClearAll,
    onClose
}) => {
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newExpression, setNewExpression] = useState('');
    const [newType, setNewType] = useState<WatchType>('register');

    // Resolve watch value from expression
    const resolveValue = (item: WatchlistItem): number | null => {
        if (!item.enabled) return null;

        try {
            const expr = item.expression.toUpperCase().trim();

            switch (item.type) {
                case 'register': {
                    // Handle register pairs
                    if (expr === 'HL') return (liveRegisters.h << 8) | liveRegisters.l;
                    if (expr === 'BC') return (liveRegisters.b << 8) | liveRegisters.c;
                    if (expr === 'DE') return (liveRegisters.d << 8) | liveRegisters.e;
                    if (expr === 'AF') return (liveRegisters.a << 8) | liveRegisters.f;
                    if (expr === 'IX') return liveRegisters.ix;
                    if (expr === 'IY') return liveRegisters.iy;
                    if (expr === 'SP') return liveRegisters.sp;
                    if (expr === 'PC') return liveRegisters.pc;

                    // Single registers
                    const regKey = expr.toLowerCase() as keyof Z80Registers;
                    return liveRegisters[regKey] ?? null;
                }

                case 'flag': {
                    const flagKey = expr.toLowerCase() as keyof Z80Flags;
                    return liveFlags[flagKey] ? 1 : 0;
                }

                case 'memory': {
                    // Try as direct memory key
                    if (liveMemory[expr] !== undefined) return liveMemory[expr];

                    // Try symbol table
                    if (symbolTable[expr] !== undefined) {
                        const addr = symbolTable[expr];
                        return liveMemory[`STACK:${addr}`] ?? liveMemory[addr] ?? null;
                    }

                    // Try parsing as hex address
                    let addr: number | null = null;
                    if (expr.startsWith('0X')) {
                        addr = parseInt(expr.substring(2), 16);
                    } else if (expr.startsWith('$')) {
                        addr = parseInt(expr.substring(1), 16);
                    } else if (expr.endsWith('H')) {
                        addr = parseInt(expr.substring(0, expr.length - 1), 16);
                    } else if (!isNaN(Number(expr))) {
                        addr = Number(expr);
                    }

                    if (addr !== null) {
                        return liveMemory[`STACK:${addr}`] ?? liveMemory[addr] ?? null;
                    }
                    return null;
                }

                default:
                    return null;
            }
        } catch {
            return null;
        }
    };

    const handleAddWatch = () => {
        if (!newName.trim() || !newExpression.trim()) return;

        onAddWatch({
            name: newName.trim(),
            expression: newExpression.trim(),
            type: newType,
            enabled: true
        });

        setNewName('');
        setNewExpression('');
        setShowAddForm(false);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
            <div className="bg-[#0d0d0d] border border-gray-800 rounded-lg shadow-2xl w-[500px] max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="bg-[#1a1a1a] px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Eye size={18} className="text-cyan-400" />
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Watchlist</h2>
                        <span className="text-xs text-gray-500 bg-gray-900 px-2 py-0.5 rounded">
                            {watchlist.filter(w => w.enabled).length} active
                        </span>
                    </div>
                    <div className="flex gap-2">
                        {watchlist.length > 0 && (
                            <button
                                onClick={onClearAll}
                                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 hover:bg-red-900/20 rounded"
                                title="Clear All"
                            >
                                Clear All
                            </button>
                        )}
                        <button onClick={onClose} className="text-gray-400 hover:text-white">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Watchlist Items */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                    {watchlist.length === 0 ? (
                        <div className="text-center py-12 text-gray-600">
                            <Eye size={48} className="mx-auto mb-3 opacity-20" />
                            <p className="text-sm">No watches added yet</p>
                            <p className="text-xs mt-1">Click "Add Watch" to monitor values</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {watchlist.map(item => {
                                const currentValue = resolveValue(item);
                                const hasChanged = item.previousValue !== undefined &&
                                    currentValue !== null &&
                                    item.previousValue !== currentValue;

                                return (
                                    <div
                                        key={item.id}
                                        className={`bg-[#0a0a0a] border rounded p-3 transition-all ${hasChanged ? 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]' : 'border-gray-800'
                                            } ${!item.enabled ? 'opacity-50' : ''}`}
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => onToggleWatch(item.id)}
                                                        className="text-gray-500 hover:text-white"
                                                        title={item.enabled ? "Disable" : "Enable"}
                                                    >
                                                        {item.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                                                    </button>
                                                    <span className="text-sm font-bold text-white">{item.name}</span>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.type === 'register' ? 'bg-blue-900/30 text-blue-400' :
                                                            item.type === 'memory' ? 'bg-purple-900/30 text-purple-400' :
                                                                'bg-green-900/30 text-green-400'
                                                        }`}>
                                                        {item.type.toUpperCase()}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-500 font-mono mt-1 ml-6">
                                                    {item.expression}
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => onRemoveWatch(item.id)}
                                                className="text-gray-600 hover:text-red-500 ml-2"
                                                title="Remove"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>

                                        {item.enabled && (
                                            <div className="ml-6 mt-2 flex items-center gap-3">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-xs text-gray-500">Value:</span>
                                                    <span className={`text-lg font-mono font-bold ${hasChanged ? 'text-red-400' : 'text-cyan-400'
                                                        }`}>
                                                        {currentValue !== null ? (
                                                            <>
                                                                0x{currentValue.toString(16).toUpperCase().padStart(item.type === 'flag' ? 1 : 2, '0')}
                                                                <span className="text-xs text-gray-600 ml-2">({currentValue})</span>
                                                            </>
                                                        ) : (
                                                            <span className="text-gray-600">--</span>
                                                        )}
                                                    </span>
                                                </div>

                                                {hasChanged && item.previousValue !== undefined && (
                                                    <div className="flex items-center gap-1 text-xs text-orange-400">
                                                        <TrendingUp size={12} />
                                                        <span>was: 0x{item.previousValue.toString(16).toUpperCase().padStart(2, '0')}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Add Watch Form */}
                {showAddForm ? (
                    <div className="border-t border-gray-800 p-4 bg-[#0a0a0a]">
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Name</label>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="e.g., Player X Position"
                                    className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-cyan-500 outline-none"
                                    autoFocus
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Type</label>
                                    <select
                                        value={newType}
                                        onChange={(e) => setNewType(e.target.value as WatchType)}
                                        className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-cyan-500 outline-none"
                                    >
                                        <option value="register">Register</option>
                                        <option value="memory">Memory</option>
                                        <option value="flag">Flag</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Expression</label>
                                    <input
                                        type="text"
                                        value={newExpression}
                                        onChange={(e) => setNewExpression(e.target.value)}
                                        placeholder={
                                            newType === 'register' ? 'A, HL, IX...' :
                                                newType === 'memory' ? '0xC000, LABEL...' :
                                                    'Z, C, S...'
                                        }
                                        className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-white font-mono focus:border-cyan-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={handleAddWatch}
                                    className="flex-1 bg-cyan-700 hover:bg-cyan-600 text-white py-2 rounded text-xs font-bold"
                                >
                                    Add Watch
                                </button>
                                <button
                                    onClick={() => {
                                        setShowAddForm(false);
                                        setNewName('');
                                        setNewExpression('');
                                    }}
                                    className="px-4 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded text-xs"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="border-t border-gray-800 p-3">
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="w-full bg-cyan-900/30 hover:bg-cyan-800/50 border border-cyan-700 text-cyan-400 py-2 rounded flex items-center justify-center gap-2 text-sm font-bold transition-colors"
                        >
                            <Plus size={16} />
                            Add Watch
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
