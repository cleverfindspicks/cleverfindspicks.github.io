# Clever Finds Product Intelligence

This layer is deliberately separate from the production catalogue, RSS and GitHub Pages deployment. It can analyse candidates now without changing what is published.

## Workflow

1. `pnpm intelligence:search` runs all configured sub-niche queries against the AliExpress Affiliate API, deduplicates by product ID and stores every returned candidate in `data/candidate-pool.json`. Clusters with proven performance receive deeper search pages; insufficient-data clusters remain neutral.
2. An editor or agent verifies the exact variant, UK delivery, seller evidence, expected price band, visual quality, problem clarity and similarity to recent products. Unknown evidence stays `null`; it is never invented.
3. `pnpm intelligence:check -- <candidate.json>` calculates the 100-point score and applies hard filters. Any unknown required verification, weak score, misleading variant or missing custom vertical pin blocks a new publication.
4. `pnpm intelligence:select -- <verified-candidates.json>` compares every verified candidate, applies the cluster-performance multiplier and diversity cap, records the winner and its selection reason, and performs no publication.
5. Only after a candidate passes should the existing publication workflow copy approved content to `app/products.ts`. This repository does not do that automatically yet.
6. `pnpm intelligence:performance` converts performance events into cluster scores and search-priority multipliers. No cluster receives a boost before it reaches 1,000 impressions, and a diversity cap prevents repetitive publishing.

## Score (100 points)

| Factor | Weight |
|---|---:|
| Recent demand | 12 |
| Positive feedback | 10 |
| Commission rate | 10 |
| Estimated commission amount | 10 |
| Price fit | 8 |
| Value for money | 8 |
| UK suitability | 6 |
| Verified shipping | 6 |
| Verified seller reliability | 5 |
| Small-space relevance | 8 |
| Pinterest visual appeal | 5 |
| Impulse purchase likelihood | 4 |
| Obvious problem/solution | 4 |
| Novelty versus recent products | 4 |

Unknown factors receive zero points and reduce `confidence`. This is intentional: the model must prefer evidence over optimistic guesses.

## Hard gates

The defaults in `config.json` reject weak feedback, negligible commission, extreme or unverified prices, unclear variants, poor/unknown UK shipping, weak niche relevance, unclear problem/solution, excessive similarity, a score below 65, confidence below 75%, or a missing reviewed vertical pin. The exact listing ID is also required for re-checking.

## Analytics and learning readiness

`data/performance-events.json` accepts Pinterest impressions, saves, pin clicks, outbound clicks, website visits, AliExpress clicks, orders and earned commission. The derived metrics include CTR, conversion rate and earnings per 1,000 Pinterest impressions (EPMI). Cluster performance is weighted primarily toward EPMI, then outbound CTR and order conversion—not impressions alone.

The feedback loop is structurally ready but inactive until real analytics and affiliate outcome data are imported. Empty or insufficient data leaves search priority neutral.

## Current catalogue audit

Run `pnpm intelligence:audit`. Results are written to:

- `data/evaluations.json` — full score breakdown and rejection/review reasons.
- `reports/current-products-audit.md` — readable table for the 14 currently published products.

This audit never edits or removes current products.
