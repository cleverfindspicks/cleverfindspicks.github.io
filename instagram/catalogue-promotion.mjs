import { appendFile, mkdir } from 'node:fs/promises';

export const AUTO_PROMOTION_ENABLED = true;
export const ACTIVE_CATALOGUE_PROMOTION_FAILED = 'ACTIVE_CATALOGUE_PROMOTION_FAILED';

// The promotion gate is deliberately pure and conservative. A caller may add
// a page only after every existing verification proof is present; Pinterest
// publication history is never consulted.
export function canAutoPromote(candidate, suitability) {
  const required = candidate?.evidence?.requiredForPublication || {};
  return candidate?.totalScore >= 65 && candidate?.confidence >= 0.75 &&
    candidate?.currencyVerified === true && candidate?.shipping?.marketAvailabilityVerified === true &&
    candidate?.listing?.variantClarity === true && candidate?.listing?.variantRisk !== 'HIGH' &&
    candidate?.affiliateDestinationVerified === true && required.affiliateUrl === true &&
    candidate?.productImageVerified === true && candidate?.productImageVerification?.sameProductConfirmed === true &&
    candidate?.decision !== 'reject' && suitability?.qualified === true;
}

export async function recordPromotionFailure(root, productId, reason) {
  const dir = new URL('../product-intelligence/.local/', import.meta.url);
  await mkdir(dir, { recursive: true });
  await appendFile(new URL('instagram-catalogue-promotion.jsonl', dir), `${JSON.stringify({ status: ACTIVE_CATALOGUE_PROMOTION_FAILED, productId, reason, at: new Date().toISOString() })}\n`);
}
