import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Includes regression scripts that existed but were not registered in check.
const directory = fileURLToPath(new URL('./', import.meta.url));
const files = (await readdir(directory)).filter(name => /^verify-note-.*\.(mjs|mts)$/.test(name)).sort();
files.push('verify-modifier-formula.mts', 'verify-archivio-checkbox.mts');
const failures = [];
for (const name of files) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL(name, import.meta.url))], { stdio: 'inherit' });
  if (result.error || result.status !== 0) failures.push(name);
}
if (failures.length) {
  console.error(`FAILED ${failures.length}/${files.length} note suites: ${failures.join(', ')}`);
  process.exitCode = 1;
} else console.log(`PASS complete notes model/source regression: ${files.length} suites.`);
