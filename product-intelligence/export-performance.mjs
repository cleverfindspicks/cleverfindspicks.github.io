import { writeFile } from 'node:fs/promises';
import { openPerformanceStore } from './performance-store.mjs';

const db = openPerformanceStore();
const tables = ['products', 'publications', 'pins', 'website_metrics', 'pinterest_metrics', 'aliexpress_clicks', 'aliexpress_orders', 'performance_snapshots', 'cluster_performance', 'automation_runs'];
const data = Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all()]));
const path = new URL('./reports/performance-export.json', import.meta.url);
await writeFile(path, JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2));
console.log(JSON.stringify({ ok: true, destination: 'private ignored performance-export.json', tables: tables.length }));
db.close();
