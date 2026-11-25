const fs = require('fs');
const path = require('path');

function walk(dir) {
  let files = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (item === 'route.ts') {
      files.push(full);
    }
  }
  return files;
}

const apiDir = path.join(__dirname, '..', 'src', 'app', 'api');
const routes = walk(apiDir);
let count = 0;

for (const file of routes) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('export const dynamic')) {
    content = "export const dynamic = 'force-dynamic';\n" + content;
    fs.writeFileSync(file, content, 'utf8');
    count++;
    console.log('Added force-dynamic to:', path.relative(process.cwd(), file));
  }
}

console.log(`Total API routes updated: ${count} of ${routes.length}`);
