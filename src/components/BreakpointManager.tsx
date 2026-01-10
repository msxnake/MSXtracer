
import React, { useState } from 'react';
import { X, Plus, Trash2, Power, PowerOff, Target, Eye, Cpu, HardDrive } from 'lucide-react';
import {
    ConditionalBreakpoint,
    MemoryWatchpoint,
    RegisterWatchpoint,
    AccessBreakpoint,
    BreakpointCondition,
    ComparisonOperator,
    Z80Registers
} from '../types';
import { parseConditionString, validateConditionString, formatCondition } from '../services/conditionEvaluator';

interface BreakpointManagerProps {
    conditionalBreakpoints: ConditionalBreakpoint[];
    memoryWatchpoints: MemoryWatchpoint[];
    registerWatchpoints: RegisterWatchpoint[];
    accessBreakpoints: AccessBreakpoint[];
    onUpdateConditional: (breakpoints: ConditionalBreakpoint[]) => void;
    onUpdateMemory: (watchpoints: MemoryWatchpoint[]) => void;
    onUpdateRegister: (watchpoints: RegisterWatchpoint[]) => void;
    onUpdateAccess: (breakpoints: AccessBreakpoint[]) => void;
    onClose: () => void;
}

type TabType = 'conditional' | 'memory' | 'register' | 'access';

const COMPARISON_OPERATORS: ComparisonOperator[] = ['==', '!=', '>', '<', '>=', '<='];
const REGISTER_NAMES: (keyof Z80Registers)[] = ['a', 'b', 'c', 'd', 'e', 'h', 'l', 'ix', 'iy', 'sp', 'pc'];

export const BreakpointManager: React.FC<BreakpointManagerProps> = ({
    conditionalBreakpoints,
    memoryWatchpoints,
    registerWatchpoints,
    accessBreakpoints,
    onUpdateConditional,
    onUpdateMemory,
    onUpdateRegister,
    onUpdateAccess,
    onClose
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('conditional');
    const [editingId, setEditingId] = useState<string | null>(null);

    // Conditional breakpoint state
    const [newCBLine, setNewCBLine] = useState<string>('');
    const [newCBExpr, setNewCBExpr] = useState<string>('A == 0xFF');
    const [newCBDesc, setNewCBDesc] = useState<string>('');

    // Memory watchpoint state
    const [newMWAddr, setNewMWAddr] = useState<string>('0xC000');
    const [newMWType, setNewMWType] = useState<'read' | 'write' | 'both'>('write');
    const [newMWDesc, setNewMWDesc] = useState<string>('');

    // Register watchpoint state
    const [newRWReg, setNewRWReg] = useState<keyof Z80Registers>('a');
    const [newRWExpr, setNewRWExpr] = useState<string>('A == 0');
    const [newRWDesc, setNewRWDesc] = useState<string>('');

    // Access breakpoint state
    const [newABAddr, setNewABAddr] = useState<string>('0xC000');
    const [newABType, setNewABType] = useState<'read' | 'write'>('write');
    const [newABDesc, setNewABDesc] = useState<string>('');

    const generateId = () => `bp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Conditional Breakpoint handlers
    const handleAddConditional = () => {
        const validation = validateConditionString(newCBExpr);
        if (!validation.valid) {
            alert(validation.error);
            return;
        }

        const lineNum = parseInt(newCBLine);
        if (isNaN(lineNum) || lineNum < 1) {
            alert('Please enter a valid line number');
            return;
        }

        const condition = parseConditionString(newCBExpr);
        if (!condition) return;

        const newBP: ConditionalBreakpoint = {
            id: generateId(),
            lineNumber: lineNum,
            condition,
            enabled: true,
            hitCount: 0,
            description: newCBDesc || `Line ${lineNum}: ${newCBExpr}`
        };

        onUpdateConditional([...conditionalBreakpoints, newBP]);
        setNewCBLine('');
        setNewCBExpr('A == 0xFF');
        setNewCBDesc('');
    };

    const handleDeleteConditional = (id: string) => {
        onUpdateConditional(conditionalBreakpoints.filter(bp => bp.id !== id));
    };

    const handleToggleConditional = (id: string) => {
        onUpdateConditional(
            conditionalBreakpoints.map(bp =>
                bp.id === id ? { ...bp, enabled: !bp.enabled } : bp
            )
        );
    };

    // Memory Watchpoint handlers
    const handleAddMemory = () => {
        if (!newMWAddr.trim()) {
            alert('Please enter a memory address or label');
            return;
        }

        const newWP: MemoryWatchpoint = {
            id: generateId(),
            addressOrLabel: newMWAddr,
            type: newMWType,
            enabled: true,
            hitCount: 0,
            description: newMWDesc || `${newMWType} @ ${newMWAddr}`
        };

        onUpdateMemory([...memoryWatchpoints, newWP]);
        setNewMWAddr('0xC000');
        setNewMWType('write');
        setNewMWDesc('');
    };

    const handleDeleteMemory = (id: string) => {
        onUpdateMemory(memoryWatchpoints.filter(wp => wp.id !== id));
    };

    const handleToggleMemory = (id: string) => {
        onUpdateMemory(
            memoryWatchpoints.map(wp =>
                wp.id === id ? { ...wp, enabled: !wp.enabled } : wp
            )
        );
    };

    // Register Watchpoint handlers
    const handleAddRegister = () => {
        const validation = validateConditionString(newRWExpr);
        if (!validation.valid) {
            alert(validation.error);
            return;
        }

        const condition = parseConditionString(newRWExpr);
        if (!condition) return;

        const newRW: RegisterWatchpoint = {
            id: generateId(),
            register: newRWReg,
            condition,
            enabled: true,
            hitCount: 0,
            description: newRWDesc || `${newRWReg.toUpperCase()}: ${newRWExpr}`
        };

        onUpdateRegister([...registerWatchpoints, newRW]);
        setNewRWReg('a');
        setNewRWExpr('A == 0');
        setNewRWDesc('');
    };

    const handleDeleteRegister = (id: string) => {
        onUpdateRegister(registerWatchpoints.filter(rw => rw.id !== id));
    };

    const handleToggleRegister = (id: string) => {
        onUpdateRegister(
            registerWatchpoints.map(rw =>
                rw.id === id ? { ...rw, enabled: !rw.enabled } : rw
            )
        );
    };

    // Access Breakpoint handlers
    const handleAddAccess = () => {
        if (!newABAddr.trim()) {
            alert('Please enter a memory address or label');
            return;
        }

        const newAB: AccessBreakpoint = {
            id: generateId(),
            addressOrLabel: newABAddr,
            accessType: newABType,
            enabled: true,
            hitCount: 0,
            description: newABDesc || `${newABType} @ ${newABAddr}`
        };

        onUpdateAccess([...accessBreakpoints, newAB]);
        setNewABAddr('0xC000');
        setNewABType('write');
        setNewABDesc('');
    };

    const handleDeleteAccess = (id: string) => {
        onUpdateAccess(accessBreakpoints.filter(ab => ab.id !== id));
    };

    const handleToggleAccess = (id: string) => {
        onUpdateAccess(
            accessBreakpoints.map(ab =>
                ab.id === id ? { ...ab, enabled: !ab.enabled } : ab
            )
        );
    };

    const totalCount = conditionalBreakpoints.length + memoryWatchpoints.length +
        registerWatchpoints.length + accessBreakpoints.length;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#111] border border-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                    <div className="flex items-center gap-3">
                        <Target size={20} className="text-red-500" />
                        <h2 className="text-lg font-bold text-white">Advanced Breakpoints & Watchpoints</h2>
                        <span className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-400">{totalCount} total</span>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-800 bg-[#0a0a0a]">
                    <button
                        onClick={() => setActiveTab('conditional')}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'conditional'
                                ? 'bg-blue-900/30 text-blue-400 border-b-2 border-blue-500'
                                : 'text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        <Target size={16} />
                        Conditional ({conditionalBreakpoints.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('memory')}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'memory'
                                ? 'bg-purple-900/30 text-purple-400 border-b-2 border-purple-500'
                                : 'text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        <Eye size={16} />
                        Memory ({memoryWatchpoints.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('register')}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'register'
                                ? 'bg-green-900/30 text-green-400 border-b-2 border-green-500'
                                : 'text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        <Cpu size={16} />
                        Register ({registerWatchpoints.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('access')}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'access'
                                ? 'bg-orange-900/30 text-orange-400 border-b-2 border-orange-500'
                                : 'text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        <HardDrive size={16} />
                        Access ({accessBreakpoints.length})
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {/* Conditional Breakpoints Tab */}
                    {activeTab === 'conditional' && (
                        <div className="space-y-4">
                            {/* Add New */}
                            <div className="bg-blue-900/10 border border-blue-900/30 rounded p-4">
                                <h3 className="text-sm font-bold text-blue-400 mb-3 flex items-center gap-2">
                                    <Plus size={16} /> Add Conditional Breakpoint
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Line Number</label>
                                        <input
                                            type="number"
                                            value={newCBLine}
                                            onChange={(e) => setNewCBLine(e.target.value)}
                                            className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-blue-500 outline-none"
                                            placeholder="42"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Condition Expression</label>
                                        <input
                                            type="text"
                                            value={newCBExpr}
                                            onChange={(e) => setNewCBExpr(e.target.value)}
                                            className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-white font-mono focus:border-blue-500 outline-none"
                                            placeholder="A == 0xFF"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-xs text-gray-500 block mb-1">Description (optional)</label>
                                        <input
                                            type="text"
                                            value={newCBDesc}
                                            onChange={(e) => setNewCBDesc(e.target.value)}
                                            className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-blue-500 outline-none"
                                            placeholder="When A reaches max value"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleAddConditional}
                                    className="mt-3 w-full bg-blue-700 hover:bg-blue-600 text-white py-2 rounded text-sm font-bold transition-colors"
                                >
                                    Add Breakpoint
                                </button>
                            </div>

                            {/* List */}
                            <div className="space-y-2">
                                {conditionalBreakpoints.length === 0 ? (
                                    <div className="text-center py-8 text-gray-600 text-sm">
                                        No conditional breakpoints yet. Add one above!
                                    </div>
                                ) : (
                                    conditionalBreakpoints.map((bp) => (
                                        <div
                                            key={bp.id}
                                            className={`bg-[#1a1a1a] border rounded p-3 ${bp.enabled ? 'border-blue-900/50' : 'border-gray-800'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs bg-blue-900/30 text-blue-400 px-1.5 py-0.5 rounded font-mono">
                                                            Line {bp.lineNumber}
                                                        </span>
                                                        <span className="text-xs font-mono text-gray-300">
                                                            {formatCondition(bp.condition)}
                                                        </span>
                                                        {bp.hitCount > 0 && (
                                                            <span className="text-xs bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded">
                                                                {bp.hitCount} hits
                                                            </span>
                                                        )}
                                                    </div>
                                                    {bp.description && (
                                                        <p className="text-xs text-gray-500">{bp.description}</p>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleToggleConditional(bp.id)}
                                                        className={`p-1 rounded transition-colors ${bp.enabled
                                                                ? 'text-green-500 hover:text-green-400'
                                                                : 'text-gray-600 hover:text-gray-400'
                                                            }`}
                                                        title={bp.enabled ? 'Disable' : 'Enable'}
                                                    >
                                                        {bp.enabled ? <Power size={16} /> : <PowerOff size={16} />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteConditional(bp.id)}
                                                        className="p-1 text-red-500 hover:text-red-400 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Memory Watchpoints Tab */}
                    {activeTab === 'memory' && (
                        <div className="space-y-4">
                            {/* Add New */}
                            <div className="bg-purple-900/10 border border-purple-900/30 rounded p-4">
                                <h3 className="text-sm font-bold text-purple-400 mb-3 flex items-center gap-2">
                                    <Plus size={16} /> Add Memory Watchpoint
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Address or Label</label>
                                        <input
                                            type="text"
                                            value={newMWAddr}
                                            onChange={(e) => setNewMWAddr(e.target.value)}
                                            className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-white font-mono focus:border-purple-500 outline-none"
                                            placeholder="0xC000 or PLAYER_POS"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Watch Type</label>
                                        <select
                                            value={newMWType}
                                            onChange={(e) => setNewMWType(e.target.value as 'read' | 'write' | 'both')}
                                            className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-purple-500 outline-none"
                                        >
                                            <option value="write">Write</option>
                                            <option value="read">Read</option>
                                            <option value="both">Read & Write</option>
                                        </select>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-xs text-gray-500 block mb-1">Description (optional)</label>
                                        <input
                                            type="text"
                                            value={newMWDesc}
                                            onChange={(e) => setNewMWDesc(e.target.value)}
                                            className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-purple-500 outline-none"
                                            placeholder="Player position variable"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleAddMemory}
                                    className="mt-3 w-full bg-purple-700 hover:bg-purple-600 text-white py-2 rounded text-sm font-bold transition-colors"
                                >
                                    Add Watchpoint
                                </button>
                            </div>

                            {/* List */}
                            <div className="space-y-2">
                                {memoryWatchpoints.length === 0 ? (
                                    <div className="text-center py-8 text-gray-600 text-sm">
                                        No memory watchpoints yet. Add one above!
                                    </div>
                                ) : (
                                    memoryWatchpoints.map((wp) => (
                                        <div
                                            key={wp.id}
                                            className={`bg-[#1a1a1a] border rounded p-3 ${wp.enabled ? 'border-purple-900/50' : 'border-gray-800'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs bg-purple-900/30 text-purple-400 px-1.5 py-0.5 rounded font-mono">
                                                            {wp.addressOrLabel}
                                                        </span>
                                                        <span className="text-xs text-gray-400">
                                                            {wp.type === 'both' ? 'Read & Write' : wp.type.charAt(0).toUpperCase() + wp.type.slice(1)}
                                                        </span>
                                                        {wp.hitCount > 0 && (
                                                            <span className="text-xs bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded">
                                                                {wp.hitCount} hits
                                                            </span>
                                                        )}
                                                    </div>
                                                    {wp.description && (
                                                        <p className="text-xs text-gray-500">{wp.description}</p>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleToggleMemory(wp.id)}
                                                        className={`p-1 rounded transition-colors ${wp.enabled
                                                                ? 'text-green-500 hover:text-green-400'
                                                                : 'text-gray-600 hover:text-gray-400'
                                                            }`}
                                                        title={wp.enabled ? 'Disable' : 'Enable'}
                                                    >
                                                        {wp.enabled ? <Power size={16} /> : <PowerOff size={16} />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteMemory(wp.id)}
                                                        className="p-1 text-red-500 hover:text-red-400 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Register Watchpoints Tab */}
                    {activeTab === 'register' && (
                        <div className="space-y-4">
                            {/* Add New */}
                            <div className="bg-green-900/10 border border-green-900/30 rounded p-4">
                                <h3 className="text-sm font-bold text-green-400 mb-3 flex items-center gap-2">
                                    <Plus size={16} /> Add Register Watchpoint
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Register</label>
                                        <select
                                            value={newRWReg}
                                            onChange={(e) => setNewRWReg(e.target.value as keyof Z80Registers)}
                                            className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-white font-mono focus:border-green-500 outline-none"
                                        >
                                            {REGISTER_NAMES.map(reg => (
                                                <option key={reg} value={reg}>{reg.toUpperCase()}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Condition</label>
                                        <input
                                            type="text"
                                            value={newRWExpr}
                                            onChange={(e) => setNewRWExpr(e.target.value)}
                                            className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-white font-mono focus:border-green-500 outline-none"
                                            placeholder="A == 0"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-xs text-gray-500 block mb-1">Description (optional)</label>
                                        <input
                                            type="text"
                                            value={newRWDesc}
                                            onChange={(e) => setNewRWDesc(e.target.value)}
                                            className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-green-500 outline-none"
                                            placeholder="Loop counter reached zero"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleAddRegister}
                                    className="mt-3 w-full bg-green-700 hover:bg-green-600 text-white py-2 rounded text-sm font-bold transition-colors"
                                >
                                    Add Watchpoint
                                </button>
                            </div>

                            {/* List */}
                            <div className="space-y-2">
                                {registerWatchpoints.length === 0 ? (
                                    <div className="text-center py-8 text-gray-600 text-sm">
                                        No register watchpoints yet. Add one above!
                                    </div>
                                ) : (
                                    registerWatchpoints.map((rw) => (
                                        <div
                                            key={rw.id}
                                            className={`bg-[#1a1a1a] border rounded p-3 ${rw.enabled ? 'border-green-900/50' : 'border-gray-800'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded font-mono">
                                                            {rw.register.toUpperCase()}
                                                        </span>
                                                        <span className="text-xs font-mono text-gray-300">
                                                            {formatCondition(rw.condition)}
                                                        </span>
                                                        {rw.hitCount > 0 && (
                                                            <span className="text-xs bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded">
                                                                {rw.hitCount} hits
                                                            </span>
                                                        )}
                                                    </div>
                                                    {rw.description && (
                                                        <p className="text-xs text-gray-500">{rw.description}</p>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleToggleRegister(rw.id)}
                                                        className={`p-1 rounded transition-colors ${rw.enabled
                                                                ? 'text-green-500 hover:text-green-400'
                                                                : 'text-gray-600 hover:text-gray-400'
                                                            }`}
                                                        title={rw.enabled ? 'Disable' : 'Enable'}
                                                    >
                                                        {rw.enabled ? <Power size={16} /> : <PowerOff size={16} />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteRegister(rw.id)}
                                                        className="p-1 text-red-500 hover:text-red-400 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Access Breakpoints Tab */}
                    {activeTab === 'access' && (
                        <div className="space-y-4">
                            {/* Add New */}
                            <div className="bg-orange-900/10 border border-orange-900/30 rounded p-4">
                                <h3 className="text-sm font-bold text-orange-400 mb-3 flex items-center gap-2">
                                    <Plus size={16} /> Add Access Breakpoint
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Address or Label</label>
                                        <input
                                            type="text"
                                            value={newABAddr}
                                            onChange={(e) => setNewABAddr(e.target.value)}
                                            className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-white font-mono focus:border-orange-500 outline-none"
                                            placeholder="0xC000 or VRAM_PTR"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Access Type</label>
                                        <select
                                            value={newABType}
                                            onChange={(e) => setNewABType(e.target.value as 'read' | 'write')}
                                            className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-orange-500 outline-none"
                                        >
                                            <option value="write">Write</option>
                                            <option value="read">Read</option>
                                        </select>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-xs text-gray-500 block mb-1">Description (optional)</label>
                                        <input
                                            type="text"
                                            value={newABDesc}
                                            onChange={(e) => setNewABDesc(e.target.value)}
                                            className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-orange-500 outline-none"
                                            placeholder="Critical memory write"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleAddAccess}
                                    className="mt-3 w-full bg-orange-700 hover:bg-orange-600 text-white py-2 rounded text-sm font-bold transition-colors"
                                >
                                    Add Breakpoint
                                </button>
                            </div>

                            {/* List */}
                            <div className="space-y-2">
                                {accessBreakpoints.length === 0 ? (
                                    <div className="text-center py-8 text-gray-600 text-sm">
                                        No access breakpoints yet. Add one above!
                                    </div>
                                ) : (
                                    accessBreakpoints.map((ab) => (
                                        <div
                                            key={ab.id}
                                            className={`bg-[#1a1a1a] border rounded p-3 ${ab.enabled ? 'border-orange-900/50' : 'border-gray-800'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs bg-orange-900/30 text-orange-400 px-1.5 py-0.5 rounded font-mono">
                                                            {ab.addressOrLabel}
                                                        </span>
                                                        <span className="text-xs text-gray-400">
                                                            {ab.accessType.charAt(0).toUpperCase() + ab.accessType.slice(1)}
                                                        </span>
                                                        {ab.hitCount > 0 && (
                                                            <span className="text-xs bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded">
                                                                {ab.hitCount} hits
                                                            </span>
                                                        )}
                                                    </div>
                                                    {ab.description && (
                                                        <p className="text-xs text-gray-500">{ab.description}</p>
                                                    )}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleToggleAccess(ab.id)}
                                                        className={`p-1 rounded transition-colors ${ab.enabled
                                                                ? 'text-green-500 hover:text-green-400'
                                                                : 'text-gray-600 hover:text-gray-400'
                                                            }`}
                                                        title={ab.enabled ? 'Disable' : 'Enable'}
                                                    >
                                                        {ab.enabled ? <Power size={16} /> : <PowerOff size={16} />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteAccess(ab.id)}
                                                        className="p-1 text-red-500 hover:text-red-400 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
