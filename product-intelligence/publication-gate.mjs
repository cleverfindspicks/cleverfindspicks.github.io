import { readFile } from 'node:fs/promises';
import { scoreCandidate } from './scoring.mjs';

export function validatePublicationBundle(bundle) {
  const result = scoreCandidate(bundle.candidate);
  const errors = [];
  if (result.decision !== 'keep') errors.push(result.rejectionReason || 'Candidate did not pass scoring.');
  if (!bundle.landingPage?.slug || !(bundle.landingPage?.shortName || bundle.landingPage?.title) || !bundle.landingPage?.summary || !bundle.landingPage?.affiliateUrl) errors.push('Complete landing-page content is required.');
  if (!bundle.rssItem?.title || !bundle.rssItem?.link || !bundle.rssItem?.image) errors.push('Complete RSS item is required.');
  if (bundle.candidate?.productId !== bundle.verification?.productId) errors.push('Verified listing ID does not match the selected product.');
  return { ok: errors.length === 0, errors, scoredCandidate: result };
}

if (process.argv[2]) {
  const bundle = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const result = validatePublicationBundle(bundle);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
