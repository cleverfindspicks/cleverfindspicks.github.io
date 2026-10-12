import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {deferredRetry,dueSlot,zoned} from './scheduler-policy.mjs';

const platform = process.argv[2];
if (!['instagram', 'pinterest'].includes(platform)) throw new Error('Usage: node operations/scheduler-worker.mjs <instagram|pinterest> [--run-now]');
const runNow = process.argv.includes('--run-now');
const root = resolve(import.meta.dirname, '..');
const local = resolve(root, 'product-intelligence/.local');
const statePath = resolve(local, 'persistent-scheduler-state.json');
const logPath = resolve(local, 'scheduler-runs.jsonl');
await mkdir(local, { recursive: true });

const configuration = platform === 'instagram'
  ? { timeZone: 'Europe/London', slots: ['09:00', '14:00', '19:30'], script: 'instagram/run.mjs' }
  : { timeZone: 'Asia/Riyadh', slots: ['15:00', '19:00', '22:00'], script: 'product-intelligence/production-run.mjs' };
const state = JSON.parse(await readFile(statePath, 'utf8').catch(() => '{}'));
const now=new Date();
const normalDue=dueSlot(now, configuration.timeZone, configuration.slots);
// Both platforms are independent, but they share one AliExpress quota. Do not
// let an old Instagram backoff retry race a currently due Pinterest slot.
const pinterestDueNow=platform==='instagram'&&dueSlot(now,'Asia/Riyadh',['15:00','19:00','22:00']);
const retryDue=pinterestDueNow?null:deferredRetry(now,configuration,state,platform);
const due = runNow ? { ...zoned(now, configuration.timeZone), slot: 'SAFE_REPAIR_TEST' } : normalDue || retryDue;
if (!due) {
  // Stagger one bounded Instagram evidence refresh between publication slots.
  // The maintenance script owns its two-hour cadence and AliExpress backoff.
  if(platform==='instagram'){
    await new Promise(resolveResult=>{const child=spawn(process.execPath,['instagram/fresh-buffer.mjs'],{cwd:root,windowsHide:true,stdio:'ignore'});child.on('close',resolveResult);child.on('error',resolveResult);});
  }
  process.exit(0);
}

const key = `${platform}:${due.day}:${due.slot}`;
if (!runNow && state[key] && state[key].status !== 'DEFERRED_ALIEXPRESS_API_LIMIT') process.exit(0);
if (!runNow && state[key]?.status === 'DEFERRED_ALIEXPRESS_API_LIMIT' && Date.parse(state[key].nextAttemptAt || 0) > Date.now()) process.exit(0);
state[key] = { status: 'RUNNING', startedAt: new Date().toISOString(), pid: process.pid };
const temporary = `${statePath}.${process.pid}.tmp`;
await writeFile(temporary, JSON.stringify(state, null, 2));
await rename(temporary, statePath);

const startedAt = new Date();
const result = await new Promise((resolveResult) => {
  const child = spawn(process.execPath, [configuration.script], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('close', (code) => resolveResult({ code, stdout, stderr }));
  child.on('error', (error) => resolveResult({ code: -1, stdout, stderr: `${stderr}\n${error.message}` }));
});
let parsed = null;
for (const line of result.stdout.trim().split(/\r?\n/).reverse()) try { parsed = JSON.parse(line); break; } catch { /* find the final JSON result */ }
const entry = {
  platform, slotDay: due.day, slotTime: due.slot, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(),
  status: result.code === 0 ? (parsed?.status || 'COMPLETED') : 'ERROR', exitCode: result.code,
  nextAttemptAt: parsed?.nextAttemptAt || null,
  detail: parsed?.detail || parsed?.errors || result.stderr.trim().slice(-1000) || null,
};
state[key] = entry;
await writeFile(temporary, JSON.stringify(state, null, 2));
await rename(temporary, statePath);
await appendFile(logPath, `${JSON.stringify(entry)}\n`);
console.log(JSON.stringify(entry));
if (result.code !== 0) process.exitCode = 1;
