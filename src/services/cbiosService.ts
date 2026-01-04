/**
 * C-BIOS Service for MSXtracer
 *
 * C-BIOS is an open source BIOS for MSX computers.
 * Download from: https://sourceforge.net/projects/cbios/
 * License: 2-clause BSD
 *
 * This service handles loading and executing C-BIOS ROM routines.
 */

export interface CBiosConfig {
  mainRom: Uint8Array | null;      // Main BIOS ROM (32KB) - 0x0000-0x7FFF
  subRom: Uint8Array | null;       // Sub ROM (16KB) - MSX2 extended BIOS
  logoRom: Uint8Array | null;      // Logo ROM (optional)
  version: 'msx1' | 'msx2' | 'msx2+';
}

export interface CBiosState {
  loaded: boolean;
  version: string;
  mainRomSize: number;
  subRomSize: number;
}

// C-BIOS ROM storage
let cbiosConfig: CBiosConfig = {
  mainRom: null,
  subRom: null,
  logoRom: null,
  version: 'msx2'
};

/**
 * Load a ROM file from ArrayBuffer
 */
export const loadRomFromBuffer = (buffer: ArrayBuffer, type: 'main' | 'sub' | 'logo'): boolean => {
  try {
    const rom = new Uint8Array(buffer);

    switch (type) {
      case 'main':
        cbiosConfig.mainRom = rom;
        console.log(`C-BIOS Main ROM loaded: ${rom.length} bytes`);
        break;
      case 'sub':
        cbiosConfig.subRom = rom;
        console.log(`C-BIOS Sub ROM loaded: ${rom.length} bytes`);
        break;
      case 'logo':
        cbiosConfig.logoRom = rom;
        console.log(`C-BIOS Logo ROM loaded: ${rom.length} bytes`);
        break;
    }

    return true;
  } catch (error) {
    console.error(`Error loading ${type} ROM:`, error);
    return false;
  }
};

/**
 * Set C-BIOS version
 */
export const setCBiosVersion = (version: 'msx1' | 'msx2' | 'msx2+'): void => {
  cbiosConfig.version = version;
};

/**
 * Get current C-BIOS state
 */
export const getCBiosState = (): CBiosState => ({
  loaded: cbiosConfig.mainRom !== null,
  version: cbiosConfig.version,
  mainRomSize: cbiosConfig.mainRom?.length || 0,
  subRomSize: cbiosConfig.subRom?.length || 0
});

/**
 * Read a byte from C-BIOS ROM at given address
 */
export const readBiosRom = (address: number): number | null => {
  if (!cbiosConfig.mainRom) return null;

  // Main ROM is mapped at 0x0000-0x7FFF
  if (address >= 0 && address < cbiosConfig.mainRom.length) {
    return cbiosConfig.mainRom[address];
  }

  return null;
};

/**
 * Read a byte from Sub ROM (MSX2)
 */
export const readSubRom = (address: number): number | null => {
  if (!cbiosConfig.subRom) return null;

  if (address >= 0 && address < cbiosConfig.subRom.length) {
    return cbiosConfig.subRom[address];
  }

  return null;
};

/**
 * Read multiple bytes from BIOS ROM
 */
export const readBiosBytes = (startAddress: number, count: number): number[] => {
  const bytes: number[] = [];
  for (let i = 0; i < count; i++) {
    const byte = readBiosRom(startAddress + i);
    bytes.push(byte !== null ? byte : 0);
  }
  return bytes;
};

/**
 * Create a ROM reader function for the disassembler
 * This provides a function that can read bytes from BIOS ROM
 */
export const createBiosRomReader = (): ((address: number) => number) => {
  return (address: number): number => {
    const byte = readBiosRom(address);
    return byte !== null ? byte : 0;
  };
};

/**
 * Check if a BIOS routine is available and return its implementation info
 */
export const getBiosRoutineInfo = (address: number): { name: string; description: string } | null => {
  // Standard MSX BIOS entry points
  const biosRoutines: { [addr: number]: { name: string; description: string } } = {
    0x0000: { name: 'CHKRAM', description: 'Check RAM and set up slot configuration' },
    0x0004: { name: 'SYNCHR', description: 'Check character pointed by HL' },
    0x0008: { name: 'RDSLT', description: 'Read from slot' },
    0x000C: { name: 'CHRGTR', description: 'Get next character' },
    0x0010: { name: 'WRSLT', description: 'Write to slot' },
    0x0014: { name: 'OUTDO', description: 'Output to device' },
    0x0018: { name: 'CALSLT', description: 'Call slot routine' },
    0x001C: { name: 'DCOMPR', description: 'Compare HL and DE' },
    0x0020: { name: 'ENASLT', description: 'Enable slot' },
    0x0024: { name: 'GETYPR', description: 'Get FAC type' },
    0x0030: { name: 'CALLF', description: 'Call far routine' },
    0x0038: { name: 'KEYINT', description: 'Keyboard interrupt handler' },
    0x003B: { name: 'INITIO', description: 'Initialize I/O' },
    0x003E: { name: 'INIFNK', description: 'Initialize function keys' },
    0x0041: { name: 'DISSCR', description: 'Disable screen' },
    0x0044: { name: 'ENASCR', description: 'Enable screen' },
    0x0047: { name: 'WRTVDP', description: 'Write to VDP register' },
    0x004A: { name: 'RDVRM', description: 'Read VRAM' },
    0x004D: { name: 'WRTVRM', description: 'Write VRAM' },
    0x0050: { name: 'SETRD', description: 'Set VRAM read address' },
    0x0053: { name: 'SETWRT', description: 'Set VRAM write address' },
    0x0056: { name: 'FILVRM', description: 'Fill VRAM' },
    0x0059: { name: 'LDIRMV', description: 'Block transfer VRAM to RAM' },
    0x005C: { name: 'LDIRVM', description: 'Block transfer RAM to VRAM' },
    0x005F: { name: 'CHGMOD', description: 'Change screen mode' },
    0x0062: { name: 'CHGCLR', description: 'Change screen color' },
    0x0066: { name: 'NMI', description: 'Non-maskable interrupt handler' },
    0x0069: { name: 'CLRSPR', description: 'Clear sprites' },
    0x006C: { name: 'INITXT', description: 'Initialize text mode' },
    0x006F: { name: 'INIT32', description: 'Initialize graphics 1 mode' },
    0x0072: { name: 'INIGRP', description: 'Initialize graphics 2 mode' },
    0x0075: { name: 'INIMLT', description: 'Initialize multicolor mode' },
    0x0078: { name: 'SETTXT', description: 'Set text mode' },
    0x007B: { name: 'SETT32', description: 'Set graphics 1 mode' },
    0x007E: { name: 'SETGRP', description: 'Set graphics 2 mode' },
    0x0081: { name: 'SETMLT', description: 'Set multicolor mode' },
    0x0084: { name: 'CALPAT', description: 'Calculate pattern address' },
    0x0087: { name: 'CALATR', description: 'Calculate sprite attribute address' },
    0x008A: { name: 'GSPSIZ', description: 'Get sprite size' },
    0x008D: { name: 'GRPPRT', description: 'Print character in graphics mode' },
    0x0090: { name: 'GICINI', description: 'Initialize PSG' },
    0x0093: { name: 'WRTPSG', description: 'Write to PSG' },
    0x0096: { name: 'RDPSG', description: 'Read from PSG' },
    0x0099: { name: 'STRTMS', description: 'Start music' },
    0x009C: { name: 'CHSNS', description: 'Check keyboard buffer' },
    0x009F: { name: 'CHGET', description: 'Get character from keyboard' },
    0x00A2: { name: 'CHPUT', description: 'Output character to screen' },
    0x00A5: { name: 'LPTOUT', description: 'Output to printer' },
    0x00A8: { name: 'LPTSTT', description: 'Get printer status' },
    0x00AB: { name: 'CNVCHR', description: 'Convert character' },
    0x00AE: { name: 'PINLIN', description: 'Input line from console' },
    0x00B1: { name: 'INLIN', description: 'Input line' },
    0x00B4: { name: 'QINLIN', description: 'Input line with question mark' },
    0x00B7: { name: 'BREAKX', description: 'Check CTRL-STOP' },
    0x00C0: { name: 'BEEP', description: 'Generate beep sound' },
    0x00C3: { name: 'CLS', description: 'Clear screen' },
    0x00C6: { name: 'POSIT', description: 'Set cursor position' },
    0x00C9: { name: 'FNKSB', description: 'Check function key display' },
    0x00CC: { name: 'ERAFNK', description: 'Erase function keys' },
    0x00CF: { name: 'DSPFNK', description: 'Display function keys' },
    0x00D2: { name: 'TOTEXT', description: 'Force text mode' },
    0x00D5: { name: 'GTSTCK', description: 'Get joystick direction' },
    0x00D8: { name: 'GTTRIG', description: 'Get trigger status' },
    0x00DB: { name: 'GTPAD', description: 'Get touchpad status' },
    0x00DE: { name: 'GTPDL', description: 'Get paddle status' },
    0x00E1: { name: 'TAPION', description: 'Tape input on' },
    0x00E4: { name: 'TAPIN', description: 'Tape input' },
    0x00E7: { name: 'TAPIOF', description: 'Tape input off' },
    0x00EA: { name: 'TAPOON', description: 'Tape output on' },
    0x00ED: { name: 'TAPOUT', description: 'Tape output' },
    0x00F0: { name: 'TAPOOF', description: 'Tape output off' },
    0x00F3: { name: 'STMOTR', description: 'Set tape motor' },
    0x00F6: { name: 'LFTQ', description: 'Queue length' },
    0x00F9: { name: 'PUTQ', description: 'Put in queue' },
    0x00FC: { name: 'RIGHTC', description: 'Move cursor right' },
    0x00FF: { name: 'LEFTC', description: 'Move cursor left' },
    0x0102: { name: 'UPC', description: 'Move cursor up' },
    0x0105: { name: 'TUPC', description: 'Test and move cursor up' },
    0x0108: { name: 'DOWNC', description: 'Move cursor down' },
    0x010B: { name: 'TDOWNC', description: 'Test and move cursor down' },
    0x010E: { name: 'SCALXY', description: 'Scale XY coordinates' },
    0x0111: { name: 'MAPXYC', description: 'Map XY to cursor' },
    0x0114: { name: 'FETCHC', description: 'Fetch cursor' },
    0x0117: { name: 'STOREC', description: 'Store cursor' },
    0x011A: { name: 'SETATR', description: 'Set attribute' },
    0x011D: { name: 'READC', description: 'Read cursor character' },
    0x0120: { name: 'SETC', description: 'Set cursor character' },
    0x0123: { name: 'NSETCX', description: 'Set character multiple times' },
    0x0126: { name: 'GTASPC', description: 'Get aspect ratio' },
    0x0129: { name: 'PNTINI', description: 'Initialize paint' },
    0x012C: { name: 'SCANR', description: 'Scan right' },
    0x012F: { name: 'SCANL', description: 'Scan left' },
  };

  return biosRoutines[address] || null;
};

/**
 * Get disassembly from C-BIOS ROM at given address
 * Returns array of instruction strings
 */
export const disassembleBiosRoutine = (startAddr: number, maxBytes: number = 64): string[] => {
  if (!cbiosConfig.mainRom) return ['C-BIOS not loaded'];

  const result: string[] = [];
  let addr = startAddr;
  const endAddr = Math.min(startAddr + maxBytes, cbiosConfig.mainRom.length);

  while (addr < endAddr) {
    const byte = cbiosConfig.mainRom[addr];
    if (byte === undefined) break;

    // Simple disassembly (just show hex for now - full Z80 disassembler would be more complex)
    result.push(`${addr.toString(16).toUpperCase().padStart(4, '0')}: ${byte.toString(16).toUpperCase().padStart(2, '0')}`);

    // Check for RET instruction (0xC9)
    if (byte === 0xC9) break;

    addr++;
  }

  return result;
};

/**
 * Clear all loaded ROMs
 */
export const clearCBios = (): void => {
  cbiosConfig = {
    mainRom: null,
    subRom: null,
    logoRom: null,
    version: 'msx2'
  };
};

/**
 * Check if C-BIOS is loaded
 */
export const isCBiosLoaded = (): boolean => {
  return cbiosConfig.mainRom !== null;
};

/**
 * Load C-BIOS ROMs from public/roms folder automatically
 */
export const loadCBiosFromPublic = async (): Promise<boolean> => {
  try {
    const baseUrl = '/roms/';

    // Load Main BIOS
    const mainResponse = await fetch(`${baseUrl}cbios_main_msx2.rom`);
    if (mainResponse.ok) {
      const mainBuffer = await mainResponse.arrayBuffer();
      loadRomFromBuffer(mainBuffer, 'main');
    }

    // Load Sub ROM
    const subResponse = await fetch(`${baseUrl}cbios_sub.rom`);
    if (subResponse.ok) {
      const subBuffer = await subResponse.arrayBuffer();
      loadRomFromBuffer(subBuffer, 'sub');
    }

    // Load Logo ROM
    const logoResponse = await fetch(`${baseUrl}cbios_logo_msx2.rom`);
    if (logoResponse.ok) {
      const logoBuffer = await logoResponse.arrayBuffer();
      loadRomFromBuffer(logoBuffer, 'logo');
    }

    console.log('C-BIOS loaded from public/roms/', getCBiosState());
    return cbiosConfig.mainRom !== null;
  } catch (error) {
    console.error('Error loading C-BIOS from public:', error);
    return false;
  }
};

/**
 * Get raw ROM data for integration with simulator
 */
export const getRomData = (): { main: Uint8Array | null; sub: Uint8Array | null } => ({
  main: cbiosConfig.mainRom,
  sub: cbiosConfig.subRom
});

// MSX2 BIOS Sub-ROM entry points (additional routines not in MSX1)
export const MSX2_SUBROM_ENTRIES: { [addr: number]: { name: string; description: string } } = {
  0x0089: { name: 'NVBXLN', description: 'Draw box line' },
  0x008D: { name: 'NVBXFL', description: 'Draw filled box' },
  0x0091: { name: 'CHGMOD', description: 'Change screen mode (extended)' },
  0x0095: { name: 'INITXT', description: 'Initialize text mode' },
  0x0099: { name: 'INIT32', description: 'Initialize graphics 1' },
  0x009D: { name: 'INIGRP', description: 'Initialize graphics 2' },
  0x00A1: { name: 'INIMLT', description: 'Initialize multicolor' },
  0x00A5: { name: 'SETTXT', description: 'Set text mode' },
  0x00A9: { name: 'SETT32', description: 'Set graphics 1' },
  0x00AD: { name: 'SETGRP', description: 'Set graphics 2' },
  0x00B1: { name: 'SETMLT', description: 'Set multicolor' },
  0x00B5: { name: 'CLRSPR', description: 'Clear sprites' },
  0x00B9: { name: 'CALPAT', description: 'Calculate pattern address' },
  0x00BD: { name: 'CALATR', description: 'Calculate attribute address' },
  0x00C1: { name: 'GSPSIZ', description: 'Get sprite size' },
  0x00C5: { name: 'GETPAT', description: 'Get pattern' },
  0x00C9: { name: 'WRTVRM', description: 'Write VRAM' },
  0x00CD: { name: 'RDVRM', description: 'Read VRAM' },
  0x00D1: { name: 'CHGCLR', description: 'Change color' },
  0x00D5: { name: 'CLSSUB', description: 'Clear screen subroutine' },
  0x00D9: { name: 'DSPFNK', description: 'Display function keys' },
  0x00DD: { name: 'WRTVDP', description: 'Write VDP register' },
  0x00E1: { name: 'VDPSTA', description: 'Read VDP status' },
  0x00E5: { name: 'SETPAG', description: 'Set display page' },
  0x00E9: { name: 'INIPLT', description: 'Initialize palette' },
  0x00ED: { name: 'RSTPLT', description: 'Reset palette' },
  0x00F1: { name: 'GETPLT', description: 'Get palette' },
  0x00F5: { name: 'SETPLT', description: 'Set palette' },
  0x00F9: { name: 'BEEP', description: 'Beep sound' },
  0x00FD: { name: 'PROMPT', description: 'Display prompt' },
  0x0101: { name: 'NEWPAD', description: 'New touchpad handler' },
  0x0105: { name: 'CHGCPU', description: 'Change CPU mode (turbo)' },
  0x0109: { name: 'GETCPU', description: 'Get CPU mode' },
  0x010D: { name: 'PCMPLY', description: 'PCM play' },
  0x0111: { name: 'PCMREC', description: 'PCM record' },
};
