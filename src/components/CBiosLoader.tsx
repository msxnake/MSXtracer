import React, { useCallback } from 'react';
import { Upload, Cpu, CheckCircle, XCircle, Info } from 'lucide-react';
import { CBiosState } from '../services/cbiosService';

interface CBiosLoaderProps {
  cbiosState: CBiosState;
  onLoadRom: (file: File, type: 'main' | 'sub' | 'logo') => void;
  onVersionChange: (version: 'msx1' | 'msx2' | 'msx2+') => void;
  onClose: () => void;
}

export const CBiosLoader: React.FC<CBiosLoaderProps> = ({
  cbiosState,
  onLoadRom,
  onVersionChange,
  onClose
}) => {
  const handleDrop = useCallback((e: React.DragEvent, type: 'main' | 'sub' | 'logo') => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.rom') || file.name.endsWith('.ROM'))) {
      onLoadRom(file, type);
    }
  }, [onLoadRom]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>, type: 'main' | 'sub' | 'logo') => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadRom(file, type);
    }
  }, [onLoadRom]);

  const RomSlot: React.FC<{
    title: string;
    type: 'main' | 'sub' | 'logo';
    loaded: boolean;
    size: number;
    description: string;
    required?: boolean;
  }> = ({ title, type, loaded, size, description, required }) => (
    <div
      className={`border rounded-lg p-4 ${loaded ? 'border-green-500 bg-green-500/10' : 'border-gray-600 bg-gray-800/50'}`}
      onDrop={(e) => handleDrop(e, type)}
      onDragOver={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-white">{title}</span>
        {loaded ? (
          <CheckCircle className="w-5 h-5 text-green-500" />
        ) : (
          <XCircle className="w-5 h-5 text-gray-500" />
        )}
      </div>
      <p className="text-xs text-gray-400 mb-3">{description}</p>
      {loaded ? (
        <div className="text-sm text-green-400">
          Cargado: {(size / 1024).toFixed(1)} KB
        </div>
      ) : (
        <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-gray-600 rounded cursor-pointer hover:border-cyan-500 transition-colors">
          <Upload className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-400">
            {required ? 'Cargar ROM (requerido)' : 'Cargar ROM (opcional)'}
          </span>
          <input
            type="file"
            accept=".rom,.ROM"
            className="hidden"
            onChange={(e) => handleFileSelect(e, type)}
          />
        </label>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-[#1a1a2e] rounded-lg shadow-2xl w-full max-w-2xl mx-4 border border-cyan-500/30">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Cpu className="w-6 h-6 text-cyan-400" />
            <div>
              <h2 className="text-lg font-bold text-white">C-BIOS MSX</h2>
              <p className="text-xs text-gray-400">BIOS libre para MSX</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            x
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Info Box */}
          <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-300">
              <p className="mb-2">
                <strong>C-BIOS</strong> es una implementacion libre de la BIOS de MSX.
                Descargala desde{' '}
                <a
                  href="https://sourceforge.net/projects/cbios/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline"
                >
                  SourceForge
                </a>
                {' '}(cbios-0.29a.zip).
              </p>
              <p className="text-xs text-gray-400">
                Licencia: BSD 2-clause | Permite ejecutar ROMs sin BIOS propietaria
              </p>
            </div>
          </div>

          {/* Version Selector */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">Version MSX:</span>
            <div className="flex gap-2">
              {(['msx1', 'msx2', 'msx2+'] as const).map((ver) => (
                <button
                  key={ver}
                  onClick={() => onVersionChange(ver)}
                  className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                    cbiosState.version === ver
                      ? 'bg-cyan-500 text-black'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {ver.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* ROM Slots */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RomSlot
              title="Main BIOS ROM"
              type="main"
              loaded={cbiosState.mainRomSize > 0}
              size={cbiosState.mainRomSize}
              description={`cbios_main_${cbiosState.version}.rom (32KB)`}
              required
            />
            <RomSlot
              title="Sub ROM"
              type="sub"
              loaded={cbiosState.subRomSize > 0}
              size={cbiosState.subRomSize}
              description="cbios_sub.rom (16KB) - MSX2/2+"
            />
          </div>

          {/* Expected Files */}
          <div className="text-xs text-gray-500 bg-gray-800/50 rounded p-3">
            <p className="font-medium mb-1">Archivos esperados en cbios-0.29a.zip:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>cbios_main_msx2.rom - BIOS principal MSX2</li>
              <li>cbios_sub.rom - Sub ROM para MSX2</li>
              <li>cbios_logo_msx2.rom - Logo (opcional)</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t border-gray-700">
          <div className="text-sm">
            {cbiosState.loaded ? (
              <span className="text-green-400 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                C-BIOS cargado correctamente
              </span>
            ) : (
              <span className="text-yellow-400">
                Carga al menos la Main BIOS ROM
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-cyan-500 text-black rounded font-medium hover:bg-cyan-400 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
