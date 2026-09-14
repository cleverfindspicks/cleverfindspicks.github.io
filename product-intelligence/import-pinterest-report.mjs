import { readRows, pick } from './report-io.mjs';
import { metricKey, nullableNumber, openPerformanceStore } from './performance-store.mjs';

const path = process.argv[2];
if (!path) throw new Error('Usage: pnpm performance:import:pinterest <report.csv|report.json>');
const rows = await readRows(path);
const db = openPerformanceStore();
const findPin = db.prepare('SELECT product_id, pin_tracking_id FROM pins WHERE pin_tracking_id=? OR official_pin_id=? LIMIT 1');
const insert = db.prepare(`INSERT INTO pinterest_metrics
  (metric_key, product_id, pin_tracking_id, official_pin_id, metric_date, impressions, saves, pin_clicks, outbound_clicks, engagements, source, observed_at, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(metric_key) DO NOTHING`);
let imported = 0; let duplicates = 0; let unmatched = 0;
for (const row of rows) {
  const pinTrackingId = pick(row, 'pin_tracking_id', 'cf_pin', 'tracking_id');
  const officialPinId = pick(row, 'pin_id', 'official_pin_id');
  const match = findPin.get(pinTrackingId, officialPinId);
  if (!match) unmatched += 1;
  const date = pick(row, 'date', 'metric_date', 'day');
  if (!date) throw new Error('Every Pinterest row requires date/metric_date.');
  const key = metricKey('pinterest', row, ['pin_tracking_id', 'pin_id', 'date']);
  const result = insert.run(key, match?.product_id || null, match?.pin_tracking_id || pinTrackingId || null, officialPinId || null, date,
    nullableNumber(pick(row, 'impressions')), nullableNumber(pick(row, 'saves')),
    nullableNumber(pick(row, 'pin_clicks', 'pin_click')), nullableNumber(pick(row, 'outbound_clicks', 'outbound_click')),
    nullableNumber(pick(row, 'engagements')), 'pinterest-official-export', new Date().toISOString(), JSON.stringify(row));
  if (result.changes) imported += 1;
  else duplicates += 1;
  if (officialPinId && match?.pin_tracking_id) db.prepare('UPDATE pins SET official_pin_id=COALESCE(official_pin_id, ?) WHERE pin_tracking_id=?').run(officialPinId, match.pin_tracking_id);
}
console.log(JSON.stringify({ ok: true, source: 'pinterest-official-export', imported, duplicates, unmatched }));
db.close();
