import { readFile, writeFile } from 'node:fs/promises';
import config from './config.json' with { type: 'json' };

const inputPath = process.argv[2];
const source = process.argv[3];
if (!inputPath || !['pinterest', 'website', 'aliexpress'].includes(source)) {
  throw new Error('Usage: node product-intelligence/import-performance.mjs <json-file> <pinterest|website|aliexpress>');
}

const incoming = JSON.parse(await readFile(inputPath, 'utf8'));
const rows = Array.isArray(incoming) ? incoming : incoming.events;
if (!Array.isArray(rows)) throw new Error('Input must be an array or an object with an events array.');
const required = ['trackingId', 'date'];
for (const [index, row] of rows.entries()) {
  for (const field of required) if (!row[field]) throw new Error(`Row ${index + 1} is missing ${field}.`);
}
const target = new URL('./data/performance-events.json', import.meta.url);
const current = JSON.parse(await readFile(target, 'utf8'));
const stamped = rows.map((row) => ({ ...row, source, importedAt: new Date().toISOString() }));
const events = [...(current.events || []), ...stamped].slice(-config.retention.maximumPerformanceEvents);
await writeFile(target, JSON.stringify({ schemaVersion: 2, updatedAt: new Date().toISOString(), events }, null, 2));
console.log(JSON.stringify({ ok: true, source, imported: stamped.length, retained: events.length }));
