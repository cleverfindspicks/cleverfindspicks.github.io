import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Scheduler-safe build entrypoint. It intentionally invokes the project-local
// Vinext CLI through the same Node executable as the worker, so a Windows
// Scheduled Task never depends on an interactive pnpm/PATH session.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const vinext = resolve(root, 'node_modules', 'vinext', 'dist', 'cli.js');
const prepare = resolve(root, 'scripts', 'prepare-github-pages.mjs');
const run = (script, args = []) => {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run(vinext, ['build']);
run(prepare);
