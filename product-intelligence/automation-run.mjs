import { spawnSync } from 'node:child_process';
import {assertAliExpressReady} from './aliexpress-recovery.mjs';
import { readFile } from 'node:fs/promises';

function run(script) {
  const result = spawnSync(process.execPath, [script], { cwd: new URL('..', import.meta.url), stdio: 'inherit' });
  assertAliExpressReady();
  if (result.status !== 0) throw new Error(`${script} failed with exit ${result.status}.`);
}

try { run('product-intelligence/run-performance.mjs'); } catch (error) {
  console.warn(JSON.stringify({ analyticsStatus: 'ERROR', publishingContinues: true, message: error.message }));
}
run('product-intelligence/audit-affiliate-destinations.mjs');
run('product-intelligence/search-candidates.mjs');
run('product-intelligence/dry-run.mjs');
let report = JSON.parse(await readFile(new URL('./data/dry-run-report.json', import.meta.url), 'utf8'));
for (let attempt = 0; report.winner && report.winner.affiliateDestinationVerified !== true && attempt < 10; attempt += 1) {
  try { run('product-intelligence/verify-provisional-destination.mjs'); } catch { assertAliExpressReady(); /* The failed ID is recorded and the next qualified candidate is tried. */ }
  run('product-intelligence/dry-run.mjs');
  report = JSON.parse(await readFile(new URL('./data/dry-run-report.json', import.meta.url), 'utf8'));
}
console.log(JSON.stringify({ ok: true, status: report.status, winner: report.winner?.productId || null }));
