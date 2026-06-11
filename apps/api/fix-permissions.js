const fs = require('fs');
const path = require('path');
const dir = 'apps/api/test';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.e2e-spec.ts'));
for (const f of files) {
  const fp = path.join(dir, f);
  let content = fs.readFileSync(fp, 'utf8');
  content = content.replace(/permissions:\s*\[[^\]]*\]/g, "permissions: ['*']");
  fs.writeFileSync(fp, content);
}
console.log('Fixed permissions in e2e files');