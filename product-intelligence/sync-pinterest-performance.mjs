import { openPerformanceStore } from './performance-store.mjs';
import { localEnvironment } from './local-env.mjs';

const env = await localEnvironment();
const token = env.PINTEREST_ACCESS_TOKEN;
if (!token) { console.log(JSON.stringify({ ok: true, status: 'NOT_CONFIGURED', imported: 0 })); process.exit(0); }
const db = openPerformanceStore();
const pins = db.prepare('SELECT pin_tracking_id, official_pin_id, product_id FROM pins WHERE official_pin_id IS NOT NULL').all();
const end = new Date().toISOString().slice(0, 10);
const start = new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10);
const upsert = db.prepare(`INSERT INTO pinterest_metrics
  (metric_key, product_id, pin_tracking_id, official_pin_id, metric_date, impressions, saves, pin_clicks, outbound_clicks, engagements, source, observed_at, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(metric_key) DO UPDATE SET
  impressions=excluded.impressions, saves=excluded.saves, pin_clicks=excluded.pin_clicks,
  outbound_clicks=excluded.outbound_clicks, engagements=excluded.engagements, observed_at=excluded.observed_at, raw_json=excluded.raw_json`);
let imported = 0;
for (const pin of pins) {
  const url = new URL(`https://api.pinterest.com/v5/pins/${pin.official_pin_id}/analytics`);
  url.searchParams.set('start_date', start); url.searchParams.set('end_date', end);
  url.searchParams.set('metric_types', 'IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK,ENGAGEMENT');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Pinterest analytics HTTP ${response.status}`);
  const raw = await response.json();
  const summary = raw.all?.summary_metrics || raw.summary_metrics || {};
  upsert.run(`pinterest-api:${pin.official_pin_id}:${start}:${end}`, pin.product_id, pin.pin_tracking_id, pin.official_pin_id, end,
    summary.IMPRESSION ?? null, summary.SAVE ?? null, summary.PIN_CLICK ?? null,
    summary.OUTBOUND_CLICK ?? null, summary.ENGAGEMENT ?? null, 'pinterest-api-v5', new Date().toISOString(), JSON.stringify(raw));
  imported += 1;
}
console.log(JSON.stringify({ ok: true, status: 'CONNECTED', pins: pins.length, imported }));
db.close();
