import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const defaultDatabasePath = resolve(process.env.CF_PERFORMANCE_DB || resolve(moduleDir, '.local', 'performance.sqlite'));

export function openPerformanceStore(path = defaultDatabasePath) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      product_id TEXT PRIMARY KEY, product_slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      cluster TEXT NOT NULL, first_published_at TEXT NOT NULL, canonical_product_url TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS automation_runs (
      automation_run_id TEXT PRIMARY KEY, started_at TEXT, completed_at TEXT, status TEXT,
      query_count INTEGER, candidate_count INTEGER, source TEXT NOT NULL, raw_json TEXT
    );
    CREATE TABLE IF NOT EXISTS publications (
      publication_id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(product_id),
      product_slug TEXT NOT NULL, cluster TEXT NOT NULL, search_query TEXT,
      automation_run_id TEXT REFERENCES automation_runs(automation_run_id), published_at TEXT NOT NULL,
      source TEXT NOT NULL, UNIQUE(product_slug, published_at)
    );
    CREATE TABLE IF NOT EXISTS pins (
      pin_tracking_id TEXT PRIMARY KEY, publication_id TEXT NOT NULL REFERENCES publications(publication_id),
      product_id TEXT NOT NULL REFERENCES products(product_id), official_pin_id TEXT,
      destination_url TEXT NOT NULL, published_at TEXT NOT NULL, source TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS website_metrics (
      metric_key TEXT PRIMARY KEY, product_id TEXT REFERENCES products(product_id), product_slug TEXT,
      pin_tracking_id TEXT, metric_date TEXT NOT NULL, product_views INTEGER,
      qualified_visits INTEGER, source TEXT NOT NULL, observed_at TEXT NOT NULL, raw_json TEXT
    );
    CREATE TABLE IF NOT EXISTS pinterest_metrics (
      metric_key TEXT PRIMARY KEY, product_id TEXT REFERENCES products(product_id), pin_tracking_id TEXT,
      official_pin_id TEXT, metric_date TEXT NOT NULL, impressions INTEGER, saves INTEGER,
      pin_clicks INTEGER, outbound_clicks INTEGER, engagements INTEGER,
      source TEXT NOT NULL, observed_at TEXT NOT NULL, raw_json TEXT
    );
    CREATE TABLE IF NOT EXISTS aliexpress_clicks (
      click_key TEXT PRIMARY KEY, product_id TEXT REFERENCES products(product_id), product_slug TEXT,
      pin_tracking_id TEXT, clicked_at TEXT NOT NULL, source TEXT NOT NULL,
      attribution_confidence REAL, raw_json TEXT
    );
    CREATE TABLE IF NOT EXISTS aliexpress_orders (
      order_key TEXT PRIMARY KEY, external_order_id TEXT NOT NULL, product_id TEXT REFERENCES products(product_id),
      pin_tracking_id TEXT, ordered_at TEXT NOT NULL, status TEXT NOT NULL,
      pending_commission_gbp REAL, confirmed_commission_gbp REAL,
      source TEXT NOT NULL, attribution_confidence REAL, observed_at TEXT NOT NULL, raw_json TEXT,
      UNIQUE(source, external_order_id, product_id)
    );
    CREATE TABLE IF NOT EXISTS performance_snapshots (
      snapshot_id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      window_days INTEGER, calculated_at TEXT NOT NULL, metrics_json TEXT NOT NULL, source TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cluster_performance (
      cluster TEXT NOT NULL, window_days INTEGER NOT NULL, calculated_at TEXT NOT NULL,
      published_pins INTEGER NOT NULL, impressions INTEGER, pinterest_outbound_clicks INTEGER,
      product_views INTEGER, aliexpress_clicks INTEGER, orders INTEGER,
      pending_commission_gbp REAL, confirmed_commission_gbp REAL, epmi REAL,
      sample_confidence REAL NOT NULL, performance_multiplier REAL NOT NULL, status TEXT NOT NULL,
      PRIMARY KEY(cluster, window_days)
    );
    CREATE INDEX IF NOT EXISTS idx_pinterest_product_date ON pinterest_metrics(product_id, metric_date);
    CREATE INDEX IF NOT EXISTS idx_website_product_date ON website_metrics(product_id, metric_date);
    CREATE INDEX IF NOT EXISTS idx_orders_product_date ON aliexpress_orders(product_id, ordered_at);
    CREATE INDEX IF NOT EXISTS idx_clicks_product_date ON aliexpress_clicks(product_id, clicked_at);
  `);
  return db;
}

export function stableLegacyProductId(slug) { return `legacy:${slug}`; }
export function stablePublicationId(slug, publishedAt) { return `pub:${slug}:${String(publishedAt).slice(0, 10)}`; }
export function stablePinTrackingId(slug, publishedAt) { return `pin:${slug}:${String(publishedAt).slice(0, 10)}`; }

export function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replaceAll(',', '').replace(/[£$%]/g, ''));
  return Number.isFinite(number) ? number : null;
}

export function metricKey(source, row, fields) {
  const explicit = row.metric_key || row.event_id || row.id;
  if (explicit) return `${source}:${explicit}`;
  return `${source}:${fields.map((field) => row[field] ?? '').join('|')}`;
}
