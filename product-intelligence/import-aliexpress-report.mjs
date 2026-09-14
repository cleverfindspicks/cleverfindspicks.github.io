import { readRows, pick } from './report-io.mjs';
import { nullableNumber, openPerformanceStore } from './performance-store.mjs';
import { commissionByStatus, normalizeOrderStatus } from './performance.mjs';

const path = process.argv[2];
if (!path) throw new Error('Usage: pnpm performance:import:aliexpress <affiliate-report.csv|json>');
const rows = await readRows(path);
const db = openPerformanceStore();
const product = db.prepare('SELECT product_id FROM products WHERE product_id=? OR product_slug=? LIMIT 1');
const insert = db.prepare(`INSERT INTO aliexpress_orders
  (order_key, external_order_id, product_id, pin_tracking_id, ordered_at, status, pending_commission_gbp, confirmed_commission_gbp, source, attribution_confidence, observed_at, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(order_key) DO UPDATE SET
    status=excluded.status, pending_commission_gbp=excluded.pending_commission_gbp,
    confirmed_commission_gbp=excluded.confirmed_commission_gbp, observed_at=excluded.observed_at, raw_json=excluded.raw_json`);
let imported = 0; let unmatched = 0;
for (const row of rows) {
  const orderId = pick(row, 'order_id', 'order_number', 'external_order_id');
  const productId = pick(row, 'product_id', 'productid');
  const slug = pick(row, 'product_slug', 'slug');
  const orderedAt = pick(row, 'order_time', 'ordered_at', 'date');
  if (!orderId || !orderedAt) throw new Error('Every AliExpress row requires order_id and order_time/date.');
  const match = product.get(productId, slug);
  if (!match) unmatched += 1;
  const status = normalizeOrderStatus(pick(row, 'status', 'order_status'));
  const commission = nullableNumber(pick(row, 'commission', 'commission_gbp', 'estimated_commission'));
  const { pendingCommissionGbp: pending, confirmedCommissionGbp: confirmed } = commissionByStatus(status, commission);
  const confidence = match && productId ? 1 : match ? 0.75 : 0;
  insert.run(`aliexpress:${orderId}:${match?.product_id || productId || slug || 'unknown'}`, orderId, match?.product_id || null,
    pick(row, 'pin_tracking_id', 'sub_id', 'tracking_id'), orderedAt, status, pending, confirmed,
    'aliexpress-affiliate-report', confidence, new Date().toISOString(), JSON.stringify(row));
  imported += 1;
}
console.log(JSON.stringify({ ok: true, source: 'aliexpress-affiliate-report', imported, unmatched }));
db.close();
