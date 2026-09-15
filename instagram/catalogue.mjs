import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { products } from '../app/products.ts';
import { isVisibleRecommendation } from '../app/catalog-visibility.ts';
import { instagramSuitability } from './suitability.mjs';
import config from './config.json' with { type: 'json' };
import {refreshProductEvidence} from './product-evidence.mjs';

export async function qualifiedCatalogue(db) {
  const bundles = [];
  try { bundles.push(JSON.parse(await readFile(new URL('../product-intelligence/data/provisional-publication-bundle.json', import.meta.url), 'utf8'))); } catch { /* No current receipt. */ }
  const commits = spawnSync('git', ['log', '-40', '--format=%H', '--', 'product-intelligence/data/provisional-publication-bundle.json'], { encoding: 'utf8' }).stdout?.trim().split(/\r?\n/) || [];
  for (const commit of commits) {
    const raw = spawnSync('git', ['show', `${commit}:product-intelligence/data/provisional-publication-bundle.json`], { encoding: 'utf8', maxBuffer: 5e6 });
    try { bundles.push(JSON.parse(raw.stdout)); } catch { /* An unavailable historic receipt is not eligibility evidence. */ }
  }
  const receipts = new Map();
  for (const bundle of bundles) {
    const candidate = bundle.candidate;
    const slug = bundle.landingPage?.slug;
    if (slug && candidate && !receipts.has(slug)) receipts.set(slug, candidate);
  }
  const cooldown = new Date(Date.now() - config.selection.repeatCooldownDays * 86400000).toISOString();
  const recent = db.prepare("SELECT product_id FROM instagram_queue WHERE dry_run=0 AND state IN ('PUBLISHED','PENDING','CREATIVE_GENERATING','READY','PUBLISHING','FAILED_RETRYABLE','FAILED_PERMANENT') AND created_at>=?").all(cooldown).map((row) => row.product_id);
  const last = db.prepare("SELECT cluster FROM instagram_queue WHERE dry_run=0 AND state='PUBLISHED' ORDER BY published_at DESC LIMIT ?").all(config.selection.maximumConsecutiveClusterWins);
  const current=await refreshProductEvidence(products.filter((p) => isVisibleRecommendation(p.slug) && p.affiliateDestinationVerified).flatMap(product=>{
    const candidate=receipts.get(product.slug);
    return candidate&&String(candidate.productId)===String(product.productId)?[{product,candidate}]:[];
  }));
  return current.flatMap(({product,candidate}) => {
    const required = candidate?.evidence?.requiredForPublication;
    if (!candidate || candidate.decision !== 'keep' || !required || Object.values(required).some((value) => value !== true) || String(candidate.productId) !== String(product.productId)) return [];
    const suitability = instagramSuitability(candidate, { recentProductIds: recent });
    const diversified = last.length < config.selection.maximumConsecutiveClusterWins || !last.every((r) => r.cluster === product.cluster);
    const learned = db.prepare('SELECT performance_multiplier FROM instagram_cluster_performance WHERE cluster=? AND window_days=30').get(product.cluster)?.performance_multiplier || 1;
    return [{ product, candidate, suitability, diversified, selectionScore: Number(((candidate.totalScore * 0.4 + suitability.totalScore * 0.6) * learned).toFixed(2)) }];
  }).filter((row) => row.suitability.qualified && row.diversified).sort((a, b) => b.selectionScore - a.selectionScore);
}
