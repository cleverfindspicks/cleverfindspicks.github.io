import { readRows, pick } from './report-io.mjs';
import { metricKey, nullableNumber, openPerformanceStore } from './performance-store.mjs';

const path = process.argv[2];
if (!path) throw new Error('Usage: pnpm performance:import:site <ga4-export.csv|json>');
const rows = await readRows(path);
const db = openPerformanceStore();
const findProduct = db.prepare('SELECT product_id FROM products WHERE product_slug=? OR product_id=? LIMIT 1');
const insertMetric = db.prepare(`INSERT INTO website_metrics
  (metric_key, product_id, product_slug, pin_tracking_id, metric_date, product_views, qualified_visits, source, observed_at, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(metric_key) DO NOTHING`);
const insertClick = db.prepare(`INSERT INTO aliexpress_clicks
  (click_key, product_id, product_slug, pin_tracking_id, clicked_at, source, attribution_confidence, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(click_key) DO NOTHING`);
let metrics = 0; let clicks = 0; let duplicates = 0;
for (const row of rows) {
  const slug = pick(row, 'product_slug', 'slug');
  const productId = pick(row, 'product_id');
  const match = findProduct.get(slug, productId);
  const date = pick(row, 'date', 'metric_date', 'event_date');
  if (!date) throw new Error('Every site row requires date/metric_date.');
  const metric = insertMetric.run(metricKey('site', row, ['product_slug', 'product_id', 'date']), match?.product_id || null, slug || null,
    pick(row, 'pin_tracking_id', 'cf_pin'), date, nullableNumber(pick(row, 'product_views', 'views')),
    nullableNumber(pick(row, 'qualified_visits', 'sessions')), 'ga4-export', new Date().toISOString(), JSON.stringify(row));
  if (metric.changes) metrics += 1;
  else duplicates += 1;
  const outboundClicks = nullableNumber(pick(row, 'aliexpress_outbound_clicks', 'aliexpress_clicks'));
  for (let index = 0; index < (outboundClicks || 0); index += 1) {
    const result = insertClick.run(`${metricKey('ga4-click', row, ['product_slug', 'product_id', 'date'])}:${index}`, match?.product_id || null, slug || null,
      pick(row, 'pin_tracking_id', 'cf_pin'), `${date}T12:00:00.000Z`, 'ga4-export', pick(row, 'cf_pin', 'pin_tracking_id') ? 0.9 : 0.7, JSON.stringify(row));
    if (result.changes) clicks += 1;
  }
}
console.log(JSON.stringify({ ok: true, source: 'ga4-export', metrics, clicks, duplicates }));
db.close();
