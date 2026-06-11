const fs = require('fs');
const path = require('path');
const dir = 'apps/api/test';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.e2e-spec.ts'));

for (const f of files) {
  const fp = path.join(dir, f);
  let content = fs.readFileSync(fp, 'utf8');

  // Replace afterAll block with a TRUNCATE CASCADE
  content = content.replace(/afterAll\(async\s*\(\)\s*=>\s*\{[\s\S]*?await\s+app\.close\(\);\s*\}\);/m, 
    `afterAll(async () => {
    try {
      const tablenames = await prisma.$queryRaw\`SELECT tablename FROM pg_tables WHERE schemaname='public'\`;
      const tables = tablenames.map(({ tablename }) => tablename).filter(name => name !== '_prisma_migrations').map(name => \`"public"."\${name}"\`).join(', ');
      if (tables.length > 0) {
        await prisma.$executeRawUnsafe(\`TRUNCATE TABLE \${tables} CASCADE;\`);
      }
    } catch (e) { console.error(e); }
    await app.close();
  });`);

  fs.writeFileSync(fp, content);
}
console.log('Replaced afterAll with Truncate Cascade');