import config from './config.json' with { type: 'json' };
import {currencyGate} from './currency.mjs';

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
  if (shipping?.available !== true || shipping?.marketAvailabilityVerified !== true) return null;
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
    buyerIntent: candidate.factors?.buyerIntent ?? null,
    competitionOpportunity: known(candidate.factors?.competitionSaturation) ? 1 - Number(candidate.factors.competitionSaturation) : null,
  };
}

function hardFilters(candidate, totalScore, confidence, { existingProduct = false, stage = 'publication' } = {}) {
  const reject = [];
  const review = [];
  const h = config.hardFilters;
  const price = known(candidate.metrics?.priceGbp) ? Number(candidate.metrics.priceGbp) : null;
  const rate = known(candidate.metrics?.commissionRatePct) ? Number(candidate.metrics.commissionRatePct) : null;
  const amount = known(candidate.metrics?.commissionAmountGbp)
    ? Number(candidate.metrics.commissionAmountGbp)
    : known(price) && known(rate) ? price * rate / 100 : null;

  if (!candidate.productId) reject.push('Product ID is missing; the exact listing cannot be re-queried.');
  if (!existingProduct && candidate.detailVerification?.productIdMatched !== true) reject.push('Product detail query did not verify the exact product ID.');
  // Missing feedback/demand is UNKNOWN, not verified poor performance. A
  // reported value below the threshold remains a hard rejection.
  if (known(candidate.metrics?.feedbackPct) && Number(candidate.metrics.feedbackPct) < h.minimumFeedbackPct) reject.push(`Feedback is below ${h.minimumFeedbackPct}%.`);
  if (known(price) && price < h.minimumPriceGbp && (!known(amount) || amount < h.minimumEstimatedCommissionGbp)) reject.push('Price is too low to produce a meaningful expected commission.');
  if (known(amount) && amount < h.minimumEstimatedCommissionGbp) reject.push(`Estimated commission is below £${h.minimumEstimatedCommissionGbp}.`);
  // Commission and demand may be unavailable from the source. They remain
  // explicit UNKNOWN states and reduce confidence, but are not silently scored
  // as negative evidence. Verified low commission still fails above.
  if (!existingProduct && !known(price)) reject.push('A current GBP price is required.');
  if (!existingProduct && candidate.detailVerification?.priceMatched !== true) reject.push('Current GBP price was not confirmed by the product detail query.');
  if (candidate.priceSanity?.status === 'REJECT') reject.push(candidate.priceSanity.reason || 'Price sanity check failed.');
  if (known(price) && price > h.maximumUnverifiedPriceGbp && candidate.listing?.priceVerifiedForShownVariant !== true) reject.push('High price is not verified for the pictured product and quantity.');
  if (candidate.expectedPriceBandGbp && known(price) && price > Number(candidate.expectedPriceBandGbp.max) * 1.5) reject.push('Price is an extreme outlier for this product type.');
  if (candidate.listing?.variantRisk === 'HIGH' && candidate.listing?.variantClarity !== true) reject.push('High-risk variant or quantity could not be verified.');
  else if (candidate.listing?.variantClarity === false) reject.push('Listing uses an unclear or misleading variant/quantity.');
  if (candidate.shipping?.available === false) reject.push('Not available for UK delivery.');
  else if (!existingProduct && candidate.shipping?.marketAvailabilityVerified !== true) reject.push('GB market availability was not verified by a product detail query.');
  else if (known(candidate.shipping.daysMax) && Number(candidate.shipping.daysMax) > h.maximumShippingDays) reject.push('UK delivery time is too slow.');
  if ((candidate.factors?.smallSpaceRelevance ?? 0) < h.minimumSmallSpaceRelevance) reject.push('Weak relevance to small-space organisation.');
  if (candidate.nicheFit?.status === 'REJECT') reject.push(candidate.nicheFit.reason);
  if ((candidate.factors?.obviousProblem ?? 0) < h.minimumObviousProblem) reject.push('The image does not communicate an obvious problem and solution quickly enough.');
  if (!existingProduct && (candidate.factors?.buyerIntent ?? 0) < h.minimumBuyerIntent) reject.push('Search intent is too informational or weakly commercial.');
  if (known(candidate.duplicateSimilarity) && Number(candidate.duplicateSimilarity) > h.maximumDuplicateSimilarity) reject.push('Too similar to a recently published product.');
  if (!existingProduct) {
    const aspect = known(candidate.pinCreative?.width) && known(candidate.pinCreative?.height)
      ? Number(candidate.pinCreative.height) / Number(candidate.pinCreative.width)
      : null;
    if (stage === 'publication' && (!candidate.pinCreative?.path || !candidate.pinCreative?.reviewedNonClickbait || aspect === null || aspect < h.minimumPinAspectRatioHeightToWidth)) reject.push('A reviewed custom vertical Pinterest image is required.');
    if (!candidate.trackingId || !candidate.pinId || !candidate.runId) reject.push('Stable run, product and pin tracking IDs are required.');
    try {
      const affiliate = new URL(candidate.affiliateUrl);
      if (affiliate.hostname !== config.publication.requiredAffiliateHost) reject.push('Affiliate URL does not use the approved AliExpress tracking host.');
    } catch { reject.push('A valid affiliate URL is required.'); }
    if (totalScore < h.minimumPublishScore) reject.push(`Score is below ${h.minimumPublishScore}.`);
    if (confidence < h.minimumConfidence) reject.push(`Data confidence is below ${Math.round(h.minimumConfidence * 100)}%.`);
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
    // Cold-start prior: UNKNOWN contributes a neutral midpoint, never a bonus
    // and never an artificial penalty. Confidence remains the separate guard.
    const points = raw === null || raw === undefined ? 0.5 * weight : clamp(Number(raw)) * weight;
    if (raw !== null && raw !== undefined) knownWeight += weight;
    total += points;
    breakdown[name] = { value: raw === null || raw === undefined ? 'unknown' : round(Number(raw), 3), weight, points: round(points), evidence: raw === null || raw === undefined ? 'NEUTRAL_PRIOR' : 'VERIFIED' };
  }
  const variantRiskPenalty = candidate.listing?.variantRisk === 'HIGH' ? 10 : candidate.listing?.variantRisk === 'MEDIUM' ? 3 : 0;
  breakdown.variantRiskPenalty = { value: candidate.listing?.variantRisk || 'unknown', weight: 0, points: -variantRiskPenalty };
  const totalScore = round(Math.max(0, total - variantRiskPenalty));
  const requiredEvidence = [Boolean(candidate.productId), candidate.detailVerification?.productIdMatched === true, candidate.shipping?.marketAvailabilityVerified === true, known(candidate.metrics?.priceGbp), candidate.detailVerification?.priceMatched === true, known(candidate.metrics?.feedbackPct), Number(candidate.metrics?.recentVolume) > 0, known(candidate.metrics?.commissionRatePct) || known(candidate.metrics?.commissionAmountGbp), Boolean(candidate.affiliateUrl)];
  const requiredConfidence = requiredEvidence.filter(Boolean).length / requiredEvidence.length;
  const editorialEvidence = ['valueForMoney', 'ukSuitability', 'smallSpaceRelevance', 'visualAppeal', 'impulsePurchase', 'obviousProblem', 'buyerIntent'].filter((name) => factors[name] !== null && factors[name] !== undefined).length / 7;
  const optionalEvidence = [known(candidate.shipping?.costGbp), known(candidate.shipping?.daysMax), Boolean(candidate.shipping?.method), candidate.seller?.verified === true, known(candidate.factors?.competitionSaturation)].filter(Boolean).length / 5;
  const confidence = options.existingProduct ? round(knownWeight / 100, 2) : round(requiredConfidence * 0.85 + editorialEvidence * 0.1 + optionalEvidence * 0.05, 2);
  const filters = hardFilters(candidate, totalScore, confidence, options);
  // Independent currency evidence gate; unchanged weights and existing hard filters.
  if(!options.existingProduct&&!currencyGate(candidate))filters.reject.unshift('CURRENCY_VERIFICATION_FAILED');
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
