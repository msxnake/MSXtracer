const fs = require('fs');
const path = require('path');

// Read both ROM files
const glassRom = fs.readFileSync(path.join(__dirname, 'unitedFiles_glass.rom'));
const customRom = fs.readFileSync(path.join(__dirname, 'unitedFiles(35).rom'));

console.log(`Glass ROM size: ${glassRom.length} bytes`);
console.log(`Custom ROM size: ${customRom.length} bytes`);
console.log('');

// Compare byte by byte
let differences = 0;
const maxLen = Math.max(glassRom.length, customRom.length);
const diffPositions = [];

for (let i = 0; i < maxLen; i++) {
    const glassByte = i < glassRom.length ? glassRom[i] : undefined;
    const customByte = i < customRom.length ? customRom[i] : undefined;

    if (glassByte !== customByte) {
        differences++;
        if (diffPositions.length < 50) { // Show first 50 differences
            diffPositions.push({
                offset: i,
                address: 0x4000 + i,
                glass: glassByte !== undefined ? glassByte.toString(16).padStart(2, '0').toUpperCase() : 'MISSING',
                custom: customByte !== undefined ? customByte.toString(16).padStart(2, '0').toUpperCase() : 'MISSING'
            });
        }
    }
}

console.log(`Total differences: ${differences} bytes`);
console.log(`Match percentage: ${((1 - differences / maxLen) * 100).toFixed(2)}%`);
console.log('');

if (diffPositions.length > 0) {
    console.log('First differences:');
    console.log('Offset  | Address | Glass | Custom');
    console.log('--------|---------|-------|-------');
    diffPositions.forEach(diff => {
        console.log(`${diff.offset.toString().padStart(6)} | $${diff.address.toString(16).toUpperCase().padStart(4, '0')}  |  ${diff.glass}   |  ${diff.custom}`);
    });
}

// Show first 64 bytes of each for comparison
console.log('\n\nFirst 64 bytes comparison:');
console.log('Glass ROM:');
let glassHex = '';
for (let i = 0; i < Math.min(64, glassRom.length); i++) {
    glassHex += glassRom[i].toString(16).padStart(2, '0').toUpperCase() + ' ';
    if ((i + 1) % 16 === 0) glassHex += '\n';
}
console.log(glassHex);

console.log('\nCustom ROM:');
let customHex = '';
for (let i = 0; i < Math.min(64, customRom.length); i++) {
    customHex += customRom[i].toString(16).padStart(2, '0').toUpperCase() + ' ';
    if ((i + 1) % 16 === 0) customHex += '\n';
}
console.log(customHex);
