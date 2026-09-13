import { readFile, writeFile } from 'node:fs/promises';
import { scoreClusters } from './performance.mjs';

const input = JSON.parse(await readFile(new URL('./data/performance-events.json', import.meta.url), 'utf8'));
const clusters = scoreClusters(input.events || []);
await writeFile(new URL('./data/cluster-performance.json', import.meta.url), JSON.stringify({
  generatedAt: new Date().toISOString(),
  status: clusters.some((cluster) => cluster.enoughData) ? 'active' : 'waiting-for-data',
  clusters,
  note: 'Priority changes only after a cluster reaches the configured impression threshold; diversity caps still apply.'
}, null, 2));
console.log(JSON.stringify({ ok: true, events: (input.events || []).length, clusters: clusters.length, active: clusters.filter((cluster) => cluster.enoughData).length }));
