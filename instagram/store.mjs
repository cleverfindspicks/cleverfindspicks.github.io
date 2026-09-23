import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defaultDatabasePath, openPerformanceStore } from '../product-intelligence/performance-store.mjs';
export const livePublicationSql = "NOT EXISTS (SELECT 1 FROM instagram_publication_lifecycle l WHERE l.instagram_publication_id=instagram_queue.instagram_publication_id AND (l.kind!='LIVE' OR l.availability!='ACTIVE'))";

export function openInstagramStore(path = defaultDatabasePath) {
  // Back up the existing DB (including committed WAL contents) before the first
  // additive migration. Never copy a live main DB while omitting its WAL.
  if (existsSync(path)) {
    const probe = new DatabaseSync(path);
    const migrated = probe.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='instagram_schedule_slots'").get();
    if (!migrated) {
      mkdirSync(join(dirname(path), 'backups'), { recursive: true });
      const backup = join(dirname(path), 'backups', `pre-instagram-${Date.now()}.sqlite`).replaceAll("'", "''");
      probe.exec(`VACUUM INTO '${backup}'`);
    }
    probe.close();
  }
  const db = openPerformanceStore(path);
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS instagram_schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS instagram_queue (
      instagram_publication_id TEXT PRIMARY KEY, internal_instagram_tracking_id TEXT UNIQUE NOT NULL,
      product_id TEXT NOT NULL REFERENCES products(product_id), product_slug TEXT NOT NULL, cluster TEXT NOT NULL,
      creative_id TEXT, state TEXT NOT NULL CHECK(state IN ('PENDING','CREATIVE_GENERATING','READY','PUBLISHING','PUBLISHED','FAILED_RETRYABLE','FAILED_PERMANENT','SKIPPED')),
      scheduled_day TEXT NOT NULL, suitability_score REAL NOT NULL, suitability_json TEXT NOT NULL,
      product_score REAL NOT NULL, evidence_json TEXT NOT NULL, creative_json TEXT,
      caption TEXT, hook TEXT, asset_path TEXT, public_asset_url TEXT,
      container_id TEXT, media_id TEXT UNIQUE, permalink TEXT, published_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, publish_attempt_at TEXT,
      publish_uncertain INTEGER NOT NULL DEFAULT 0, last_error TEXT, dry_run INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(product_id, scheduled_day, dry_run)
    );
    DROP INDEX IF EXISTS idx_ig_one_live_day;
    CREATE TABLE IF NOT EXISTS instagram_schedule_slots (
      scheduled_day TEXT NOT NULL, scheduled_time TEXT NOT NULL,
      publication_id TEXT UNIQUE REFERENCES instagram_queue(instagram_publication_id),
      status TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(scheduled_day,scheduled_time)
    );
    CREATE TABLE IF NOT EXISTS instagram_metrics (
      metric_key TEXT PRIMARY KEY, media_id TEXT NOT NULL, product_id TEXT REFERENCES products(product_id),
      instagram_tracking_id TEXT, metric_date TEXT NOT NULL, metric_name TEXT NOT NULL,
      metric_value REAL, period TEXT NOT NULL, source TEXT NOT NULL, observed_at TEXT NOT NULL,
      raw_json TEXT, UNIQUE(media_id,metric_date,metric_name,period,source)
    );
    CREATE TABLE IF NOT EXISTS instagram_site_metrics (
      metric_key TEXT PRIMARY KEY, product_id TEXT REFERENCES products(product_id), instagram_tracking_id TEXT,
      metric_date TEXT NOT NULL, visits INTEGER, product_views INTEGER, aliexpress_clicks INTEGER,
      source TEXT NOT NULL, observed_at TEXT NOT NULL, raw_json TEXT
    );
    CREATE TABLE IF NOT EXISTS instagram_commerce (
      order_key TEXT PRIMARY KEY, external_order_id TEXT NOT NULL, product_id TEXT REFERENCES products(product_id),
      instagram_tracking_id TEXT, ordered_at TEXT NOT NULL, status TEXT NOT NULL,
      pending_commission_gbp REAL, confirmed_commission_gbp REAL, attribution_confidence REAL NOT NULL,
      source TEXT NOT NULL, observed_at TEXT NOT NULL, raw_json TEXT
    );
    CREATE TABLE IF NOT EXISTS instagram_cluster_performance (
      cluster TEXT NOT NULL, window_days INTEGER NOT NULL, calculated_at TEXT NOT NULL,
      metrics_json TEXT NOT NULL, performance_multiplier REAL NOT NULL, status TEXT NOT NULL,
      PRIMARY KEY(cluster,window_days)
    );
    CREATE TABLE IF NOT EXISTS instagram_health (
      name TEXT PRIMARY KEY, status TEXT NOT NULL, checked_at TEXT NOT NULL, detail TEXT
    );
    CREATE TABLE IF NOT EXISTS instagram_publication_lifecycle (
      instagram_publication_id TEXT PRIMARY KEY REFERENCES instagram_queue(instagram_publication_id),
      kind TEXT NOT NULL CHECK(kind IN ('LIVE','TEST')),
      availability TEXT NOT NULL CHECK(availability IN ('ACTIVE','DELETION_PENDING','DELETED','UNAVAILABLE')),
      updated_at TEXT NOT NULL, reason TEXT
    );
    INSERT OR IGNORE INTO instagram_schema_migrations VALUES(1,datetime('now'));
    COMMIT;
  `);
  const queueColumns = new Set(db.prepare('PRAGMA table_info(instagram_queue)').all().map((column) => column.name));
  for (const [name, definition] of [
    ['hashtags_json', 'TEXT'],
    ['keywords_json', 'TEXT'],
    ['layout_family', 'TEXT'],
    ['category', 'TEXT'],
  ]) if (!queueColumns.has(name)) db.exec(`ALTER TABLE instagram_queue ADD COLUMN ${name} ${definition}`);
  db.prepare('INSERT OR IGNORE INTO instagram_schema_migrations VALUES(2,?)').run(new Date().toISOString());
  return db;
}

export function setHealth(db, name, status, detail = null) {
  db.prepare('INSERT OR REPLACE INTO instagram_health VALUES(?,?,?,?)').run(name, status, new Date().toISOString(), detail);
}
