# Clever Finds production operations

Clever Finds is a static affiliate editorial site for UK Pinterest users interested in small-home organisation. The 14 legacy pages and their affiliate URLs are intentionally preserved. New products are generated separately in `app/generated-products.json` only after every publication gate passes.

## Architecture and automation flow

`AliExpress Affiliate API → multi-query candidate pool → evidence verification → 100-point score → hard filters → similarity/diversity → performance multiplier → winner → reviewed 1000×1500 creative → landing/RSS bundle → atomic build → GitHub Pages → Pinterest RSS`

The scheduled automation runs at 15:00, 19:00 and 22:00 Asia/Riyadh. Each slot is independent. It runs `pnpm intelligence:automation`. If no candidate has fresh exact-product, variant, quantity, price and GB-shipping evidence plus a valid affiliate URL and reviewed vertical creative, the result is `SKIPPED_NO_QUALIFIED_PRODUCT`; there is no legacy or random fallback.

## Scoring and hard filters

`product-intelligence/config.json` contains the editable weights, thresholds, query clusters, diversity limit, exploration rate and retention caps. Weights total 100 and include buyer intent and competition opportunity. Unknown evidence receives no points and reduces confidence. Score ≥65 and confidence ≥75% are necessary but not sufficient: exact listing/variant/quantity, rational verified price, GB shipping, feedback, uniqueness, creative, tracking IDs, landing content, RSS and affiliate host must also pass.

## Analytics and feedback loop

Set public `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-...` at build time to enable GA4. No analytics secret is used in the browser. Pages emit `page_view` through GA4, plus `product_view` and `aliexpress_outbound_click` with stable product/pin attribution. Import Pinterest, website or AliExpress reports with:

`pnpm intelligence:import -- path/to/events.json pinterest`

Sources may be `pinterest`, `website` or `aliexpress`. The performance layer derives save rate, outbound CTR, website→AliExpress CTR, conversion and EPMI. Cluster multipliers stay 1.0 until at least 1,000 impressions; diversity and 20% exploration remain enabled.

## Commands

- `pnpm intelligence:test` — scoring, filters, analytics hooks and publication-bundle tests.
- `pnpm intelligence:dry-run` — analyse the latest candidate pool without publishing.
- `pnpm intelligence:automation` — refresh performance, search all clusters and run the safe dry run.
- `pnpm intelligence:validate` — verify catalogue, RSS, affiliate hosts and tracked-file secret patterns.
- `pnpm build` — build the static GitHub Pages output.
- `pnpm intelligence:publish-approved -- approved-bundle.json` — gate and build one fully approved bundle; it rolls back the generated catalogue if the build fails.

Inspect `product-intelligence/data/dry-run-report.json`, `reports/latest-dry-run.md`, `data/candidate-pool.json`, `data/evaluations.json`, and `data/selection-history.json`. Candidate pool is replaced per run; performance events and run summaries have configured caps so data cannot grow without bound.

## Environment and security

Required for discovery: `ALIEXPRESS_APP_KEY` and `ALIEXPRESS_APP_SECRET` in ignored `.env.local`. Optional: `NEXT_PUBLIC_GA_MEASUREMENT_ID`. Never commit `.env*`, GitHub credentials, API secrets or analytics credentials. Pinterest and AliExpress outcome APIs are adapters/imports until official credentials and report access are supplied.

## Pause, resume, deploy and rollback

Pause or resume the `clever-finds` Codex automation in the Automations UI; do not alter the three-slot schedule. Deployment keeps the existing `cleverfindspicks.github.io` GitHub Pages repository and domain. To roll back source, switch to commit `9f932d7` or the checkpoint branch, rebuild, and publish that exact output. Never delete old pages or slugs.
