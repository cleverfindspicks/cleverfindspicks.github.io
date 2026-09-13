# Clever Finds Product Intelligence

This layer is deliberately separate from the production catalogue, RSS and GitHub Pages deployment. It can analyse candidates now without changing what is published.

## Workflow

1. `pnpm intelligence:search` runs all configured sub-niche queries against the AliExpress Affiliate API, deduplicates by product ID and stores every returned candidate in `data/candidate-pool.json`. Clusters with proven performance receive deeper search pages; insufficient-data clusters remain neutral.
2. Product Detail requests re-query the exact product IDs with `country=GB`, GBP and English. A returned exact ID, a matching current GBP price and GB market availability are required. Shipping cost/method/time and seller reliability remain `UNAVAILABLE_FROM_SOURCE` when the API omits them; they reduce confidence but do not masquerade as verified facts.
3. Qualification calculates the 100-point score and applies the hard filters without requiring a creative. Only a provisional winner proceeds to creative generation; the final publication gate then requires a reviewed vertical pin, complete landing-page content, RSS data and a valid affiliate URL.
4. `pnpm intelligence:select -- <verified-candidates.json>` compares every verified candidate, applies the cluster-performance multiplier and diversity cap, records the winner and its selection reason, and performs no publication.
5. Only after a candidate passes should the existing publication workflow copy approved content to `app/products.ts`. This repository does not do that automatically yet.
6. `pnpm intelligence:performance` converts performance events into cluster scores and search-priority multipliers. No cluster receives a boost before it reaches 1,000 impressions, and a diversity cap prevents repetitive publishing.

## Score (100 points)

| Factor | Weight |
|---|---:|
| Recent demand | 8 |
| Positive feedback | 7 |
| Commission rate | 6 |
| Estimated commission amount | 7 |
| Price fit | 6 |
| Value for money | 6 |
| UK suitability | 5 |
| Verified shipping | 7 |
| Verified seller reliability | 4 |
| Small-space relevance | 8 |
| Pinterest visual appeal | 7 |
| Impulse purchase likelihood | 5 |
| Obvious problem/solution | 6 |
| Novelty versus recent products | 5 |
| Buyer intent | 7 |
| Competition opportunity | 6 |

Unknown factors receive zero points and reduce `confidence`. Required evidence contributes 85% of confidence, editorial factors 10% and optional source signals 5%, so missing optional shipping/seller details cannot be confused with a perfect evidence record.

## Hard gates

The defaults in `config.json` reject missing/weak feedback, missing demand, missing/negligible commission, extreme or unverified prices, an exact-ID or GB-market mismatch, weak niche relevance, unclear problem/solution, excessive similarity, a score below 65, confidence below 75%, or a missing reviewed vertical pin at publication time. LOW-risk listings may qualify without SKU-level data. HIGH-risk listings with ambiguous packs, variants or pricing are rejected until the exact offer is clear.

## Dry-run funnel

`pnpm intelligence:dry-run` records each step from candidate discovery through exact ID, GB availability, price sanity, demand/feedback, niche intent, profitability, duplicate checks, score threshold and final qualification. It also creates `data/provisional-publication-bundle.json` only when the provisional winner has a reviewed creative; validate that bundle with `pnpm intelligence:gate product-intelligence/data/provisional-publication-bundle.json`. The dry run never edits the live catalogue.

## Analytics and learning readiness

`data/performance-events.json` accepts Pinterest impressions, saves, pin clicks, outbound clicks, website visits, AliExpress clicks, orders and earned commission. The derived metrics include CTR, conversion rate and earnings per 1,000 Pinterest impressions (EPMI). Cluster performance is weighted primarily toward EPMI, then outbound CTR and order conversion—not impressions alone.

The feedback loop is structurally ready but inactive until real analytics and affiliate outcome data are imported. Empty or insufficient data leaves search priority neutral.

## Current catalogue audit

Run `pnpm intelligence:audit`. Results are written to:

- `data/evaluations.json` — full score breakdown and rejection/review reasons.
- `reports/current-products-audit.md` — readable table for the 14 currently published products.

This audit never edits or removes current products.
