import assert from 'node:assert/strict';
import config from './config.json' with { type: 'json' };
import { calculateEarningsPerThousandPinterestImpressions, scoreCandidate } from './scoring.mjs';
import { scoreClusters } from './performance.mjs';

assert.equal(Object.values(config.weights).reduce((sum, value) => sum + value, 0), 100, 'Weights must total 100.');

const strong = {
  productId: 'EXAMPLE-1',
  cluster: 'under-sink-storage',
  metrics: { priceGbp: 24, feedbackPct: 98.7, recentVolume: 3200, commissionRatePct: 9, commissionAmountGbp: 2.16 },
  expectedPriceBandGbp: { min: 15, max: 40 },
  shipping: { available: true, costGbp: 0, daysMax: 9, verified: true },
  seller: { reliabilityScore: 0.9, verified: true },
  listing: { variantClarity: true, priceVerifiedForShownVariant: true },
  factors: { valueForMoney: 0.9, ukSuitability: 0.9, smallSpaceRelevance: 0.95, visualAppeal: 0.9, impulsePurchase: 0.8, obviousProblem: 0.95 },
  duplicateSimilarity: 0.15,
  pinCreative: { path: 'public/pinterest/example-pin.png', width: 1000, height: 1500, reviewedNonClickbait: true },
};

assert.equal(scoreCandidate(strong).decision, 'keep', 'A complete strong candidate should pass.');
assert.equal(scoreCandidate({ ...strong, shipping: { verified: false } }).decision, 'reject', 'Unknown UK shipping must block publication.');
assert.equal(scoreCandidate({ ...strong, duplicateSimilarity: 0.9 }).decision, 'reject', 'A near duplicate must be rejected.');
assert.equal(scoreCandidate({ ...strong, pinCreative: null }).decision, 'reject', 'A missing custom vertical pin must be rejected.');
assert.equal(scoreCandidate({ ...strong, metrics: { ...strong.metrics, priceGbp: 150 }, listing: { variantClarity: false, priceVerifiedForShownVariant: false } }).decision, 'reject', 'An unclear high-price variant must be rejected.');
assert.equal(calculateEarningsPerThousandPinterestImpressions({ pinterestImpressions: 5000, affiliateCommissionEarnedGbp: 25 }), 5);

const clusters = scoreClusters([
  { cluster: 'under-sink-storage', pinterestImpressions: 2000, pinterestOutboundClicks: 100, aliexpressClicks: 60, aliexpressOrders: 6, affiliateCommissionEarnedGbp: 30 },
  { cluster: 'drawer-organisation', pinterestImpressions: 2000, pinterestOutboundClicks: 40, aliexpressClicks: 25, aliexpressOrders: 1, affiliateCommissionEarnedGbp: 4 },
]);
assert.equal(clusters[0].cluster, 'under-sink-storage');
assert.ok(clusters[0].searchPriorityMultiplier > clusters[1].searchPriorityMultiplier);

console.log(JSON.stringify({ ok: true, assertions: 8 }));
