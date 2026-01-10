import fs from 'fs';
import path from 'path';

// Read both ROM files
const glassRom = fs.readFileSync('unitedFiles_glass.rom');
const customRom = fs.readFileSync('unitedFiles(35).rom');

console.log('='.repeat(80));
console.log('ROM COMPARISON: Glass vs Custom Z80 Assembler');
console.log('='.repeat(80));
console.log(`Glass ROM size:  ${glassRom.length.toString().padStart(6)} bytes`);
console.log(`Custom ROM size: ${customRom.length.toString().padStart(6)} bytes`);
console.log(`Size difference: ${(glassRom.length - customRom.length).toString().padStart(6)} bytes (${((customRom.length / glassRom.length) * 100).toFixed(1)}% coverage)`);
console.log('='.repeat(80));
console.log('');

// Compare byte by byte
let differences = 0;
let firstDiff = -1;
let lastMatch = -1;
const maxLen = Math.max(glassRom.length, customRom.length);
const minLen = Math.min(glassRom.length, customRom.length);

// Find first difference and count total
for (let i = 0; i < maxLen; i++) {
    const glassByte = i < glassRom.length ? glassRom[i] : undefined;
    const customByte = i < customRom.length ? customRom[i] : undefined;

    if (glassByte !== customByte) {
        differences++;
        if (firstDiff === -1) firstDiff = i;
    } else if (i < minLen) {
        lastMatch = i;
    }
}

console.log(`Total bytes matching: ${minLen - differences} / ${minLen}`);
console.log(`Total differences:    ${differences} bytes`);
console.log(`Match accuracy:       ${((1 - differences / minLen) * 100).toFixed(2)}%`);
console.log(`First difference at:  $${(0x4000 + firstDiff).toString(16).toUpperCase()} (offset ${firstDiff})`);
console.log(`Last match at:        $${(0x4000 + lastMatch).toString(16).toUpperCase()} (offset ${lastMatch})`);
console.log('');

// Show first 32 differences in detail
console.log('='.repeat(80));
console.log('FIRST 32 DIFFERENCES (showing context):');
console.log('='.repeat(80));

let diffsShown = 0;
let inDiffBlock = false;
let blockStart = -1;

for (let i = 0; i < maxLen && diffsShown < 32; i++) {
    const glassByte = i < glassRom.length ? glassRom[i] : undefined;
    const customByte = i < customRom.length ? customRom[i] : undefined;

    if (glassByte !== customByte) {
        if (!inDiffBlock) {
            blockStart = i;
            inDiffBlock = true;

            // Show 4 bytes before for context
            const contextStart = Math.max(0, i - 4);
            if (contextStart < i) {
                console.log(`\nContext before ($${(0x4000 + contextStart).toString(16).toUpperCase()}):`);
                let contextLine = '';
                for (let j = contextStart; j < i; j++) {
                    contextLine += glassRom[j].toString(16).padStart(2, '0').toUpperCase() + ' ';
                }
                console.log(`  ${contextLine}`);
            }
        }

        const addr = 0x4000 + i;
        const glassStr = glassByte !== undefined ? glassByte.toString(16).padStart(2, '0').toUpperCase() : '--';
        const customStr = customByte !== undefined ? customByte.toString(16).padStart(2, '0').toUpperCase() : '--';

        console.log(`  $${addr.toString(16).toUpperCase().padStart(4, '0')} | Glass: ${glassStr} | Custom: ${customStr} | ← DIFF`);
        diffsShown++;
    } else if (inDiffBlock) {
        // Show 2 bytes after for context
        const contextEnd = Math.min(maxLen, i + 2);
        console.log(`Context after ($${(0x4000 + i).toString(16).toUpperCase()}):`);
        let contextLine = '';
        for (let j = i; j < contextEnd && j < maxLen; j++) {
            if (j < glassRom.length) {
                contextLine += glassRom[j].toString(16).padStart(2, '0').toUpperCase() + ' ';
            }
        }
        console.log(`  ${contextLine}`);

        inDiffBlock = false;
        blockStart = -1;
    }
}

// Show hex dumps side by side for first 128 bytes
console.log('');
console.log('='.repeat(80));
console.log('HEX DUMP COMPARISON (First 128 bytes):');
console.log('='.repeat(80));
console.log('Address  | Glass ROM (16 bytes)                      | Custom ROM (16 bytes)');
console.log('---------+-------------------------------------------+------------------------------------------');

for (let i = 0; i < 128; i += 16) {
    const addr = 0x4000 + i;
    let glassLine = '';
    let customLine = '';

    for (let j = 0; j < 16; j++) {
        const idx = i + j;
        if (idx < glassRom.length) {
            glassLine += glassRom[idx].toString(16).padStart(2, '0').toUpperCase() + ' ';
        } else {
            glassLine += '-- ';
        }

        if (idx < customRom.length) {
            customLine += customRom[idx].toString(16).padStart(2, '0').toUpperCase() + ' ';
        } else {
            customLine += '-- ';
        }
    }

    const marker = glassLine === customLine ? '  ' : '← DIFF';
    console.log(`$${addr.toString(16).toUpperCase().padStart(4, '0')}   | ${glassLine} | ${customLine} ${marker}`);
}

// Statistics by regions
console.log('');
console.log('='.repeat(80));
console.log('ANALYSIS BY MEMORY REGIONS:');
console.log('='.repeat(80));

const regions = [
    { name: 'Header (0x4000-0x400F)', start: 0, end: 16 },
    { name: 'Init Code (0x4010-0x40FF)', start: 16, end: 256 },
    { name: 'Main Code (0x4100-0x47FF)', start: 256, end: 2048 },
    { name: 'Extended (0x4800+)', start: 2048, end: Math.min(glassRom.length, customRom.length) }
];

regions.forEach(region => {
    let regionDiffs = 0;
    let regionBytes = Math.min(region.end, minLen) - region.start;

    for (let i = region.start; i < Math.min(region.end, minLen); i++) {
        if (glassRom[i] !== customRom[i]) regionDiffs++;
    }

    const accuracy = regionBytes > 0 ? ((1 - regionDiffs / regionBytes) * 100).toFixed(2) : 'N/A';
    console.log(`${region.name.padEnd(35)} | Match: ${(regionBytes - regionDiffs).toString().padStart(5)} / ${regionBytes.toString().padStart(5)} (${accuracy}%)`);
});

console.log('');
console.log('='.repeat(80));
console.log('COMPARISON COMPLETE');
console.log('='.repeat(80));
