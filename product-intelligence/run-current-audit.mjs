import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { scoreCandidates } from './scoring.mjs';

const input = JSON.parse(await readFile(new URL('./data/current-products-review.json', import.meta.url), 'utf8'));
const evaluated = scoreCandidates(input.products, { existingProduct: true });
const output = {
  generatedAt: new Date().toISOString(),
  modelVersion: 1,
  purpose: 'Analysis only. This file is not connected to RSS, app/products.ts or production publishing.',
  products: evaluated,
};
await writeFile(new URL('./data/evaluations.json', import.meta.url), JSON.stringify(output, null, 2));

const escapeCell = (value) => String(value ?? 'Unknown').replaceAll('|', '\\|').replaceAll('\n', ' ');
const rows = evaluated.map((item) => {
  const reason = item.rejectionReason || item.reviewNotes[0] || item.selectionReason;
  return `| ${escapeCell(item.title)} | £${item.metrics.priceGbp} | ${item.metrics.recentVolume.toLocaleString('en-GB')} | ${item.metrics.feedbackPct}% | ${escapeCell(item.estimatedProfitability)} | ${item.totalScore}/100 (${Math.round(item.confidence * 100)}% confidence) | ${item.decision} | ${escapeCell(reason)} |`;
});
const report = `# Current catalogue Product Intelligence audit\n\nGenerated: ${output.generatedAt}\n\nUnknown data receives zero points. A low confidence score is deliberate and means the exact listing, shipping, seller or commission data must be re-verified. Existing products are not removed by this report.\n\n| Product | Existing price | Demand | Feedback | Estimated profitability | New score | Status | Primary reason |\n|---|---:|---:|---:|---|---:|---|---|\n${rows.join('\n')}\n`;
await mkdir(new URL('./reports/', import.meta.url), { recursive: true });
await writeFile(new URL('./reports/current-products-audit.md', import.meta.url), report);
console.log(JSON.stringify({ ok: true, evaluated: evaluated.length, keep: evaluated.filter((item) => item.decision === 'keep').length, questionable: evaluated.filter((item) => item.decision === 'questionable').length, reject: evaluated.filter((item) => item.decision === 'reject').length }));
