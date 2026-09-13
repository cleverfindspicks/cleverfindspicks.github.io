import { readFile, writeFile } from 'node:fs/promises';
import { products } from '../app/products.ts';
import { scoreCandidates } from './scoring.mjs';
import { applyVerificationEvidence, evidenceIsFresh, loadVerificationEvidence } from './verification.mjs';

const pool = JSON.parse(await readFile(new URL('./data/candidate-pool.json', import.meta.url), 'utf8'));
const evidence = await loadVerificationEvidence();
const candidates = (pool.candidates || []).map((candidate) => {
  const record = evidence.get(String(candidate.productId));
  return applyVerificationEvidence(candidate, evidenceIsFresh(record) ? record : null);
});
const evaluated = scoreCandidates(candidates);
const winner = evaluated.find((candidate) => candidate.decision === 'keep') || null;
const status = winner ? 'READY_FOR_PUBLICATION_REVIEW' : 'SKIPPED_NO_QUALIFIED_PRODUCT';
const counts = Object.groupBy(evaluated, (candidate) => candidate.decision);
const report = {
  generatedAt: new Date().toISOString(),
  runId: winner?.runId || pool.runId || pool.generatedAt,
  status,
  candidateCount: evaluated.length,
  evaluatedCounts: Object.fromEntries(Object.entries(counts).map(([key, rows]) => [key, rows.length])),
  currentCatalogueCount: products.length,
  currentCatalogueUntouched: products.length === 14,
  winner,
  publicationPerformed: false,
  landingPageCandidateGenerated: Boolean(winner),
  rssCandidateGenerated: Boolean(winner),
  creativeCandidateGenerated: Boolean(winner?.pinCreative?.path),
  analyticsValidation: {
    stableIds: Boolean(winner?.trackingId && winner?.pinId && winner?.runId),
    outboundEvent: 'aliexpress_outbound_click',
    productViewEvent: 'product_view'
  },
  topCandidates: evaluated.slice(0, 10).map(({ productId, title, totalScore, confidence, decision, rejectionReason }) => ({ productId, title, totalScore, confidence, decision, rejectionReason })),
  note: winner ? 'A candidate passed the analysis gates. Production still requires the atomic publication command.' : 'No product passed every evidence gate. The existing site and RSS remain unchanged.'
};
await writeFile(new URL('./data/dry-run-report.json', import.meta.url), JSON.stringify(report, null, 2));
const markdown = `# Product Intelligence dry run\n\n- Status: **${status}**\n- Candidates evaluated: ${evaluated.length}\n- Current products preserved: ${products.length}\n- Winner: ${winner?.productId || 'none'}\n- Publication performed: no\n- Reason: ${winner ? 'All machine gates passed; awaiting atomic publication.' : 'No candidate had complete verified UK shipping, exact variant, seller/listing evidence, affiliate URL and reviewed vertical creative.'}\n`;
await writeFile(new URL('./reports/latest-dry-run.md', import.meta.url), markdown);
console.log(JSON.stringify({ ok: true, status, candidates: evaluated.length, winner: winner?.productId || null }));
