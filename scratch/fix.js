const fs = require('fs');

const path = 'c:\\Users\\tanis\\OneDrive\\Desktop\\VIT subjects\\SEM-4\\EDI\\SmartComparison-Tool\\extension\\content.js';
let content = fs.readFileSync(path, 'utf8');

// The python script injected literal backslashes before backticks and dollar signs inside the JS code.
// E.g. \`var(--scp-\${platInfo...
// We just need to replace \` with ` and \$ with $
// BUT only in the relevant block to avoid messing up anything else.
// Let's replace "\\`" with "`" and "\\$" with "$" globally since it's likely safe for this file, 
// or specifically the block between "// ── Inline Panel CSS ────────────────────────────────" and "// ── Main Flow ───────────────────────────────────────".

const startMarker = "// ── Inline Panel CSS ────────────────────────────────";
const endMarker = "// ── Main Flow ───────────────────────────────────────";

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx !== -1 && endIdx !== -1) {
    let block = content.substring(startIdx, endIdx);
    block = block.replace(/\\`/g, "`");
    block = block.replace(/\\\$/g, "$");
    
    content = content.substring(0, startIdx) + block + content.substring(endIdx);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Fixed backslashes in JS file');
} else {
    console.log('Markers not found');
}
