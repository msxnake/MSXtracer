/**
 * ROM Exporter Service
 * Generates MSX ROM files from assembled code in memory map
 */

export interface ROMExportOptions {
    startAddress?: number;
    endAddress?: number;
    fillByte?: number;
}

/**
 * Export memory map to MSX ROM binary
 */
export const exportToROM = (
    memoryMap: { [address: number]: number },
    options: ROMExportOptions = {}
): Uint8Array => {
    const { fillByte = 0xFF } = options;

    // Get all addresses with data
    const addresses = Object.keys(memoryMap)
        .map(Number)
        .filter(addr => memoryMap[addr] !== undefined)
        .sort((a, b) => a - b);

    if (addresses.length === 0) {
        throw new Error('No data in memory map to export');
    }

    // Determine ROM range
    const start = options.startAddress ?? addresses[0];
    const end = options.endAddress ?? addresses[addresses.length - 1];

    if (start > end) {
        throw new Error('Invalid address range: start > end');
    }

    // Create ROM buffer
    const size = end - start + 1;
    const rom = new Uint8Array(size);

    // Fill with default byte (typically 0xFF for ROM)
    rom.fill(fillByte);

    // Copy data from memory map
    for (let addr = start; addr <= end; addr++) {
        if (memoryMap[addr] !== undefined) {
            rom[addr - start] = memoryMap[addr] & 0xFF;
        }
    }

    return rom;
};

/**
 * Download ROM file to user's computer
 */
export const downloadROM = (
    romData: Uint8Array,
    filename: string = 'output.rom'
): void => {
    // Create blob from ROM data
    const blob = new Blob([romData as BlobPart], { type: 'application/octet-stream' });

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;

    // Trigger download
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

/**
 * Get ROM size info from memory map
 */
export const getROMInfo = (memoryMap: { [address: number]: number }): {
    startAddress: number;
    endAddress: number;
    size: number;
    usedBytes: number;
} => {
    const addresses = Object.keys(memoryMap)
        .map(Number)
        .filter(addr => memoryMap[addr] !== undefined)
        .sort((a, b) => a - b);

    if (addresses.length === 0) {
        return { startAddress: 0, endAddress: 0, size: 0, usedBytes: 0 };
    }

    const startAddress = addresses[0];
    const endAddress = addresses[addresses.length - 1];
    const size = endAddress - startAddress + 1;
    const usedBytes = addresses.length;

    return { startAddress, endAddress, size, usedBytes };
};
