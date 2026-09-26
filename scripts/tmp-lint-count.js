const fs = require('fs');
const lines = fs.readFileSync('/tmp/lintout.txt', 'utf8').split('\n');
let cur = '';
const counts = {};
for (const l of lines) {
  if (l.startsWith('C:\\')) {
    cur = l.trim();
    counts[cur] = 0;
  } else if (/^\s*\d+:\d+\s+(error|warning)/.test(l)) {
    counts[cur] = (counts[cur] || 0) + 1;
  }
}
for (const k in counts) console.log(counts[k], k);
