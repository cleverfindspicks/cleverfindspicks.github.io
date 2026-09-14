import { writeFile } from 'node:fs/promises';
import config from './config.json' with { type: 'json' };
import { openPerformanceStore } from './performance-store.mjs';
import { aggregateClusters, performanceMetrics } from './performance.mjs';

const db = openPerformanceStore();
const now = new Date().toISOString();
const windows = [...config.performance.windowsDays, null];
const productRows = db.prepare('SELECT product_id productId, product_slug productSlug, name, cluster, first_published_at publishedAt FROM products').all();
const sourceAvailable = {
  clicks: db.prepare('SELECT COUNT(*) count FROM aliexpress_clicks').get().count > 0,
  orders: db.prepare('SELECT COUNT(*) count FROM aliexpress_orders').get().count > 0,
};
const clustersByWindow = new Map();
for (const windowDays of windows) {
  const cutoff = windowDays ? new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10) : '0000-01-01';
  const rows = productRows.map((product) => {
    const pin = db.prepare('SELECT pin_tracking_id FROM pins WHERE product_id=? ORDER BY published_at LIMIT 1').get(product.productId);
    const pinterest = db.prepare('SELECT SUM(impressions) impressions, SUM(saves) saves, SUM(pin_clicks) pinClicks, SUM(outbound_clicks) pinterestOutboundClicks FROM pinterest_metrics WHERE product_id=? AND metric_date>=?').get(product.productId, cutoff);
    const site = db.prepare('SELECT SUM(product_views) productViews, SUM(qualified_visits) qualifiedVisits FROM website_metrics WHERE product_id=? AND metric_date>=?').get(product.productId, cutoff);
    const clicks = sourceAvailable.clicks ? db.prepare('SELECT COUNT(*) aliexpressClicks FROM aliexpress_clicks WHERE product_id=? AND date(clicked_at)>=?').get(product.productId, cutoff) : { aliexpressClicks: null };
    const orders = sourceAvailable.orders ? db.prepare("SELECT COUNT(*) orders, SUM(CASE WHEN status='pending' THEN pending_commission_gbp ELSE 0 END) pendingCommissionGbp, SUM(CASE WHEN status='completed' THEN confirmed_commission_gbp ELSE 0 END) confirmedCommissionGbp FROM aliexpress_orders WHERE product_id=? AND date(ordered_at)>=? AND status NOT IN ('cancelled','refunded','invalid')").get(product.productId, cutoff) : { orders: null, pendingCommissionGbp: null, confirmedCommissionGbp: null };
    return performanceMetrics({ ...product, pinTrackingId: pin?.pin_tracking_id || null, ...pinterest, ...site, ...clicks, ...orders });
  });
  const clusters = aggregateClusters(rows);
  clustersByWindow.set(windowDays || 'lifetime', clusters);
  const snapshot = db.prepare('INSERT OR REPLACE INTO performance_snapshots (snapshot_id, entity_type, entity_id, window_days, calculated_at, metrics_json, source) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const row of rows) snapshot.run(`product:${row.productId}:${windowDays || 'lifetime'}:${now.slice(0, 10)}`, 'product', row.productId, windowDays, now, JSON.stringify(row), 'calculated');
  for (const cluster of clusters) snapshot.run(`cluster:${cluster.cluster}:${windowDays || 'lifetime'}:${now.slice(0, 10)}`, 'cluster', cluster.cluster, windowDays, now, JSON.stringify(cluster), 'calculated');
}
const lifetimeByCluster = new Map((clustersByWindow.get('lifetime') || []).map((cluster) => [cluster.cluster, cluster]));
const clusterOutputs = (clustersByWindow.get(30) || []).map((recent) => {
  const lifetime = lifetimeByCluster.get(recent.cluster);
  if (!recent.enoughData || !lifetime?.enoughData) return recent;
  const blended = recent.searchPriorityMultiplier * config.performance.recent30DayWeight + lifetime.searchPriorityMultiplier * config.performance.lifetimeWeight;
  return { ...recent, searchPriorityMultiplier: Number(Math.max(config.performance.minimumSearchPriorityMultiplier, Math.min(config.performance.maximumSearchPriorityMultiplier, blended)).toFixed(3)), blendedFrom: ['30-days', 'lifetime'] };
});
db.exec('DELETE FROM cluster_performance');
const insertCluster = db.prepare('INSERT INTO cluster_performance (cluster, window_days, calculated_at, published_pins, impressions, pinterest_outbound_clicks, product_views, aliexpress_clicks, orders, pending_commission_gbp, confirmed_commission_gbp, epmi, sample_confidence, performance_multiplier, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
for (const cluster of clusterOutputs) insertCluster.run(cluster.cluster, 30, now, cluster.publishedPins, cluster.totals.impressions, cluster.totals.pinterestOutboundClicks, cluster.totals.productViews, cluster.totals.aliexpressClicks, cluster.totals.orders, cluster.totals.pendingCommissionGbp, cluster.totals.confirmedCommissionGbp, cluster.totals.earningsPerThousandPinterestImpressions, cluster.sampleConfidence, cluster.searchPriorityMultiplier, cluster.status);
await writeFile(new URL('./data/cluster-performance.json', import.meta.url), JSON.stringify({ generatedAt: now, status: clusterOutputs.some((cluster) => cluster.enoughData) ? 'active' : 'waiting-for-data', clusters: clusterOutputs.map((cluster) => ({ cluster: cluster.cluster, enoughData: cluster.enoughData, publishedPins: cluster.publishedPins, performanceScore: cluster.performanceScore, searchPriorityMultiplier: cluster.searchPriorityMultiplier, status: cluster.status, sampleConfidence: cluster.sampleConfidence })), note: 'Only sufficiently sampled 30-day aggregate performance affects search priority. Missing data remains neutral.' }, null, 2));
console.log(JSON.stringify({ ok: true, products: productRows.length, windows: windows.length, activeClusters: clusterOutputs.filter((cluster) => cluster.enoughData).length }));
db.close();
