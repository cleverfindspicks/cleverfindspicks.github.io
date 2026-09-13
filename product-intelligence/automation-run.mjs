import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

function run(script) {
  const result = spawnSync(process.execPath, [script], { cwd: new URL('..', import.meta.url), stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${script} failed with exit ${result.status}.`);
}

run('product-intelligence/run-performance.mjs');
run('product-intelligence/search-candidates.mjs');
run('product-intelligence/dry-run.mjs');
const report = JSON.parse(await readFile(new URL('./data/dry-run-report.json', import.meta.url), 'utf8'));
console.log(JSON.stringify({ ok: true, status: report.status, winner: report.winner?.productId || null }));
