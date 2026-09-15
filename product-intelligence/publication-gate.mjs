import { readFile } from 'node:fs/promises';
import { scoreCandidate } from './scoring.mjs';
import { extractProductId } from './affiliate-destination.mjs';
import {currencyGate} from './currency.mjs';
import {imageGate} from '../media/image-validation.mjs';

export function validatePublicationBundle(bundle) {
  const result = scoreCandidate(bundle.candidate);
  const errors = [];
  if(!imageGate(bundle.candidate))errors.push('SKIPPED_IMAGE_NOT_VERIFIED: productImageVerified must be true with validated original-image evidence.');
  if(!currencyGate(bundle.candidate))errors.push('Currency Verification Gate: verified GBP evidence is required.');
  if (result.decision !== 'keep') errors.push(result.rejectionReason || 'Candidate did not pass scoring.');
  if (!bundle.landingPage?.slug || !(bundle.landingPage?.shortName || bundle.landingPage?.title) || !bundle.landingPage?.summary || !bundle.landingPage?.affiliateUrl) errors.push('Complete landing-page content is required.');
  if (!bundle.rssItem?.title || !bundle.rssItem?.link || !bundle.rssItem?.image) errors.push('Complete RSS item is required.');
  if (bundle.candidate?.productId !== bundle.verification?.productId) errors.push('Verified listing ID does not match the selected product.');
  if (bundle.candidate?.affiliateDestinationVerified !== true) errors.push('Affiliate destination was not verified end-to-end.');
  if (extractProductId(bundle.candidate?.canonicalProductUrl) !== String(bundle.candidate?.productId || '')) errors.push('Canonical AliExpress product URL does not match the selected product ID.');
  if (bundle.candidate?.affiliateDestination?.matchesExpectedProduct !== true) errors.push('Affiliate destination does not resolve to the expected AliExpress product.');
  if (String(bundle.candidate?.affiliateDestination?.finalProductId || '') !== String(bundle.candidate?.productId || '')) errors.push('Final Affiliate destination product ID does not match the selected product.');
  return { ok: errors.length === 0, errors, scoredCandidate: result };
}

if (process.argv[2]) {
  const bundle = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const result = validatePublicationBundle(bundle);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
