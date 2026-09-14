import config from './config.json' with { type: 'json' };

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const safeRate = (numerator, denominator) => Number.isFinite(Number(denominator)) && Number(denominator) > 0 && Number.isFinite(Number(numerator))
  ? Number(numerator) / Number(denominator) : null;
export const epmi = (commission, impressions) => safeRate(commission, impressions) === null ? null : Number(commission) / Number(impressions) * 1000;

export function normalizeOrderStatus(value) {
  const status = String(value || 'pending').toLowerCase();
  if (['completed', 'confirmed', 'validated'].includes(status)) return 'completed';
  if (['cancelled', 'refunded', 'invalid'].includes(status)) return status;
  return 'pending';
}

export function commissionByStatus(status, commission) {
  const amount = Number.isFinite(Number(commission)) ? Number(commission) : null;
  return {
    pendingCommissionGbp: status === 'pending' ? amount : status === 'completed' ? 0 : 0,
    confirmedCommissionGbp: status === 'completed' ? amount : 0,
  };
}

export function isExplorationRun(runId, rate = config.performance.explorationRate) {
  const bucket = Array.from(String(runId)).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 10000, 0) / 10000;
  return bucket < rate;
}

export function performanceMetrics(row) {
  const impressions = row.impressions ?? row.pinterestImpressions ?? null;
  const pinterestOutboundClicks = row.pinterestOutboundClicks ?? null;
  const productViews = row.productViews ?? row.websiteVisits ?? null;
  const aliexpressClicks = row.aliexpressClicks ?? null;
  const orders = row.orders ?? row.aliexpressOrders ?? null;
  const confirmedCommissionGbp = row.confirmedCommissionGbp ?? row.affiliateCommissionEarnedGbp ?? null;
  return {
    ...row,
    pinterestOutboundCtr: safeRate(pinterestOutboundClicks, impressions),
    websiteToAliExpressCtr: safeRate(aliexpressClicks, productViews),
    clickToOrderCvr: safeRate(orders, aliexpressClicks),
    commissionPerClick: safeRate(confirmedCommissionGbp, aliexpressClicks),
    earningsPerThousandPinterestImpressions: epmi(confirmedCommissionGbp, impressions),
  };
}

export const enrichPerformanceEvent = performanceMetrics;

function sumKnown(rows, field) {
  const values = rows.map((row) => row[field]).filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)));
  return values.length ? values.reduce((sum, value) => sum + Number(value), 0) : null;
}

function commercialSignal(metrics, baselines) {
  const ratio = (value, baseline) => value !== null && baseline !== null && baseline > 0 ? clamp(value / baseline, 0, 2) / 2 : null;
  const signals = [
    [ratio(metrics.earningsPerThousandPinterestImpressions, baselines.epmi), 0.45],
    [ratio(metrics.commissionPerClick, baselines.commissionPerClick), 0.2],
    [ratio(metrics.clickToOrderCvr, baselines.cvr), 0.2],
    [ratio(metrics.websiteToAliExpressCtr, baselines.websiteCtr), 0.1],
    [ratio(metrics.pinterestOutboundCtr, baselines.pinterestCtr), 0.05],
  ].filter(([value]) => value !== null);
  if (!signals.length) return null;
  const weight = signals.reduce((sum, [, itemWeight]) => sum + itemWeight, 0);
  return signals.reduce((sum, [value, itemWeight]) => sum + value * itemWeight, 0) / weight;
}

export function aggregateClusters(rows, options = {}) {
  const minimumImpressions = options.minimumClusterImpressions ?? config.performance.minimumClusterImpressions;
  const minimumPins = options.minimumPublishedPins ?? config.performance.minimumPublishedPins;
  const minimumClicks = options.minimumOutboundClicksForConversion ?? config.performance.minimumOutboundClicksForConversion;
  const minimumMultiplier = options.minimumSearchPriorityMultiplier ?? config.performance.minimumSearchPriorityMultiplier;
  const maximumMultiplier = options.maximumSearchPriorityMultiplier ?? config.performance.maximumSearchPriorityMultiplier;
  const groups = Map.groupBy(rows, (row) => row.cluster || 'unclassified');
  const account = performanceMetrics({
    impressions: sumKnown(rows, 'impressions'), pinterestOutboundClicks: sumKnown(rows, 'pinterestOutboundClicks'),
    productViews: sumKnown(rows, 'productViews'), aliexpressClicks: sumKnown(rows, 'aliexpressClicks'),
    orders: sumKnown(rows, 'orders'), confirmedCommissionGbp: sumKnown(rows, 'confirmedCommissionGbp'),
  });
  const baselines = { epmi: account.earningsPerThousandPinterestImpressions, commissionPerClick: account.commissionPerClick, cvr: account.clickToOrderCvr, websiteCtr: account.websiteToAliExpressCtr, pinterestCtr: account.pinterestOutboundCtr };
  return [...groups.entries()].map(([cluster, items]) => {
    const totals = performanceMetrics({
      impressions: sumKnown(items, 'impressions'), pinterestOutboundClicks: sumKnown(items, 'pinterestOutboundClicks'),
      productViews: sumKnown(items, 'productViews'), aliexpressClicks: sumKnown(items, 'aliexpressClicks'),
      orders: sumKnown(items, 'orders'), pendingCommissionGbp: sumKnown(items, 'pendingCommissionGbp'),
      confirmedCommissionGbp: sumKnown(items, 'confirmedCommissionGbp'),
    });
    const publishedPins = new Set(items.map((row) => row.pinTrackingId).filter(Boolean)).size || items.length;
    const enoughTopFunnel = Number(totals.impressions || 0) >= minimumImpressions && publishedPins >= minimumPins;
    const enoughConversion = Number(totals.aliexpressClicks || 0) >= minimumClicks;
    const signal = enoughTopFunnel ? commercialSignal({ ...totals, clickToOrderCvr: enoughConversion ? totals.clickToOrderCvr : null }, baselines) : null;
    const confidence = enoughTopFunnel ? clamp(Math.min(1, Number(totals.impressions) / (minimumImpressions * 4)) * 0.6 + Math.min(1, publishedPins / (minimumPins * 2)) * 0.4, 0, 1) : 0;
    const rawMultiplier = signal === null ? 1 : 1 + (signal - 0.5) * 0.3 * confidence;
    return {
      cluster, publishedPins, totals, sampleConfidence: Number(confidence.toFixed(3)), enoughData: enoughTopFunnel,
      conversionSampleEnough: enoughConversion, performanceScore: signal === null ? null : Number((signal * 100).toFixed(1)),
      searchPriorityMultiplier: Number(clamp(rawMultiplier, minimumMultiplier, maximumMultiplier).toFixed(3)),
      status: enoughTopFunnel ? 'ACTIVE' : 'INSUFFICIENT_DATA',
      diversityRule: `Do not select this cluster more than ${config.performance.maximumConsecutiveClusterWins} times consecutively.`,
    };
  }).sort((a, b) => (b.performanceScore ?? -1) - (a.performanceScore ?? -1));
}

export function scoreClusters(events) {
  return aggregateClusters(events.map((event) => ({
    ...event, impressions: event.pinterestImpressions ?? null,
    pinterestOutboundClicks: event.pinterestOutboundClicks ?? null,
    productViews: event.websiteVisits ?? null, orders: event.aliexpressOrders ?? null,
    confirmedCommissionGbp: event.affiliateCommissionEarnedGbp ?? null,
    pinTrackingId: event.pinTrackingId || event.trackingId,
  })));
}
