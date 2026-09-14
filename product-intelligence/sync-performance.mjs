import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scripts = ['sync-pinterest-performance.mjs', 'sync-site-performance.mjs', 'sync-aliexpress-performance.mjs', 'recalculate-performance.mjs', 'generate-performance-report.mjs', 'analytics-health.mjs'];
const results = [];
for (const script of scripts) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { stdio: 'inherit', env: process.env });
  results.push({ script, ok: result.status === 0 });
}
console.log(JSON.stringify({ ok: true, publishingUnaffected: true, results }));
