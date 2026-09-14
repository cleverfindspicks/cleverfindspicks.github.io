# Clever Finds performance system

The production catalogue, scoring, hard filters, Affiliate destination gate, RSS format and publication schedule remain independent from analytics availability.

## Storage

Operational data is stored in `product-intelligence/.local/performance.sqlite` by default. The directory is ignored by Git and is never copied into `public/` or the GitHub Pages build. Override the durable local location with `CF_PERFORMANCE_DB`. `pnpm performance:export` creates an ignored JSON backup under `product-intelligence/reports/`.

The store contains `products`, `publications`, `pins`, `website_metrics`, `pinterest_metrics`, `aliexpress_clicks`, `aliexpress_orders`, `performance_snapshots`, `cluster_performance`, and `automation_runs`. Raw imports retain their source, observation timestamp and original row JSON.

## Attribution and GA4

RSS destinations add `utm_source=pinterest`, `utm_medium=organic`, `utm_campaign=clever_finds`, and the internal `cf_pin` ID. The clean product URL remains the canonical URL and RSS GUID. Browser session storage carries this attribution to `product_view`, `affiliate_cta_visible`, `affiliate_cta_click`, and `aliexpress_outbound_click`; GA uses beacon transport and the Affiliate URL is never rewritten.

Set `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-...` to activate frontend GA4 collection. For automated local reporting through the official GA4 Data API, also provide `GA4_PROPERTY_ID` and a `GOOGLE_APPLICATION_CREDENTIALS` file whose service account has Viewer access. Until then, import an official GA4 CSV/JSON export with `pnpm performance:import:site -- path`.

## Pinterest

Automatic organic Pin analytics uses Pinterest API v5 only. It requires an approved Pinterest developer app, a current OAuth access token in `PINTEREST_ACCESS_TOKEN`, `pins:read` and `user_accounts:read`, and official Pin IDs imported beside the internal `pin_tracking_id`. No UI scraping is used. Without OAuth, import an official Pinterest Analytics CSV/JSON report with `pnpm performance:import:pinterest -- path`.

## AliExpress orders

The current credentials are verified for product discovery and official Affiliate promotion-link generation, but no order-report permission is assumed. Orders therefore remain `IMPORT_ONLY` unless the account exposes and enables an official order API. Import an official Affiliate order report with `pnpm performance:import:aliexpress -- path`. Pending and confirmed commission are separate; cancelled, refunded and invalid rows contribute no confirmed commission.

## Learning safety

Recalculate with `pnpm performance:recalculate`. A cluster remains neutral at `1.0` until it has at least 1,000 impressions and three published Pins. Conversion signal is ignored below 25 AliExpress outbound clicks. Multipliers are bounded to `0.85–1.15`, use downstream commission/orders ahead of impressions, preserve the 20% deterministic exploration mode and retain all diversity caps. Missing data is `Unknown`, never zero or poor performance.

Run the analytics sync once daily (the configured target is 05:00 Asia/Riyadh). Publishing remains at 15:00, 19:00 and 22:00 Asia/Riyadh. Every analytics job is fail-safe and must not block publication.
