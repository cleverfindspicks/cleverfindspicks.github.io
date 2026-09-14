import { aggregateClusters } from './performance.mjs';

const makeRows = (cluster, count, totals) => Array.from({ length: count }, (_, index) => ({ cluster, pinTrackingId: `${cluster}-${index}`, ...totals }));
const rows = [
  ...makeRows('cluster-a-high-impressions-no-sales', 3, { impressions: 33334, pinterestOutboundClicks: 34, productViews: 25, aliexpressClicks: 12, orders: 0, confirmedCommissionGbp: 0 }),
  ...makeRows('cluster-b-commercial-winner', 3, { impressions: 3334, pinterestOutboundClicks: 100, productViews: 80, aliexpressClicks: 60, orders: 4, confirmedCommissionGbp: 16 }),
];
const clusters = aggregateClusters(rows);
const a = clusters.find((item) => item.cluster.startsWith('cluster-a'));
const b = clusters.find((item) => item.cluster.startsWith('cluster-b'));
if (!(b.performanceScore > a.performanceScore && b.searchPriorityMultiplier > a.searchPriorityMultiplier)) throw new Error('Commercial cluster did not beat impression-only cluster.');
if (clusters.some((item) => item.searchPriorityMultiplier < 0.85 || item.searchPriorityMultiplier > 1.15)) throw new Error('Multiplier escaped safety bounds.');
console.log(JSON.stringify({ ok: true, fixtureOnly: true, winner: b.cluster, highImpressionNoSalesScore: a.performanceScore, commercialWinnerScore: b.performanceScore, multipliers: Object.fromEntries(clusters.map((item) => [item.cluster, item.searchPriorityMultiplier])) }));
