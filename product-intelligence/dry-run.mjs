import { readFile, writeFile } from 'node:fs/promises';
import { products } from '../app/products.ts';
import { scoreCandidates } from './scoring.mjs';
import { applyVerificationEvidence, evidenceIsFresh, loadVerificationEvidence } from './verification.mjs';
import { enrichCandidate, priceBenchmarks } from './enrichment.mjs';
import { buildContentCandidate } from './content.mjs';

const pool = JSON.parse(await readFile(new URL('./data/candidate-pool.json', import.meta.url), 'utf8'));
const evidence = await loadVerificationEvidence();
const evidenced = (pool.candidates || []).map((candidate) => {
  const record = evidence.get(String(candidate.productId));
  return applyVerificationEvidence(candidate, evidenceIsFresh(record) ? record : null);
});
const benchmarks = priceBenchmarks(evidenced);
const candidates = evidenced.map((candidate) => enrichCandidate(candidate, benchmarks.get(candidate.cluster)));
const evaluated = scoreCandidates(candidates, { stage: 'qualification' });
const winner = evaluated.find((candidate) => candidate.decision === 'keep' && candidate.affiliateDestinationVerified !== false) || null;
const status = winner?.pinCreative?.path ? 'READY_FOR_FINAL_PUBLICATION_GATE' : winner ? 'PROVISIONAL_WINNER_REQUIRES_CREATIVE' : 'SKIPPED_NO_QUALIFIED_PRODUCT';
const counts = Object.groupBy(evaluated, (candidate) => candidate.decision);
const sequential = (input, predicate) => input.filter(predicate);
const passedProductId = sequential(evaluated, (item) => Boolean(item.productId && item.detailVerification?.productIdMatched));
const passedGb = sequential(passedProductId, (item) => item.shipping?.available === true && item.shipping?.marketAvailabilityVerified === true);
const passedPrice = sequential(passedGb, (item) => item.detailVerification?.priceMatched === true && item.priceSanity?.status === 'PASS');
const passedDemandFeedback = sequential(passedPrice, (item) => Number(item.metrics?.recentVolume) > 0 && Number(item.metrics?.feedbackPct) >= 95);
const passedNicheIntent = sequential(passedDemandFeedback, (item) => Number(item.factors?.smallSpaceRelevance) >= 0.6 && Number(item.factors?.buyerIntent) >= 0.6 && Number(item.factors?.obviousProblem) >= 0.6);
const passedProfitability = sequential(passedNicheIntent, (item) => Number(item.metrics?.commissionAmountGbp) >= 0.5 || (Number(item.metrics?.priceGbp) * Number(item.metrics?.commissionRatePct) / 100) >= 0.5);
const passedDuplicate = sequential(passedProfitability, (item) => Number(item.duplicateSimilarity || 0) <= 0.72);
const passedScore = sequential(passedDuplicate, (item) => item.totalScore >= 65 && item.confidence >= 0.75);
const qualified = sequential(passedScore, (item) => item.decision === 'keep');
const report = {
  generatedAt: new Date().toISOString(),
  runId: winner?.runId || pool.runId || pool.generatedAt,
  status,
  candidateCount: evaluated.length,
  evaluatedCounts: Object.fromEntries(Object.entries(counts).map(([key, rows]) => [key, rows.length])),
  funnel: {
    candidatesFound: evaluated.length,
    passedProductId: passedProductId.length,
    passedGbAvailability: passedGb.length,
    passedPriceSanity: passedPrice.length,
    passedDemandFeedback: passedDemandFeedback.length,
    passedNicheBuyerIntent: passedNicheIntent.length,
    passedProfitability: passedProfitability.length,
    passedDuplicateChecks: passedDuplicate.length,
    passedScore65: passedScore.length,
    finalQualifiedCandidates: qualified.length,
  },
  currentCatalogueCount: products.length,
  currentCatalogueUntouched: products.length >= 14,
  winner,
  publicationPerformed: false,
  landingPageCandidateGenerated: Boolean(winner),
  landingPageCandidate: winner ? { slug: winner.trackingId, title: winner.title, summary: `A practical ${winner.cluster.replaceAll('-', ' ')} option for smaller UK homes. Check the exact current offer before buying.` } : null,
  rssCandidateGenerated: Boolean(winner),
  rssCandidate: winner ? { title: winner.title, link: `https://cleverfindspicks.github.io/finds/${winner.trackingId}`, image: winner.pinCreative?.path || 'PENDING_CREATIVE' } : null,
  creativeCandidateGenerated: Boolean(winner?.pinCreative?.path),
  analyticsValidation: {
    stableIds: Boolean(winner?.trackingId && winner?.pinId && winner?.runId),
    outboundEvent: 'aliexpress_outbound_click',
    productViewEvent: 'product_view'
  },
  topCandidates: evaluated.slice(0, 10).map(({ productId, title, totalScore, confidence, decision, rejectionReason }) => ({ productId, title, totalScore, confidence, decision, rejectionReason })),
  note: winner ? 'A provisional winner passed product qualification. Creative generation and final publication validation are the next stage.' : 'No product passed every evidence gate. The existing site and RSS remain unchanged.'
};
await writeFile(new URL('./data/dry-run-report.json', import.meta.url), JSON.stringify(report, null, 2));
if (winner?.pinCreative?.path) {
  const content = buildContentCandidate(winner);
  const bundle = {
    candidate: winner,
    verification: { productId: winner.productId, source: winner.detailVerification?.source, checkedAt: winner.detailVerification?.checkedAt },
    ...content,
    publishedAt: new Date().toISOString(),
    publicationPerformed: false,
  };
  await writeFile(new URL('./data/provisional-publication-bundle.json', import.meta.url), JSON.stringify(bundle, null, 2));
}
const markdown = `# Product Intelligence dry run\n\n- Status: **${status}**\n- Candidates evaluated: ${evaluated.length}\n- Current products preserved: ${products.length}\n- Winner: ${winner?.productId || 'none'}\n- Publication performed: no\n\n## Funnel\n\n${Object.entries(report.funnel).map(([name, value]) => `- ${name}: ${value}`).join('\n')}\n\n- Reason: ${winner ? 'The product passed qualification and is ready for creative generation.' : 'No product passed the available-source qualification gates.'}\n`;
await writeFile(new URL('./reports/latest-dry-run.md', import.meta.url), markdown);
console.log(JSON.stringify({ ok: true, status, candidates: evaluated.length, winner: winner?.productId || null }));
