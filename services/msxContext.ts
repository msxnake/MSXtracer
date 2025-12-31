
export interface MSXEntry {
  label: string;
  address: number; // Decimal address
  description: string;
  inputs?: string;
  outputs?: string;
  type: 'BIOS' | 'SYSVAR' | 'IO';
}

// Helper to convert hex string to number
const h = (hex: string) => parseInt(hex, 16);

export const MSX_KNOWLEDGE_BASE: { [address: number]: MSXEntry } = {
  // --- BIOS: RST Vectors ---
  0x0000: { label: 'RESET', address: 0, description: 'System Reset / Cold Start', type: 'BIOS' },
  0x0038: { label: 'KEYINT', address: 0x38, description: 'Timer Interrupt Handler (50/60Hz). Updates JIFFY, scans keyboard/sprites.', type: 'BIOS' },

  // --- BIOS: Slot / Inter-slot ---
  0x000C: { label: 'RDSLT', address: 0x000C, description: 'Read RAM in any slot', inputs: 'A=Data, HL=Addr, D=SlotID', type: 'BIOS' },
  0x0014: { label: 'WRSLT', address: 0x0014, description: 'Write to RAM in any slot', inputs: 'E=Data, HL=Addr, D=SlotID', type: 'BIOS' },
  0x001C: { label: 'CALSLT', address: 0x001C, description: 'Call routine in another slot', inputs: 'IY=Addr, IX=SlotID', type: 'BIOS' },
  0x0024: { label: 'ENASLT', address: 0x0024, description: 'Enable slot permanently', inputs: 'A=SlotID, HL=Addr', type: 'BIOS' },

  // --- BIOS: VDP / Screen ---
  0x0041: { label: 'CALLF', address: 0x0041, description: 'Call routine in current slot', type: 'BIOS' },
  0x0047: { label: 'WRTVDP', address: 0x0047, description: 'Write to VDP Register', inputs: 'B=Data, C=Register#', type: 'BIOS' },
  0x004A: { label: 'RDVRM', address: 0x004A, description: 'Read Byte from VRAM', inputs: 'HL=VRAM Addr', outputs: 'A=Data', type: 'BIOS' },
  0x004D: { label: 'WRTVRM', address: 0x004D, description: 'Write Byte to VRAM', inputs: 'HL=VRAM Addr, A=Data', type: 'BIOS' },
  0x005C: { label: 'LDIRVM', address: 0x005C, description: 'Block Transfer RAM -> VRAM', inputs: 'HL=RAM Src, DE=VRAM Dst, BC=Len', type: 'BIOS' },
  0x0059: { label: 'LDIRMV', address: 0x0059, description: 'Block Transfer VRAM -> RAM', inputs: 'HL=VRAM Src, DE=RAM Dst, BC=Len', type: 'BIOS' },
  0x005F: { label: 'CHGMOD', address: 0x005F, description: 'Switch Screen Mode', inputs: 'A = Screen Mode (0-3)', type: 'BIOS' },
  0x0062: { label: 'CHGCLR', address: 0x0062, description: 'Change Screen Colors', inputs: 'FORCLR, BAKCLR, BDRCLR', type: 'BIOS' },
  0x0069: { label: 'DISSCR', address: 0x0069, description: 'Disable Screen (Blank). Increases VDP access speed.', type: 'BIOS' },
  0x006C: { label: 'ENASCR', address: 0x006C, description: 'Enable Screen (Display On).', type: 'BIOS' },
  0x006F: { label: 'INIT32', address: 0x006F, description: 'Initialize Screen 1 (32x24 Text)', type: 'BIOS' },
  0x0072: { label: 'INITXT', address: 0x0072, description: 'Initialize Screen 0 (40x24 Text)', type: 'BIOS' },
  0x00C0: { label: 'TOTEXT', address: 0x00C0, description: 'Force Text Mode 1 (Screen 0)', type: 'BIOS' },
  
  // --- BIOS: Input / Keyboard ---
  0x009F: { label: 'CHGET', address: 0x009F, description: 'Wait and get character from keyboard buffer', outputs: 'A=Char', type: 'BIOS' },
  0x00A2: { label: 'CHPUT', address: 0x00A2, description: 'Output character to screen (Console)', inputs: 'A=Char', type: 'BIOS' },
  0x00D5: { label: 'GTSTCK', address: 0x00D5, description: 'Get Joystick Direction', inputs: 'A=Port(0=Space, 1=Port1, 2=Port2)', outputs: 'A=Dir(0-8)', type: 'BIOS' },
  0x00D8: { label: 'GTTRIG', address: 0x00D8, description: 'Get Trigger Status', inputs: 'A=Port(0=Space, 1=Port1...)', outputs: 'A=0(Press)/FF(Rel)', type: 'BIOS' },
  0x00DB: { label: 'GTPAD',  address: 0x00DB, description: 'Get Touchpad/Mouse Data', inputs: 'A=ID', outputs: 'A=Value', type: 'BIOS' },

  // --- BIOS: Sound (PSG) ---
  0x0090: { label: 'GICINI', address: 0x0090, description: 'Initialize PSG (Sound Chip)', type: 'BIOS' },
  0x0093: { label: 'WRTPSG', address: 0x0093, description: 'Write to PSG Register', inputs: 'A=Reg#, E=Data', type: 'BIOS' },
  0x0096: { label: 'RDPSG',  address: 0x0096, description: 'Read from PSG Register', inputs: 'A=Reg#', outputs: 'A=Data', type: 'BIOS' },

  // --- BIOS: Misc ---
  0x013E: { label: 'RND',    address: 0x013E, description: 'Generate Random Number', inputs: 'R# register', outputs: 'BC=Random', type: 'BIOS' },

  // --- SYSTEM VARIABLES (RAM: F380 - FFFF) ---
  0xF3E9: { label: 'BAKCLR', address: 0xF3E9, description: 'Background Color (Screen 0-3)', type: 'SYSVAR' },
  0xF3EA: { label: 'BDRCLR', address: 0xF3EA, description: 'Border Color', type: 'SYSVAR' },
  0xF3EB: { label: 'FORCLR', address: 0xF3EB, description: 'Foreground Color (Text)', type: 'SYSVAR' },
  
  0xF3DB: { label: 'CLIKSW', address: 0xF3DB, description: 'Key Click Switch (0=Off, 1=On)', type: 'SYSVAR' },
  0xF3DC: { label: 'CSRY',   address: 0xF3DC, description: 'Cursor Y Position', type: 'SYSVAR' },
  0xF3DD: { label: 'CSRX',   address: 0xF3DD, description: 'Cursor X Position', type: 'SYSVAR' },
  0xF3AE: { label: 'LINL40', address: 0xF3AE, description: 'Width of Screen 0 (Default 40)', type: 'SYSVAR' },
  0xF3AF: { label: 'LINL32', address: 0xF3AF, description: 'Width of Screen 1 (Default 32)', type: 'SYSVAR' },

  0xFC9E: { label: 'JIFFY',  address: 0xFC9E, description: 'Software Clock (Increments every 1/50 or 1/60 sec)', type: 'SYSVAR' },
  0xFCA0: { label: 'INTCNT', address: 0xFCA0, description: 'Interrupt Counter (for BASIC ON INTERVAL)', type: 'SYSVAR' },
  
  0xF398: { label: 'LINLEN', address: 0xF398, description: 'Current Line Length', type: 'SYSVAR' },
  0xF39A: { label: 'CRTCNT', address: 0xF39A, description: 'Rows on screen', type: 'SYSVAR' },
  
  // Hooks
  0xFD9A: { label: 'H_KEYI', address: 0xFD9A, description: 'Hook: Interrupt Handler', type: 'SYSVAR' },
  0xFD9F: { label: 'H_TIMI', address: 0xFD9F, description: 'Hook: Timer Interrupt (1/60s)', type: 'SYSVAR' },
};

/**
 * Tries to find MSX information based on an address number OR a label string.
 */
export const getMSXInfo = (query: string | number): MSXEntry | null => {
  let address: number | null = null;

  if (typeof query === 'number') {
    address = query;
  } else {
    // Try to parse hex
    const q = query.trim().toUpperCase();
    if (q.startsWith('$')) address = parseInt(q.substring(1), 16);
    else if (q.startsWith('#')) address = parseInt(q.substring(1), 16);
    else if (q.endsWith('H')) address = parseInt(q.substring(0, q.length - 1), 16);
    else {
      // Try finding by Label name in our DB (Reverse lookup)
      const entry = Object.values(MSX_KNOWLEDGE_BASE).find(e => e.label === q);
      if (entry) return entry;
    }
  }

  if (address !== null && MSX_KNOWLEDGE_BASE[address]) {
    return MSX_KNOWLEDGE_BASE[address];
  }

  return null;
};
