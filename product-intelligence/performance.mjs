import config from './config.json' with { type: 'json' };
import { calculateEarningsPerThousandPinterestImpressions } from './scoring.mjs';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const safeRate = (numerator, denominator) => Number(denominator) > 0 ? Number(numerator || 0) / Number(denominator) : null;
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function enrichPerformanceEvent(event) {
  return {
    ...event,
    pinterestSaveRate: safeRate(event.pinterestSaves, event.pinterestImpressions),
    pinterestPinClickRate: safeRate(event.pinterestPinClicks, event.pinterestImpressions),
    pinterestOutboundClickRate: safeRate(event.pinterestOutboundClicks, event.pinterestImpressions),
    websiteVisitRate: safeRate(event.websiteVisits, event.pinterestImpressions),
    aliexpressClickThroughRate: safeRate(event.aliexpressClicks, event.websiteVisits),
    orderConversionRate: safeRate(event.aliexpressOrders, event.aliexpressClicks),
    earningsPerThousandPinterestImpressions: calculateEarningsPerThousandPinterestImpressions(event),
  };
}

export function scoreClusters(events) {
  const enriched = events.map(enrichPerformanceEvent);
  const accountEpmi = average(enriched.map((event) => event.earningsPerThousandPinterestImpressions).filter(Number.isFinite));
  const accountOutbound = average(enriched.map((event) => event.pinterestOutboundClickRate).filter(Number.isFinite));
  const accountConversion = average(enriched.map((event) => event.orderConversionRate).filter(Number.isFinite));
  const groups = Map.groupBy(enriched, (event) => event.cluster || 'unclassified');
  return [...groups.entries()].map(([cluster, rows]) => {
    const totals = rows.reduce((sum, row) => ({
      impressions: sum.impressions + Number(row.pinterestImpressions || 0),
      outboundClicks: sum.outboundClicks + Number(row.pinterestOutboundClicks || 0),
      aliexpressClicks: sum.aliexpressClicks + Number(row.aliexpressClicks || 0),
      orders: sum.orders + Number(row.aliexpressOrders || 0),
      earnings: sum.earnings + Number(row.affiliateCommissionEarnedGbp || 0),
    }), { impressions: 0, outboundClicks: 0, aliexpressClicks: 0, orders: 0, earnings: 0 });
    const epmi = totals.impressions ? totals.earnings / totals.impressions * 1000 : null;
    const outboundRate = safeRate(totals.outboundClicks, totals.impressions);
    const conversionRate = safeRate(totals.orders, totals.aliexpressClicks);
    const enoughData = totals.impressions >= config.performance.minimumClusterImpressions;
    const relative = (value, baseline) => Number.isFinite(value) && Number.isFinite(baseline) && baseline > 0 ? clamp(value / baseline, 0, 2) / 2 : 0.5;
    const performanceScore = enoughData
      ? Math.round((relative(epmi, accountEpmi) * 0.55 + relative(outboundRate, accountOutbound) * 0.25 + relative(conversionRate, accountConversion) * 0.2) * 100)
      : 50;
    const multiplier = enoughData
      ? clamp(0.75 + performanceScore / 100 * 0.6, config.performance.minimumSearchPriorityMultiplier, config.performance.maximumSearchPriorityMultiplier)
      : 1;
    return {
      cluster,
      enoughData,
      productCount: rows.length,
      totals,
      outboundClickRate: outboundRate,
      conversionRate,
      earningsPerThousandPinterestImpressions: epmi === null ? null : Number(epmi.toFixed(2)),
      performanceScore,
      searchPriorityMultiplier: Number(multiplier.toFixed(2)),
      diversityRule: `Do not select this cluster more than ${config.performance.maximumConsecutiveClusterWins} times consecutively.`,
    };
  }).sort((a, b) => b.performanceScore - a.performanceScore);
}
