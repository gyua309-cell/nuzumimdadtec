const fs = require('fs');
const path = require('path');

// 1. Get all endpoints extracted
const endpointsFile = path.join(__dirname, 'extract_endpoints.js');
// Let's re-run extract
const dir = path.join(__dirname, '..', 'apps', 'web', 'src');
const endpoints = new Set();

function scan(currentDir) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const ent of entries) {
    const fullPath = path.join(currentDir, ent.name);
    if (ent.isDirectory()) {
      scan(fullPath);
    } else if (ent.name.endsWith('.tsx') || ent.name.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const regex = /api\.(?:get|post|patch|del|put)(?:<[^>]+>)?\(\s*[`'"](\/[^`'"?#]+)/g;
      let m;
      while ((m = regex.exec(content)) !== null) {
        endpoints.add(m[1].split('?')[0]);
      }
      const crudRegex = /<CrudPage[^>]*path=["'](\/[^"']+)["']/g;
      while ((m = crudRegex.exec(content)) !== null) {
        endpoints.add(m[1]);
      }
    }
  }
}
scan(dir);

// 2. Test each endpoint against demo-fallback
// We can transpile or load demo-fallback
const { getDemoFallback } = require('../apps/web/src/lib/demo-fallback.ts');

const missingOrEmpty = [];
const working = [];

for (const ep of Array.from(endpoints).sort()) {
  try {
    const res = getDemoFallback(ep);
    if (!res || (Array.isArray(res) && res.length === 0) || (res.data && Array.isArray(res.data) && res.data.length === 0)) {
      missingOrEmpty.push({ endpoint: ep, result: res });
    } else {
      working.push({ endpoint: ep, type: Array.isArray(res) ? 'array' : typeof res });
    }
  } catch (err) {
    missingOrEmpty.push({ endpoint: ep, error: err.message });
  }
}

console.log('--- WORKING (' + working.length + ') ---');
working.slice(0, 10).forEach(w => console.log('  ' + w.endpoint + ' -> ' + w.type));
console.log('--- MISSING OR EMPTY (' + missingOrEmpty.length + ') ---');
missingOrEmpty.forEach(m => console.log('  ' + m.endpoint));
