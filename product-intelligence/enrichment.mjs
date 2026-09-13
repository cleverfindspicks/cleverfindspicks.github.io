const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const percentile = (values, p) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};

const nicheTerms = /(storage|organis(?:er|ation)|organizer|rack|shelf|drawer|wardrobe|cabinet|cupboard|hanger|basket|hook|space.?sav|foldable|stackable|under.?sink|over.?door)/i;
const problemTerms = /(narrow|small|tiny|gap|clutter|under.?sink|over.?door|no.?drill|wall.?mounted|foldable|stackable|expandable|pull.?out|slim|space.?sav)/i;
const homeContextTerms = /(home|house|flat|kitchen|bathroom|wardrobe|bedroom|cabinet|cupboard|drawer|shoe|clothes|laundry|door|sink|pantry|toilet|wall|room|closet)/i;
const excludedContextTerms = /(car|automotive|vehicle|camping|outdoor|fishing|motorcycle|bicycle|tool bag|picnic|pet carrier)/i;
const highVariantRisk = /(\d+(?:\.\d+)?\s*(?:\/|-|,)\s*\d+(?:\.\d+)?\s*-?\s*(?:pcs?|pieces?|tiers?|l\b))|\b(?:set|pack|assorted|random colour|random color)\b|\b\d+\s*(?:sizes?|colou?rs?)\b/i;
const mediumVariantRisk = /(size|colour|color|style|option|adjustable|expandable|\b[2-9]\s*pcs?\b)/i;

export function priceBenchmarks(candidates) {
  const groups = Map.groupBy(candidates, (candidate) => candidate.cluster || 'unclassified');
  return new Map([...groups.entries()].map(([cluster, rows]) => {
    const prices = rows.map((row) => Number(row.metrics?.priceGbp)).filter((price) => price > 0);
    return [cluster, { sampleSize: prices.length, p10: percentile(prices, 0.1), median: median(prices), p90: percentile(prices, 0.9) }];
  }));
}

export function enrichCandidate(candidate, benchmark) {
  const price = Number(candidate.metrics?.priceGbp);
  const title = String(candidate.title || '');
  const ratio = benchmark?.median && price ? price / benchmark.median : null;
  const extremeLow = benchmark?.p10 && price < benchmark.p10 * 0.55;
  const extremeHigh = benchmark?.p90 && price > benchmark.p90 * 1.6;
  const absoluteTrap = price > 0 && price < 4;
  const priceAnomaly = Boolean(extremeLow || extremeHigh || absoluteTrap);
  const risk = priceAnomaly || highVariantRisk.test(title) ? 'HIGH' : mediumVariantRisk.test(title) ? 'MEDIUM' : 'LOW';
  const excludedContext = excludedContextTerms.test(title);
  const homeContext = homeContextTerms.test(title);
  const relevance = excludedContext ? 0.15 : nicheTerms.test(title) && homeContext ? 0.92 : nicheTerms.test(title) ? 0.7 : 0.25;
  const intent = excludedContext ? 0.3 : problemTerms.test(`${candidate.searchQuery} ${title}`) && homeContext ? 0.9 : nicheTerms.test(title) ? 0.7 : 0.4;
  const value = ratio === null ? null : clamp(1 - Math.abs(Math.log(Math.max(ratio, 0.01))) / 2.2);
  const impulse = Number.isFinite(price) ? (price <= 35 ? 0.9 : price <= 60 ? 0.72 : price <= 80 ? 0.55 : 0.3) : null;
  return {
    ...candidate,
    expectedPriceBandGbp: benchmark?.p10 && benchmark?.p90 ? { min: Number(benchmark.p10.toFixed(2)), max: Number(benchmark.p90.toFixed(2)) } : null,
    priceSanity: {
      status: priceAnomaly ? 'REJECT' : 'PASS',
      reason: priceAnomaly ? 'Price is outside robust cluster bounds or below the minimum credible item price.' : 'Price is within robust cluster bounds.',
      benchmark: benchmark || null,
      medianRatio: ratio === null ? null : Number(ratio.toFixed(3)),
    },
    listing: {
      ...candidate.listing,
      variantRisk: risk,
      variantRiskReasons: risk === 'HIGH' ? ['Title or price indicates material quantity/variant ambiguity.'] : risk === 'MEDIUM' ? ['A selectable size, style or adjustable option may affect value.'] : [],
      variantClarity: risk === 'LOW' ? true : candidate.listing?.variantClarity ?? null,
      priceVerifiedForShownVariant: risk === 'LOW' && candidate.detailVerification?.priceMatched === true,
    },
    factors: {
      ...candidate.factors,
      valueForMoney: value,
      ukSuitability: 0.82,
      smallSpaceRelevance: relevance,
      visualAppeal: candidate.image ? 0.72 : 0.2,
      impulsePurchase: impulse,
      obviousProblem: excludedContext ? 0.3 : problemTerms.test(`${candidate.searchQuery} ${title}`) && homeContext ? 0.88 : nicheTerms.test(title) ? 0.66 : 0.3,
      buyerIntent: intent,
      competitionSaturation: 0.5,
    },
    nicheFit: { status: excludedContext ? 'REJECT' : relevance >= 0.6 ? 'PASS' : 'REJECT', reason: excludedContext ? 'Product is primarily for automotive, outdoor or another excluded context.' : relevance >= 0.6 ? 'Title directly supports home organisation.' : 'Title does not show clear home-organisation relevance.' },
  };
}

export function classifyEvidence(candidate) {
  return {
    requiredForPublication: {
      exactProductId: Boolean(candidate.productId),
      detailProductIdMatched: candidate.detailVerification?.productIdMatched === true,
      gbMarketAvailability: candidate.shipping?.available === true && candidate.shipping?.marketAvailabilityVerified === true,
      currentGbpPrice: Number(candidate.metrics?.priceGbp) > 0 && candidate.detailVerification?.priceMatched === true,
      commission: Number(candidate.metrics?.commissionRatePct) > 0 || Number(candidate.metrics?.commissionAmountGbp) > 0,
      feedback: Number(candidate.metrics?.feedbackPct) > 0,
      demand: Number(candidate.metrics?.recentVolume) > 0,
      priceSanity: candidate.priceSanity?.status === 'PASS',
      niche: Number(candidate.factors?.smallSpaceRelevance) >= 0.6,
      duplicate: Number(candidate.duplicateSimilarity || 0) <= 0.72,
      affiliateUrl: (() => { try { return new URL(candidate.affiliateUrl).hostname === 's.click.aliexpress.com'; } catch { return false; } })(),
    },
    optionalConfidenceSignals: {
      shippingCost: candidate.shipping?.costGbp ?? 'UNAVAILABLE_FROM_SOURCE',
      deliveryEstimate: candidate.shipping?.daysMax ?? 'UNAVAILABLE_FROM_SOURCE',
      shippingMethod: candidate.shipping?.method ?? 'UNAVAILABLE_FROM_SOURCE',
      sellerReliability: candidate.seller?.verified ? candidate.seller.reliabilityScore : 'UNAVAILABLE_FROM_SOURCE',
      competitionSaturation: candidate.factors?.competitionSaturation ?? 'UNAVAILABLE_FROM_SOURCE',
    },
  };
}
