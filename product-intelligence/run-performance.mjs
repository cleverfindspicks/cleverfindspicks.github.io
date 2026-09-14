import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const script of ['import-current-catalogue.mjs', 'recalculate-performance.mjs']) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { stdio: 'inherit', env: process.env });
  if (result.status !== 0) throw new Error(`${script} failed with exit ${result.status}`);
}
console.log(JSON.stringify({ ok: true, source: 'private-performance-store', publishingUnaffectedByCaller: true }));
