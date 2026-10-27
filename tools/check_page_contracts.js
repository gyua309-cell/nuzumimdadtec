const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, '..', 'apps', 'web', 'src', 'pages');
const { getDemoFallback } = require('../apps/web/src/lib/demo-fallback.ts');

const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.tsx'));
const problems = [];

for (const f of files) {
  const content = fs.readFileSync(path.join(pagesDir, f), 'utf8');
  // Find all api.get calls
  const matches = content.matchAll(/api\.get(?:<([^>]+)>)?\(\s*[`'"](\/[^`'"?]+)/g);
  for (const m of matches) {
    const type = m[1];
    const ep = m[2];
    try {
      const res = getDemoFallback(ep);
      if (res === undefined) {
        problems.push({ file: f, ep, issue: 'Returns undefined' });
      } else if (type && type.includes('[]') && !Array.isArray(res) && !Array.isArray(res.data)) {
        problems.push({ file: f, ep, type, issue: 'Expected array but got ' + typeof res });
      }
    } catch (err) {
      problems.push({ file: f, ep, issue: err.message });
    }
  }
}

console.log('Found ' + problems.length + ' potential type/array issues:');
problems.forEach(p => console.log(`${p.file} -> ${p.ep}: ${p.issue}`));
