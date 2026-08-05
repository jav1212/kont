import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanRoots = ['app/api', 'src/modules'];
const ignored = new Set(['node_modules', '.next', '.git']);
const files = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|mjs)$/.test(entry.name)) files.push(full);
  }
}

for (const relative of scanRoots) walk(path.join(root, relative));

const directLegacy = [];
const unconditionedFactory = [];

for (const file of files) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  if (relative.startsWith('app/api/admin/')) continue;
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);
  const isLegacyAdapter = /\/repository\/(rpc-|supabase-)/.test(relative);
  const hasSelector = /isSharedSchema(?:Pilot)?Enabled|SHARED_SCHEMA_PILOT_TENANTS/.test(source);

  if (!isLegacyAdapter) {
    lines.forEach((line, index) => {
      if (/\.rpc\(\s*['"]tenant_[^'"]+['"]/.test(line)) {
        directLegacy.push(`${relative}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  if (/factory\.ts$/.test(relative) && /new\s+Rpc[A-Za-z0-9_]+/.test(source) && !hasSelector) {
    unconditionedFactory.push(relative);
  }
}

console.log('Shared-schema audit');
console.log(`Scanned ${files.length} source files.`);
console.log(`Direct tenant RPC calls outside legacy adapters: ${directLegacy.length}`);
for (const finding of directLegacy) console.log(`  ${finding}`);
console.log(`Factories with Rpc adapters and no shared selector: ${unconditionedFactory.length}`);
for (const finding of unconditionedFactory) console.log(`  ${finding}`);

if (directLegacy.length || unconditionedFactory.length) {
  console.error('Shared-schema audit failed: review the findings above.');
  process.exitCode = 1;
} else {
  console.log('Shared-schema audit passed.');
}
