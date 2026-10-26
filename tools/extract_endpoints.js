const fs = require('fs');
const path = require('path');

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
        endpoints.add(m[1]);
      }
      // Also look for path="/something" in CrudPage
      const crudRegex = /<CrudPage[^>]*path=["'](\/[^"']+)["']/g;
      while ((m = crudRegex.exec(content)) !== null) {
        endpoints.add(m[1]);
      }
    }
  }
}

scan(dir);
console.log('Found ' + endpoints.size + ' endpoints:');
console.log(Array.from(endpoints).sort());
