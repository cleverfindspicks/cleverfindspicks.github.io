import { readFile } from 'node:fs/promises';
import { products } from '../app/products.ts';
import { openPerformanceStore, stableLegacyProductId, stablePinTrackingId, stablePublicationId } from './performance-store.mjs';

const db = openPerformanceStore();
const now = new Date().toISOString();
const runLog = JSON.parse(await readFile(new URL('./data/run-log.json', import.meta.url), 'utf8').catch(() => '{"runs":[]}'));
const runInsert = db.prepare(`INSERT INTO automation_runs
  (automation_run_id, started_at, completed_at, status, query_count, candidate_count, source, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(automation_run_id) DO NOTHING`);
for (const run of runLog.runs || []) runInsert.run(run.runId, run.generatedAt, run.generatedAt, 'completed', run.queryCount ?? null, run.candidateCount ?? null, 'clever-finds-run-log', JSON.stringify(run));

const upsertProduct = db.prepare(`INSERT INTO products
  (product_id, product_slug, name, cluster, first_published_at, canonical_product_url, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(product_id) DO UPDATE SET name=excluded.name, cluster=excluded.cluster,
    canonical_product_url=COALESCE(excluded.canonical_product_url, products.canonical_product_url), updated_at=excluded.updated_at`);
const insertPublication = db.prepare(`INSERT INTO publications
  (publication_id, product_id, product_slug, cluster, search_query, automation_run_id, published_at, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(publication_id) DO NOTHING`);
const insertPin = db.prepare(`INSERT INTO pins
  (pin_tracking_id, publication_id, product_id, official_pin_id, destination_url, published_at, source)
  VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(pin_tracking_id) DO NOTHING`);
const removeUnusedFallbackPins = db.prepare(`DELETE FROM pins WHERE publication_id=? AND pin_tracking_id<>?
  AND source='clever-finds-catalogue' AND official_pin_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM pinterest_metrics WHERE pinterest_metrics.pin_tracking_id=pins.pin_tracking_id)
  AND NOT EXISTS (SELECT 1 FROM website_metrics WHERE website_metrics.pin_tracking_id=pins.pin_tracking_id)
  AND NOT EXISTS (SELECT 1 FROM aliexpress_clicks WHERE aliexpress_clicks.pin_tracking_id=pins.pin_tracking_id)
  AND NOT EXISTS (SELECT 1 FROM aliexpress_orders WHERE aliexpress_orders.pin_tracking_id=pins.pin_tracking_id)`);

db.exec('BEGIN');
try {
  for (const product of products) {
    const productId = String(product.productId || stableLegacyProductId(product.slug));
    const publicationId = product.publicationId || stablePublicationId(product.slug, product.publishedAt);
    const pinTrackingId = product.pinTrackingId || stablePinTrackingId(product.slug, product.publishedAt);
    const cluster = product.cluster || product.eyebrow.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '');
    upsertProduct.run(productId, product.slug, product.shortName, cluster, product.publishedAt, product.canonicalProductUrl || null, now, now);
    insertPublication.run(publicationId, productId, product.slug, cluster, product.searchQuery || null, product.automationRunId || null, product.publishedAt, 'clever-finds-catalogue');
    const destination = `https://cleverfindspicks.github.io/finds/${product.slug}?utm_source=pinterest&utm_medium=organic&utm_campaign=clever_finds&cf_pin=${encodeURIComponent(pinTrackingId)}`;
    removeUnusedFallbackPins.run(publicationId, pinTrackingId);
    insertPin.run(pinTrackingId, publicationId, productId, product.pinterestPinId || null, destination, product.publishedAt, 'clever-finds-catalogue');
  }
  db.exec('COMMIT');
} catch (error) { db.exec('ROLLBACK'); throw error; }

console.log(JSON.stringify({ ok: true, database: 'private-local-sqlite', products: products.length, runs: (runLog.runs || []).length }));
db.close();
