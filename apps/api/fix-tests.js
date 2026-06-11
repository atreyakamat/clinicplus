const fs = require('fs');
const path = require('path');
const dir = 'apps/api/test';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.e2e-spec.ts'));
files.forEach(f => {
  const fp = path.join(dir, f);
  let content = fs.readFileSync(fp, 'utf8');
  if (!content.includes('AllExceptionsFilter')) {
    content = content.replace(/import\s+.*?from\s+['"].*?app\.module['"];/g, match => match + "\nimport { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';");
    content = content.replace(/app\.useGlobalPipes\(.*?\);/, match => match + "\n    app.useGlobalFilters(new AllExceptionsFilter());");
    fs.writeFileSync(fp, content);
  }
});
console.log('Added filter to tests');