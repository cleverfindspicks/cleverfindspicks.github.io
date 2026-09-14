import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { aggregateClusters, commissionByStatus, epmi, isExplorationRun, normalizeOrderStatus, performanceMetrics, safeRate } from '../performance.mjs';
import { openPerformanceStore } from '../performance-store.mjs';
import { captureAttribution, pinterestDestination, readAttribution, trackingPayload } from '../../lib/tracking.ts';
import config from '../config.json' with { type: 'json' };

test('Pinterest attribution reads safe query parameters', () => {
  assert.deepEqual(readAttribution('?utm_source=pinterest&utm_medium=organic&utm_campaign=clever_finds&cf_pin=pin-1'), { utm_source: 'pinterest', utm_medium: 'organic', utm_campaign: 'clever_finds', pin_tracking_id: 'pin-1' });
});

test('attribution persists through the session', () => {
  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) };
  captureAttribution('?utm_source=pinterest&cf_pin=pin-2', storage);
  assert.equal(captureAttribution('', storage).pin_tracking_id, 'pin-2');
});

test('tracking payload carries stable identities without personal data', () => {
  const payload = trackingPayload({ productId: '123', productSlug: 'drawer', cluster: 'drawer', pinTrackingId: 'pin', publicationId: 'pub', automationRunId: 'run' });
  assert.equal(payload.product_id, '123'); assert.equal(payload.publication_id, 'pub'); assert.equal(payload.automation_run_id, 'run');
  assert.equal('email' in payload, false);
});

test('Pinterest destination keeps canonical path and adds attribution', () => {
  const url = new URL(pinterestDestination('https://cleverfindspicks.github.io', 'drawer', 'pin-3'));
  assert.equal(url.pathname, '/finds/drawer'); assert.equal(url.searchParams.get('cf_pin'), 'pin-3');
});

test('unknown metrics remain null', () => {
  const metrics = performanceMetrics({});
  assert.equal(metrics.earningsPerThousandPinterestImpressions, null); assert.equal(metrics.clickToOrderCvr, null);
});

test('EPMI calculation is commission per thousand impressions', () => assert.equal(epmi(25, 5000), 5));
test('zero impressions produce unknown EPMI', () => assert.equal(epmi(25, 0), null));
test('zero clicks produce unknown conversion rate', () => assert.equal(safeRate(2, 0), null));

test('cancelled, refunded and invalid orders never confirm commission', () => {
  for (const status of ['cancelled', 'refunded', 'invalid']) assert.deepEqual(commissionByStatus(normalizeOrderStatus(status), 9), { pendingCommissionGbp: 0, confirmedCommissionGbp: 0 });
});

test('completed commission is separated from pending commission', () => {
  assert.deepEqual(commissionByStatus(normalizeOrderStatus('validated'), 7.5), { pendingCommissionGbp: 0, confirmedCommissionGbp: 7.5 });
  assert.deepEqual(commissionByStatus(normalizeOrderStatus('pending'), 7.5), { pendingCommissionGbp: 7.5, confirmedCommissionGbp: 0 });
});

test('cluster stays neutral below minimum samples', () => {
  const [cluster] = aggregateClusters([{ cluster: 'tiny', pinTrackingId: 'p1', impressions: 999, aliexpressClicks: 100, orders: 20, confirmedCommissionGbp: 50 }]);
  assert.equal(cluster.status, 'INSUFFICIENT_DATA'); assert.equal(cluster.searchPriorityMultiplier, 1);
});

test('conversion is ignored below click threshold', () => {
  const rows = Array.from({ length: 3 }, (_, i) => ({ cluster: 'sample', pinTrackingId: `p${i}`, impressions: 1000, pinterestOutboundClicks: 20, productViews: 10, aliexpressClicks: 2, orders: 2, confirmedCommissionGbp: 2 }));
  const [cluster] = aggregateClusters(rows);
  assert.equal(cluster.conversionSampleEnough, false);
});

test('performance multiplier is bounded', () => {
  const rows = [...Array.from({ length: 3 }, (_, i) => ({ cluster: 'winner', pinTrackingId: `w${i}`, impressions: 1000, pinterestOutboundClicks: 300, productViews: 250, aliexpressClicks: 200, orders: 100, confirmedCommissionGbp: 1000 })), ...Array.from({ length: 3 }, (_, i) => ({ cluster: 'loser', pinTrackingId: `l${i}`, impressions: 1000, pinterestOutboundClicks: 1, productViews: 1, aliexpressClicks: 1, orders: 0, confirmedCommissionGbp: 0 }))];
  for (const cluster of aggregateClusters(rows)) assert.ok(cluster.searchPriorityMultiplier >= 0.85 && cluster.searchPriorityMultiplier <= 1.15);
});

test('commercial downstream performance beats impressions alone', () => {
  const rows = [...Array.from({ length: 3 }, (_, i) => ({ cluster: 'views', pinTrackingId: `v${i}`, impressions: 30000, pinterestOutboundClicks: 30, productViews: 20, aliexpressClicks: 10, orders: 0, confirmedCommissionGbp: 0 })), ...Array.from({ length: 3 }, (_, i) => ({ cluster: 'sales', pinTrackingId: `s${i}`, impressions: 3000, pinterestOutboundClicks: 100, productViews: 80, aliexpressClicks: 60, orders: 5, confirmedCommissionGbp: 20 }))];
  const result = aggregateClusters(rows); assert.ok(result.find((x) => x.cluster === 'sales').performanceScore > result.find((x) => x.cluster === 'views').performanceScore);
});

test('exploration rate is configured at twenty percent and deterministic', () => {
  assert.equal(config.performance.explorationRate, 0.2); assert.equal(isExplorationRun('stable-run'), isExplorationRun('stable-run'));
});

test('Pinterest and AliExpress imports are idempotent and orders attribute by product ID', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cf-performance-'));
  const dbPath = join(dir, 'test.sqlite');
  const db = openPerformanceStore(dbPath); const now = new Date().toISOString();
  db.prepare('INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('1001', 'drawer', 'Drawer', 'drawer', now, null, now, now);
  db.prepare('INSERT INTO publications VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('pub1', '1001', 'drawer', 'drawer', null, null, now, 'test');
  db.prepare('INSERT INTO pins VALUES (?, ?, ?, ?, ?, ?, ?)').run('pin1', 'pub1', '1001', '999', 'https://example.test/finds/drawer', now, 'test'); db.close();
  const pinterest = join(dir, 'pinterest.csv'); const orders = join(dir, 'orders.csv');
  await writeFile(pinterest, 'date,pin_tracking_id,pin_id,impressions,saves,pin_clicks,outbound_clicks\n2026-09-14,pin1,999,1000,10,20,15\n');
  await writeFile(orders, 'order_id,product_id,order_time,status,commission_gbp\no1,1001,2026-09-14T12:00:00Z,completed,4.50\no2,1001,2026-09-14T13:00:00Z,refunded,8\n');
  const env = { ...process.env, CF_PERFORMANCE_DB: dbPath };
  const p1 = spawnSync(process.execPath, ['product-intelligence/import-pinterest-report.mjs', pinterest], { cwd: join(import.meta.dirname, '../..'), env });
  const p2 = spawnSync(process.execPath, ['product-intelligence/import-pinterest-report.mjs', pinterest], { cwd: join(import.meta.dirname, '../..'), env });
  const a = spawnSync(process.execPath, ['product-intelligence/import-aliexpress-report.mjs', orders], { cwd: join(import.meta.dirname, '../..'), env });
  const a2 = spawnSync(process.execPath, ['product-intelligence/import-aliexpress-report.mjs', orders], { cwd: join(import.meta.dirname, '../..'), env });
  assert.equal(p1.status, 0); assert.equal(p2.status, 0); assert.equal(a.status, 0); assert.equal(a2.status, 0);
  const check = openPerformanceStore(dbPath);
  assert.equal(check.prepare('SELECT COUNT(*) count FROM pinterest_metrics').get().count, 1);
  assert.equal(check.prepare('SELECT COUNT(*) count FROM aliexpress_orders WHERE product_id=?').get('1001').count, 2);
  assert.equal(check.prepare("SELECT confirmed_commission_gbp value FROM aliexpress_orders WHERE external_order_id='o2'").get().value, 0);
  check.close();
});

test('frontend keeps affiliate destination untouched while using GA beacon events', async () => {
  const component = await readFile(new URL('../../components/affiliate-link.tsx', import.meta.url), 'utf8');
  const analytics = await readFile(new URL('../../lib/analytics-events.ts', import.meta.url), 'utf8');
  assert.match(component, /href=\{href\}/); assert.match(component, /aliexpress_outbound_click/); assert.match(analytics, /transport_type: 'beacon'/);
});

test('missing external credentials are non-fatal', () => {
  const result = spawnSync(process.execPath, ['product-intelligence/analytics-health.mjs'], { cwd: join(import.meta.dirname, '../..'), env: { ...process.env, PINTEREST_ACCESS_TOKEN: '', NEXT_PUBLIC_GA_MEASUREMENT_ID: '', GA4_PROPERTY_ID: '' } });
  assert.equal(result.status, 0); assert.match(result.stdout.toString(), /NOT_CONFIGURED/);
});
