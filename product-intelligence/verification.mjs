import { readFile } from 'node:fs/promises';

export async function loadVerificationEvidence(path = new URL('./data/verification-evidence.json', import.meta.url)) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return new Map((parsed.records || []).map((record) => [String(record.productId), record]));
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
}

export function applyVerificationEvidence(candidate, evidence) {
  if (!evidence) return candidate;
  return {
    ...candidate,
    affiliateUrl: evidence.affiliateUrl ?? candidate.affiliateUrl,
    expectedPriceBandGbp: evidence.expectedPriceBandGbp ?? candidate.expectedPriceBandGbp,
    shipping: evidence.shipping ?? candidate.shipping,
    seller: evidence.seller ?? candidate.seller,
    listing: evidence.listing ?? candidate.listing,
    factors: { ...candidate.factors, ...evidence.factors },
    pinCreative: evidence.pinCreative ?? candidate.pinCreative,
    verification: {
      source: evidence.source,
      checkedAt: evidence.checkedAt,
      exactProductIdMatched: evidence.exactProductIdMatched ?? null,
    },
  };
}

export function evidenceIsFresh(evidence, maximumAgeHours = 24) {
  const checked = Date.parse(evidence?.checkedAt);
  return Number.isFinite(checked) && Date.now() - checked <= maximumAgeHours * 3600000;
}
