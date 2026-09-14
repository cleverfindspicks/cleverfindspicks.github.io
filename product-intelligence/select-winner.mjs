import { readFile, writeFile } from 'node:fs/promises';
import config from './config.json' with { type: 'json' };
import { scoreCandidates } from './scoring.mjs';
import { isExplorationRun } from './performance.mjs';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('Usage: node product-intelligence/select-winner.mjs <verified-candidates.json>');
const input = JSON.parse(await readFile(inputPath, 'utf8'));
const candidates = Array.isArray(input) ? input : input.candidates;
if (!Array.isArray(candidates)) throw new Error('Input must be an array or an object with a candidates array.');

const performance = JSON.parse(await readFile(new URL('./data/cluster-performance.json', import.meta.url), 'utf8'));
const history = JSON.parse(await readFile(new URL('./data/selection-history.json', import.meta.url), 'utf8'));
const multipliers = new Map((performance.clusters || []).map((cluster) => [cluster.cluster, cluster.searchPriorityMultiplier]));
const recentClusters = (history.selections || []).slice(-config.performance.maximumConsecutiveClusterWins).map((selection) => selection.cluster);
const runId = input.runId || candidates[0]?.runId || new Date().toISOString().slice(0, 10);
const exploration = isExplorationRun(runId);

const evaluated = scoreCandidates(candidates).map((candidate) => {
  const repeatedCluster = recentClusters.length === config.performance.maximumConsecutiveClusterWins && recentClusters.every((cluster) => cluster === candidate.cluster);
  const performanceMultiplier = exploration ? 1 : (multipliers.get(candidate.cluster) || 1);
  return {
    ...candidate,
    performanceMultiplier,
    diversityBlocked: repeatedCluster,
    selectionScore: Number(Math.min(100, candidate.totalScore * performanceMultiplier).toFixed(1)),
  };
}).sort((a, b) => b.selectionScore - a.selectionScore);

const winner = evaluated.find((candidate) => candidate.decision === 'keep' && !candidate.diversityBlocked) || null;
const winnerWithReason = winner ? {
  ...winner,
  selectionReason: `Highest eligible evidence-based score (${winner.totalScore}/100; ${Math.round(winner.confidence * 100)}% confidence), adjusted to ${winner.selectionScore} by verified cluster performance while respecting the diversity cap.`,
} : null;

await writeFile(new URL('./data/selection-result.json', import.meta.url), JSON.stringify({
  generatedAt: new Date().toISOString(),
  mode: exploration ? 'exploration' : 'exploitation',
  winner: winnerWithReason,
  evaluated,
  publicationPerformed: false,
  note: winnerWithReason ? 'Analysis result only. Publication remains a separate explicit step.' : 'No candidate passed every score, evidence, diversity and creative gate.'
}, null, 2));

console.log(JSON.stringify({ ok: true, evaluated: evaluated.length, winner: winnerWithReason?.productId || null }));
if (!winnerWithReason) process.exitCode = 1;
