import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const platform = process.argv[2];
if (!['instagram', 'pinterest'].includes(platform)) throw new Error('Usage: node operations/scheduler-worker.mjs <instagram|pinterest> [--run-now]');
const runNow = process.argv.includes('--run-now');
const root = resolve(import.meta.dirname, '..');
const local = resolve(root, 'product-intelligence/.local');
const statePath = resolve(local, 'persistent-scheduler-state.json');
const logPath = resolve(local, 'scheduler-runs.jsonl');
await mkdir(local, { recursive: true });

function zoned(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
function dueSlot(now, timeZone, slots, catchUp = 14) {
  const clock = zoned(now, timeZone);
  const minutes = (value) => value.split(':').reduce((hours, minute) => hours * 60 + Number(minute), 0);
  const slot = [...slots].reverse().find((value) => { const elapsed = minutes(clock.time) - minutes(value); return elapsed >= 0 && elapsed <= catchUp; });
  return slot ? { ...clock, slot } : null;
}
const configuration = platform === 'instagram'
  ? { timeZone: 'Europe/London', slots: ['09:00', '14:00', '19:30'], script: 'instagram/run.mjs' }
  : { timeZone: 'Asia/Riyadh', slots: ['15:00', '19:00', '22:00'], script: 'product-intelligence/production-run.mjs' };
const due = runNow ? { ...zoned(new Date(), configuration.timeZone), slot: 'SAFE_REPAIR_TEST' } : dueSlot(new Date(), configuration.timeZone, configuration.slots);
if (!due) {
  // Stagger one bounded Instagram evidence refresh between publication slots.
  // The maintenance script owns its two-hour cadence and AliExpress backoff.
  if(platform==='instagram'){
    await new Promise(resolveResult=>{const child=spawn(process.execPath,['instagram/fresh-buffer.mjs'],{cwd:root,windowsHide:true,stdio:'ignore'});child.on('close',resolveResult);child.on('error',resolveResult);});
  }
  process.exit(0);
}

const state = JSON.parse(await readFile(statePath, 'utf8').catch(() => '{}'));
const key = `${platform}:${due.day}:${due.slot}`;
if (!runNow && state[key]) process.exit(0);
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
  detail: parsed?.detail || parsed?.errors || result.stderr.trim().slice(-1000) || null,
};
state[key] = entry;
await writeFile(temporary, JSON.stringify(state, null, 2));
await rename(temporary, statePath);
await appendFile(logPath, `${JSON.stringify(entry)}\n`);
console.log(JSON.stringify(entry));
if (result.code !== 0) process.exitCode = 1;
