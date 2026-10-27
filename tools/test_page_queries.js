const fs = require('fs');
const path = require('path');
const pagesDir = path.join(__dirname, '..', 'apps', 'web', 'src', 'pages');
const { getDemoFallback } = require('../apps/web/src/lib/demo-fallback.ts');

const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.tsx'));

console.log('Testing all pages against getDemoFallback...');

for (const file of files) {
  const content = fs.readFileSync(path.join(pagesDir, file), 'utf8');
  
  // Find all api.get calls
  const matches = [...content.matchAll(/api\.get(?:<([^>]+)>)?\(\s*[`'"](\/[^`'"?$\s]+)/g)];
  for (const m of matches) {
    const type = m[1] || '';
    const ep = m[2];
    const res = getDemoFallback(ep);
    
    // Check if undefined
    if (res === undefined) {
      console.log(`[UNDEFINED] ${file} -> ${ep}`);
    }
    
    // Check if array expected
    if (type.includes('[]')) {
      if (!Array.isArray(res) && !Array.isArray(res?.data)) {
        console.log(`[ARRAY_EXPECTED] ${file} -> ${ep} returned ${typeof res}`);
      }
    }
  }
}

console.log('Scan complete.');
