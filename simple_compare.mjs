import fs from 'fs';

const glassRom = fs.readFileSync('unitedFiles_glass.rom');
const customRom = fs.readFileSync('unitedFiles(35).rom');

console.log('ROM COMPARISON');
console.log('==============');
console.log('Glass ROM:  ' + glassRom.length + ' bytes');
console.log('Custom ROM: ' + customRom.length + ' bytes');
console.log('Diff:       ' + (glassRom.length - customRom.length) + ' bytes');
console.log('Coverage:   ' + ((customRom.length / glassRom.length) * 100).toFixed(1) + '%');
console.log('');

let diffs = 0;
let firstDiff = -1;
const minLen = Math.min(glassRom.length, customRom.length);

for (let i = 0; i < minLen; i++) {
    if (glassRom[i] !== customRom[i]) {
        diffs++;
        if (firstDiff === -1) firstDiff = i;
    }
}

console.log('Bytes match: ' + (minLen - diffs) + ' / ' + minLen);
console.log('Differences: ' + diffs + ' (' + ((diffs / minLen) * 100).toFixed(2) + '%)');
console.log('Accuracy:    ' + ((1 - diffs / minLen) * 100).toFixed(2) + '%');
console.log('First diff:  offset ' + firstDiff + ' ($' + (0x4000 + firstDiff).toString(16).toUpperCase() + ')');
console.log('');

// First 10 differences
console.log('FIRST 10 DIFFERENCES:');
let shown = 0;
for (let i = 0; i < minLen && shown < 10; i++) {
    if (glassRom[i] !== customRom[i]) {
        const addr = 0x4000 + i;
        console.log('  $' + addr.toString(16).toUpperCase() + ': Glass=' +
            glassRom[i].toString(16).toUpperCase().padStart(2, '0') + ' Custom=' +
            customRom[i].toString(16).toUpperCase().padStart(2, '0'));
        shown++;
    }
}
