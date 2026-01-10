import React from 'react';
import { TimingState, MSXTimingConfig } from '../types';
import { formatTiming, formatCycles, calculateFPS } from '../services/timingService';
import { Clock, Zap, Film, Activity } from 'lucide-react';

interface TimingPanelProps {
    timingState: TimingState;
    timingConfig: MSXTimingConfig;
    onClose: () => void;
}

export const TimingPanel: React.FC<TimingPanelProps> = ({ timingState, timingConfig, onClose }) => {
    const frameProgress = (timingState.cyclesSinceVBlank / timingConfig.cyclesPerFrame) * 100;
    const estimatedFPS = calculateFPS(timingState.frameCount, timingState.totalCycles, timingConfig);

    return (
        <div className="timing-panel fixed top-20 right-4 bg-gray-800 text-white p-4 rounded-lg shadow-lg w-80 z-50">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Timing Information
                </h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white">
                    ✕
                </button>
            </div>

            <div className="space-y-3">
                {/* Configuration */}
                <div className="stat-row flex justify-between items-center py-2 border-b border-gray-700">
                    <span className="text-gray-400 flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        Mode:
                    </span>
                    <span className="font-mono font-bold text-blue-400">{timingConfig.name}</span>
                </div>

                {/* Total T-States */}
                <div className="stat-row flex justify-between items-center py-2 border-b border-gray-700">
                    <span className="text-gray-400 flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        Total T-States:
                    </span>
                    <span className="font-mono font-bold text-green-400">{formatCycles(timingState.totalCycles)}</span>
                </div>

                {/* Real Time */}
                <div className="stat-row flex justify-between items-center py-2 border-b border-gray-700">
                    <span className="text-gray-400">Real Time:</span>
                    <span className="font-mono font-bold text-yellow-400">{formatTiming(timingState.totalCycles, timingConfig)}</span>
                </div>

                {/* VBLANK Frames */}
                <div className="stat-row flex justify-between items-center py-2 border-b border-gray-700">
                    <span className="text-gray-400 flex items-center gap-2">
                        <Film className="w-4 h-4" />
                        VBLANK Frames:
                    </span>
                    <span className="font-mono font-bold text-purple-400">{timingState.frameCount}</span>
                </div>

                {/* Current Frame Progress */}
                <div className="stat-row py-2 border-b border-gray-700">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-400 text-sm">Frame Progress:</span>
                        <span className="font-mono text-xs text-gray-500">
                            {formatCycles(timingState.cyclesSinceVBlank)} / {formatCycles(timingConfig.cyclesPerFrame)}
                        </span>
                    </div>
                    <div className="progress-bar w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className="progress-fill h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-150"
                            style={{ width: `${Math.min(frameProgress, 100)}%` }}
                        />
                    </div>
                    <div className="text-xs text-gray-500 text-right mt-1">{frameProgress.toFixed(1)}%</div>
                </div>

                {/* Last Instruction */}
                <div className="stat-row flex justify-between items-center py-2 border-b border-gray-700">
                    <span className="text-gray-400">Last Instruction:</span>
                    <span className="font-mono font-bold text-cyan-400">{timingState.lastInstructionCycles} T</span>
                </div>

                {/* Interrupt Status */}
                {timingState.interruptPending && (
                    <div className="stat-row flex justify-between items-center py-2 bg-red-900/30 border border-red-700 rounded px-2">
                        <span className="text-red-400 font-bold">⚠ Interrupt Pending</span>
                    </div>
                )}

                {/* Estimated FPS */}
                {timingState.totalCycles > 0 && (
                    <div className="stat-row flex justify-between items-center py-2">
                        <span className="text-gray-400 text-sm">Estimated FPS:</span>
                        <span className="font-mono text-sm text-gray-300">{estimatedFPS.toFixed(2)}</span>
                    </div>
                )}
            </div>

            {/* Info Footer */}
            <div className="mt-4 pt-3 border-t border-gray-700 text-xs text-gray-500">
                <p>CPU: {(timingConfig.cpuFrequency / 1_000_000).toFixed(2)} MHz</p>
                <p>VBLANK: {timingConfig.vblankFrequency} Hz ({(1000 / timingConfig.vblankFrequency).toFixed(2)} ms/frame)</p>
            </div>
        </div>
    );
};
