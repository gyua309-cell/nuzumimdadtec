const fs = require('fs');
const path = require('path');
const pagesDir = path.join(__dirname, '..', 'apps', 'web', 'src', 'pages');
const compDir = path.join(__dirname, '..', 'apps', 'web', 'src', 'components');
const { getDemoFallback } = require('../apps/web/src/lib/demo-fallback.ts');

function scanDir(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
  const allCalls = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    const matches = content.matchAll(/api\.get(?:<([^>]+)>)?\(\s*[`'"](\/[^`'"?$\s]+)/g);
    for (const m of matches) {
      allCalls.push({ file: f, type: m[1], ep: m[2] });
    }
  }
  return allCalls;
}

const allCalls = [...scanDir(pagesDir), ...scanDir(compDir)];
console.log('Total api.get endpoints found:', allCalls.length);

const unhandled = [];
const typeMismatches = [];

for (const c of allCalls) {
  let res;
  try {
    res = getDemoFallback(c.ep);
  } catch (err) {
    unhandled.push({ ...c, err: err.message });
    continue;
  }
  if (res === undefined) {
    unhandled.push(c);
  } else if (c.type) {
    // If expects array
    if (c.type.includes('[]') && !Array.isArray(res) && !Array.isArray(res.data)) {
      typeMismatches.push({ ...c, issue: 'Expected array but got ' + typeof res });
    }
  }
}

console.log('Unhandled endpoints (returns undefined):', unhandled.length);
unhandled.forEach(u => console.log('  UNHANDLED: ' + u.file + ' -> ' + u.ep));

console.log('Type mismatches:', typeMismatches.length);
typeMismatches.forEach(t => console.log('  MISMATCH: ' + t.file + ' -> ' + t.ep + ' (' + t.type + ')'));
