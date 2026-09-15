import config from './config.json' with { type: 'json' };

const weights = { visualAppeal: 18, problemSolutionClarity: 18, twoSecondClarity: 14, creativeFeasibility: 12, buyerIntent: 10, novelty: 8, ukSmallHomeFit: 10, explanationSimplicity: 5, verticalReelAppeal: 5 };
const clamp = (n) => Number.isFinite(Number(n)) ? Math.max(0, Math.min(1, Number(n))) : 0;
export function instagramSuitability(candidate, { recentProductIds = [] } = {}) {
  const factors = candidate.factors || {};
  // These are transparent editorial heuristics, not measured viewer behaviour.
  // No fabricated visual analysis: use existing evidence and conservative values.
  const clear = clamp(factors.obviousProblem);
  const visual = clamp(factors.visualAppeal);
  const supportedSource = /^https:\/\/[^/]+\.aliexpress-media\.com\//.test(candidate.image || '') || /^https:\/\/ae-pic[^/]*\.aliexpress-media\.com\//.test(candidate.image || '');
  const values = {
    visualAppeal: visual, problemSolutionClarity: clear, twoSecondClarity: Math.min(clear, visual + 0.08),
    creativeFeasibility: supportedSource ? 0.9 : 0,
    buyerIntent: clamp(factors.buyerIntent), novelty: recentProductIds.includes(String(candidate.productId)) ? 0 : 1,
    ukSmallHomeFit: Math.min(clamp(factors.ukSuitability), clamp(factors.smallSpaceRelevance)),
    explanationSimplicity: clear * 0.9, verticalReelAppeal: visual,
  };
  const breakdown = Object.fromEntries(Object.entries(weights).map(([key, weight]) => [key, { value: Number(values[key].toFixed(3)), weight, points: Number((values[key] * weight).toFixed(2)) }]));
  const total = Number(Object.values(breakdown).reduce((sum, row) => sum + row.points, 0).toFixed(1));
  const reasons = [];
  if (!supportedSource) reasons.push('NO_VERIFIABLE_ORIGINAL_PRODUCT_IMAGE');
  if (clear < 0.65) reasons.push('PROBLEM_SOLUTION_NOT_CLEAR');
  if (values.ukSmallHomeFit < 0.65) reasons.push('INSUFFICIENT_UK_SMALL_HOME_FIT');
  if (!values.novelty) reasons.push('RECENT_INSTAGRAM_DUPLICATE');
  if (total < config.selection.minimumSuitabilityScore) reasons.push('BELOW_INSTAGRAM_SUITABILITY_THRESHOLD');
  return { totalScore: total, breakdown, qualified: reasons.length === 0, rejectionReasons: reasons, method: 'Evidence-based editorial heuristics; not measured two-second retention.' };
}

export function instagramMultiplier(metrics, settings = config.performance) {
  if (metrics.posts < settings.minimumPosts || (metrics.views ?? 0) < settings.minimumViews || (metrics.visits ?? 0) < settings.minimumAttributedVisits) return 1;
  const clicks = metrics.aliexpressClicks;
  // Likes cannot change commercial priority; attribution is required for orders.
  const commercial = metrics.confirmedCommissionGbp !== null && clicks >= settings.minimumAliExpressClicks
    ? metrics.confirmedCommissionGbp / Math.max(1, clicks) : null;
  const orders = metrics.orders;
  const signal = commercial !== null ? Math.tanh(commercial)
    : orders != null && clicks >= settings.minimumAliExpressClicks ? Math.tanh(orders / Math.max(1, clicks) * 10) * 0.8
    : clicks != null ? Math.min(1, clicks / Math.max(1, metrics.visits)) * 0.5
    : metrics.visits != null ? Math.min(1, metrics.visits / Math.max(1, metrics.views)) * 0.25
    : metrics.saves != null || metrics.shares != null ? Math.min(1, ((metrics.saves ?? 0)+(metrics.shares ?? 0))/Math.max(1,metrics.views)) * 0.1 : 0;
  return Number(Math.max(settings.minimumMultiplier, Math.min(settings.maximumMultiplier, 1 + signal * 0.1)).toFixed(3));
}
