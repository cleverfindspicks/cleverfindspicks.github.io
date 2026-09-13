import assert from 'node:assert/strict';
import config from './config.json' with { type: 'json' };
import { calculateEarningsPerThousandPinterestImpressions, scoreCandidate } from './scoring.mjs';
import { scoreClusters } from './performance.mjs';
import { validatePublicationBundle } from './publication-gate.mjs';
import { readFile } from 'node:fs/promises';
import { products } from '../app/products.ts';
import { hiddenLegacyRecommendationSlugs } from '../app/catalog-visibility.ts';

assert.equal(Object.values(config.weights).reduce((sum, value) => sum + value, 0), 100, 'Weights must total 100.');

const strong = {
  productId: 'EXAMPLE-1',
  trackingId: 'cfp-example-1',
  pinId: 'pin-cfp-example-1-2026-09-13',
  runId: 'cf-run-test',
  affiliateUrl: 'https://s.click.aliexpress.com/e/example',
  detailVerification: { productIdMatched: true, priceMatched: true },
  cluster: 'under-sink-storage',
  metrics: { priceGbp: 24, feedbackPct: 98.7, recentVolume: 3200, commissionRatePct: 9, commissionAmountGbp: 2.16 },
  expectedPriceBandGbp: { min: 15, max: 40 },
  shipping: { available: true, marketAvailabilityVerified: true, costGbp: 0, daysMax: 9, verified: true },
  seller: { reliabilityScore: 0.9, verified: true },
  listing: { variantRisk: 'LOW', variantClarity: true, priceVerifiedForShownVariant: true },
  priceSanity: { status: 'PASS' },
  factors: { valueForMoney: 0.9, ukSuitability: 0.9, smallSpaceRelevance: 0.95, visualAppeal: 0.9, impulsePurchase: 0.8, obviousProblem: 0.95, buyerIntent: 0.9, competitionSaturation: 0.35 },
  duplicateSimilarity: 0.15,
  pinCreative: { path: 'public/pinterest/example-pin.png', width: 1000, height: 1500, reviewedNonClickbait: true },
};

assert.equal(scoreCandidate(strong).decision, 'keep', 'A complete strong candidate should pass.');
assert.equal(scoreCandidate({ ...strong, shipping: { verified: false } }).decision, 'reject', 'Unknown UK shipping must block publication.');
assert.equal(scoreCandidate({ ...strong, duplicateSimilarity: 0.9 }).decision, 'reject', 'A near duplicate must be rejected.');
assert.equal(scoreCandidate({ ...strong, pinCreative: null }).decision, 'reject', 'A missing custom vertical pin must be rejected.');
assert.equal(scoreCandidate({ ...strong, pinCreative: null }, { stage: 'qualification' }).decision, 'keep', 'Creative is generated after product qualification.');
assert.equal(scoreCandidate({ ...strong, metrics: { ...strong.metrics, feedbackPct: null } }, { stage: 'qualification' }).decision, 'reject', 'Missing expected feedback must block qualification.');
assert.equal(scoreCandidate({ ...strong, metrics: { ...strong.metrics, commissionRatePct: null, commissionAmountGbp: null } }, { stage: 'qualification' }).decision, 'reject', 'Missing commission evidence must block qualification.');
assert.equal(scoreCandidate({ ...strong, metrics: { ...strong.metrics, recentVolume: null } }, { stage: 'qualification' }).decision, 'reject', 'Missing expected demand must block qualification.');
assert.equal(scoreCandidate({ ...strong, shipping: { ...strong.shipping, available: false, marketAvailabilityVerified: false } }, { stage: 'qualification' }).decision, 'reject', 'Unavailable GB offer must block qualification.');
assert.equal(scoreCandidate({ ...strong, shipping: { available: true, marketAvailabilityVerified: true, costGbp: null, daysMax: null, method: null } }, { stage: 'qualification' }).decision, 'keep', 'Unavailable optional shipping details must not block a GB-verified offer.');
assert.equal(scoreCandidate({ ...strong, listing: { variantRisk: 'LOW', variantClarity: true, priceVerifiedForShownVariant: true } }, { stage: 'qualification' }).decision, 'keep', 'Low-risk listings do not require SKU-level detail.');
assert.equal(scoreCandidate({ ...strong, listing: { variantRisk: 'HIGH', variantClarity: false, priceVerifiedForShownVariant: false } }, { stage: 'qualification' }).decision, 'reject', 'Unresolved high-risk variants must block qualification.');
assert.equal(scoreCandidate({ ...strong, priceSanity: { status: 'REJECT', reason: 'Extreme cluster outlier.' } }, { stage: 'qualification' }).decision, 'reject', 'A robust price anomaly must block qualification.');
assert.equal(scoreCandidate({ ...strong, factors: { ...strong.factors, buyerIntent: 0.2 } }).decision, 'reject', 'Weak buyer intent must block publication.');
assert.equal(scoreCandidate({ ...strong, metrics: { ...strong.metrics, priceGbp: 150 }, listing: { variantClarity: false, priceVerifiedForShownVariant: false } }).decision, 'reject', 'An unclear high-price variant must be rejected.');
assert.equal(calculateEarningsPerThousandPinterestImpressions({ pinterestImpressions: 5000, affiliateCommissionEarnedGbp: 25 }), 5);

const clusters = scoreClusters([
  { cluster: 'under-sink-storage', pinterestImpressions: 2000, pinterestOutboundClicks: 100, aliexpressClicks: 60, aliexpressOrders: 6, affiliateCommissionEarnedGbp: 30 },
  { cluster: 'drawer-organisation', pinterestImpressions: 2000, pinterestOutboundClicks: 40, aliexpressClicks: 25, aliexpressOrders: 1, affiliateCommissionEarnedGbp: 4 },
]);
assert.equal(clusters[0].cluster, 'under-sink-storage');
assert.ok(clusters[0].searchPriorityMultiplier > clusters[1].searchPriorityMultiplier);

const validBundle = validatePublicationBundle({ candidate: strong, verification: { productId: strong.productId }, landingPage: { slug: 'example', title: 'Example', summary: 'Summary', affiliateUrl: strong.affiliateUrl }, rssItem: { title: 'Example', link: 'https://cleverfindspicks.github.io/finds/example', image: '/pin.png' } });
assert.equal(validBundle.ok, true);
assert.equal(validatePublicationBundle({ candidate: strong, verification: { productId: 'WRONG' }, landingPage: {}, rssItem: {} }).ok, false);
const productSource = await readFile(new URL('../app/products.ts', import.meta.url), 'utf8');
const rssSource = await readFile(new URL('../app/rss.xml/route.ts', import.meta.url), 'utf8');
const pageSource = await readFile(new URL('../app/finds/[slug]/page.tsx', import.meta.url), 'utf8');
const analyticsSource = await readFile(new URL('../components/affiliate-link.tsx', import.meta.url), 'utf8');
const homeSource = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
assert.equal((productSource.match(/\n  \{\n    slug:/g) || []).length, 14, 'The existing catalogue must remain at 14 products.');
assert.equal(hiddenLegacyRecommendationSlugs.length, 7, 'Exactly the seven legacy rejects must be hidden from recommendation lists.');
assert.ok(hiddenLegacyRecommendationSlugs.every((slug) => products.some((product) => product.slug === slug)), 'Hidden products must remain in the catalogue so their legacy pages keep working.');
assert.match(homeSource, /products\.filter\(\(product\) => isVisibleRecommendation\(product\.slug\)\)/, 'The homepage must filter legacy rejects from recommendations.');
assert.match(rssSource, /product\.pinImage \?\? product\.image/, 'RSS must use the custom pin when available.');
assert.match(pageSource, /AffiliateLink/, 'Landing pages must use the tracked affiliate CTA.');
assert.match(analyticsSource, /aliexpress_outbound_click/, 'Outbound clicks must emit an analytics event.');

console.log(JSON.stringify({ ok: true, assertions: 27 }));
