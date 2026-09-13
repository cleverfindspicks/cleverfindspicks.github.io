import config from './config.json' with { type: 'json' };

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const round = (value, digits = 1) => Number(value.toFixed(digits));
const known = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const scale = (value, low, high) => clamp((Number(value) - low) / (high - low));

function demandScore(volume) {
  if (!known(volume)) return null;
  return clamp(Math.log10(Number(volume) + 1) / Math.log10(10001));
}

function feedbackScore(feedback) {
  if (!known(feedback)) return null;
  return scale(feedback, 90, 100);
}

function commissionRateScore(rate) {
  if (!known(rate)) return null;
  return scale(rate, 3, 12);
}

function estimatedCommissionScore(amount) {
  if (!known(amount)) return null;
  return scale(amount, config.hardFilters.minimumEstimatedCommissionGbp, 5);
}

function priceFitScore(price, expectedBand) {
  if (!known(price) || !expectedBand || !known(expectedBand.min) || !known(expectedBand.max)) return null;
  const numeric = Number(price);
  const min = Number(expectedBand.min);
  const max = Number(expectedBand.max);
  if (numeric >= min && numeric <= max) return 1;
  if (numeric < min) return clamp(numeric / min);
  return clamp(1 - (numeric - max) / Math.max(max, 1));
}

function shippingScore(shipping) {
  if (!shipping?.verified || shipping.available !== true) return null;
  const days = known(shipping.daysMax) ? Number(shipping.daysMax) : null;
  const cost = known(shipping.costGbp) ? Number(shipping.costGbp) : null;
  const speed = days === null ? 0.5 : clamp(1 - Math.max(0, days - 5) / 20);
  const costScore = cost === null ? 0.5 : clamp(1 - cost / 12);
  return (speed + costScore) / 2;
}

function factorMap(candidate) {
  const estimatedCommission = known(candidate.metrics?.commissionAmountGbp)
    ? Number(candidate.metrics.commissionAmountGbp)
    : known(candidate.metrics?.priceGbp) && known(candidate.metrics?.commissionRatePct)
      ? Number(candidate.metrics.priceGbp) * Number(candidate.metrics.commissionRatePct) / 100
      : null;
  return {
    recentDemand: demandScore(candidate.metrics?.recentVolume),
    positiveFeedback: feedbackScore(candidate.metrics?.feedbackPct),
    commissionRate: commissionRateScore(candidate.metrics?.commissionRatePct),
    estimatedCommission: estimatedCommissionScore(estimatedCommission),
    priceFit: priceFitScore(candidate.metrics?.priceGbp, candidate.expectedPriceBandGbp),
    valueForMoney: candidate.factors?.valueForMoney ?? null,
    ukSuitability: candidate.factors?.ukSuitability ?? null,
    shipping: shippingScore(candidate.shipping),
    sellerReliability: candidate.seller?.verified ? candidate.seller.reliabilityScore : null,
    smallSpaceRelevance: candidate.factors?.smallSpaceRelevance ?? null,
    visualAppeal: candidate.factors?.visualAppeal ?? null,
    impulsePurchase: candidate.factors?.impulsePurchase ?? null,
    obviousProblem: candidate.factors?.obviousProblem ?? null,
    novelty: known(candidate.duplicateSimilarity) ? 1 - Number(candidate.duplicateSimilarity) : null,
  };
}

function hardFilters(candidate, totalScore, confidence, { existingProduct = false } = {}) {
  const reject = [];
  const review = [];
  const h = config.hardFilters;
  const price = known(candidate.metrics?.priceGbp) ? Number(candidate.metrics.priceGbp) : null;
  const rate = known(candidate.metrics?.commissionRatePct) ? Number(candidate.metrics.commissionRatePct) : null;
  const amount = known(candidate.metrics?.commissionAmountGbp)
    ? Number(candidate.metrics.commissionAmountGbp)
    : known(price) && known(rate) ? price * rate / 100 : null;

  if (!candidate.productId) review.push('Product ID is missing; the exact listing cannot be re-queried.');
  if (!known(candidate.metrics?.feedbackPct)) review.push('Feedback is unknown.');
  else if (Number(candidate.metrics.feedbackPct) < h.minimumFeedbackPct) reject.push(`Feedback is below ${h.minimumFeedbackPct}%.`);
  if (known(price) && price < h.minimumPriceGbp && (!known(amount) || amount < h.minimumEstimatedCommissionGbp)) reject.push('Price is too low to produce a meaningful expected commission.');
  if (known(amount) && amount < h.minimumEstimatedCommissionGbp) reject.push(`Estimated commission is below £${h.minimumEstimatedCommissionGbp}.`);
  if (known(price) && price > h.maximumUnverifiedPriceGbp && candidate.listing?.priceVerifiedForShownVariant !== true) reject.push('High price is not verified for the pictured product and quantity.');
  if (candidate.expectedPriceBandGbp && known(price) && price > Number(candidate.expectedPriceBandGbp.max) * 1.5) reject.push('Price is an extreme outlier for this product type.');
  if (candidate.listing?.variantClarity === false) reject.push('Listing uses an unclear or misleading variant/quantity.');
  else if (candidate.listing?.variantClarity !== true) review.push('Variant and quantity are not verified.');
  if (candidate.shipping?.available === false) reject.push('Not available for UK delivery.');
  else if (!candidate.shipping?.verified) review.push('UK shipping cost and delivery time are unknown.');
  else if (known(candidate.shipping.daysMax) && Number(candidate.shipping.daysMax) > h.maximumShippingDays) reject.push('UK delivery time is too slow.');
  if (!candidate.seller?.verified) review.push('Seller reliability is unknown.');
  if ((candidate.factors?.smallSpaceRelevance ?? 0) < h.minimumSmallSpaceRelevance) reject.push('Weak relevance to small-space organisation.');
  if ((candidate.factors?.obviousProblem ?? 0) < h.minimumObviousProblem) reject.push('The image does not communicate an obvious problem and solution quickly enough.');
  if (known(candidate.duplicateSimilarity) && Number(candidate.duplicateSimilarity) > h.maximumDuplicateSimilarity) reject.push('Too similar to a recently published product.');
  if (!existingProduct) {
    const aspect = known(candidate.pinCreative?.width) && known(candidate.pinCreative?.height)
      ? Number(candidate.pinCreative.height) / Number(candidate.pinCreative.width)
      : null;
    if (!candidate.pinCreative?.path || !candidate.pinCreative?.reviewedNonClickbait || aspect === null || aspect < h.minimumPinAspectRatioHeightToWidth) reject.push('A reviewed custom vertical Pinterest image is required.');
    if (totalScore < h.minimumPublishScore) reject.push(`Score is below ${h.minimumPublishScore}.`);
    if (confidence < h.minimumConfidence) reject.push(`Data confidence is below ${Math.round(h.minimumConfidence * 100)}%.`);
    if (review.length) reject.push('Manual verification is required before publication.');
  }
  return { reject: [...new Set(reject)], review: [...new Set(review)] };
}

export function scoreCandidate(candidate, options = {}) {
  const factors = factorMap(candidate);
  let total = 0;
  let knownWeight = 0;
  const breakdown = {};
  for (const [name, weight] of Object.entries(config.weights)) {
    const raw = factors[name];
    const points = raw === null || raw === undefined ? 0 : clamp(Number(raw)) * weight;
    if (raw !== null && raw !== undefined) knownWeight += weight;
    total += points;
    breakdown[name] = { value: raw === null || raw === undefined ? 'unknown' : round(Number(raw), 3), weight, points: round(points) };
  }
  const totalScore = round(total);
  const confidence = round(knownWeight / 100, 2);
  const filters = hardFilters(candidate, totalScore, confidence, options);
  let decision = filters.reject.length ? 'reject' : filters.review.length ? 'questionable' : 'keep';
  if (options.existingProduct && !filters.reject.length && totalScore >= 55) decision = 'keep';
  return {
    ...candidate,
    scoreBreakdown: breakdown,
    totalScore,
    confidence,
    decision,
    rejectionReason: filters.reject.length ? filters.reject.join(' ') : null,
    reviewNotes: filters.review,
  };
}

export function scoreCandidates(candidates, options = {}) {
  return candidates.map((candidate) => scoreCandidate(candidate, options)).sort((a, b) => b.totalScore - a.totalScore);
}

export function calculateEarningsPerThousandPinterestImpressions(event) {
  if (!known(event?.pinterestImpressions) || Number(event.pinterestImpressions) <= 0 || !known(event?.affiliateCommissionEarnedGbp)) return null;
  return round(Number(event.affiliateCommissionEarnedGbp) / Number(event.pinterestImpressions) * 1000, 2);
}
