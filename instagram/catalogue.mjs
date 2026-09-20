import { readFile } from 'node:fs/promises';
import {deferredCandidates} from '../product-intelligence/aliexpress-recovery.mjs';
import { spawnSync } from 'node:child_process';
import { products } from '../app/products.ts';
import { isVisibleRecommendation } from '../app/catalog-visibility.ts';
import { instagramSuitability } from './suitability.mjs';
import config from './config.json' with { type: 'json' };
import {refreshProductEvidence} from './product-evidence.mjs';
import {livePublicationSql} from './store.mjs';
import {AUTO_PROMOTION_ENABLED,canAutoPromote,recordPromotionFailure} from './catalogue-promotion.mjs';

export async function qualifiedCatalogue(db) {
  const bundles = [];
  try { bundles.push(JSON.parse(await readFile(new URL('../product-intelligence/data/provisional-publication-bundle.json', import.meta.url), 'utf8'))); } catch { /* No current receipt. */ }
  const commits = spawnSync('git', ['log', '-40', '--format=%H', '--', 'product-intelligence/data/provisional-publication-bundle.json'], { encoding: 'utf8' }).stdout?.trim().split(/\r?\n/) || [];
  for (const commit of commits) {
    const raw = spawnSync('git', ['show', `${commit}:product-intelligence/data/provisional-publication-bundle.json`], { encoding: 'utf8', maxBuffer: 5e6 });
    try { bundles.push(JSON.parse(raw.stdout)); } catch { /* An unavailable historic receipt is not eligibility evidence. */ }
  }
  const receipts = new Map();
  // Instagram eligibility is platform-specific. Seed active catalogue rows
  // from the latest Product Intelligence pool so a Pinterest-only publication
  // (or a stale generated receipt) cannot starve Instagram.
  try {
    const pool = JSON.parse(await readFile(new URL('../product-intelligence/data/candidate-pool.json', import.meta.url), 'utf8'));
    for (const candidate of pool.candidates || []) {
      const product = products.find((p) => String(p.productId) === String(candidate.productId));
      if (product && !receipts.has(product.slug) && candidate.currencyVerified === true) receipts.set(product.slug, candidate);
    }
  } catch { /* pool is optional; deferred/bundle receipts remain authoritative */ }
  for(const candidate of deferredCandidates('instagram')){const p=products.find(p=>String(p.productId)===String(candidate.productId));if(p)receipts.set(p.slug,candidate);}
  for (const bundle of bundles) {
    const candidate = bundle.candidate;
    const slug = bundle.landingPage?.slug;
    if (slug && candidate && !receipts.has(slug)) receipts.set(slug, candidate);
  }
  const cooldown = new Date(Date.now() - config.selection.repeatCooldownDays * 86400000).toISOString();
  const recent = db.prepare(`SELECT product_id FROM instagram_queue WHERE dry_run=0 AND state IN ('PUBLISHED','PENDING','CREATIVE_GENERATING','READY','PUBLISHING','FAILED_RETRYABLE','FAILED_PERMANENT') AND created_at>=? AND ${livePublicationSql}`).all(cooldown).map((row) => row.product_id);
  const last = db.prepare(`SELECT cluster FROM instagram_queue WHERE dry_run=0 AND state='PUBLISHED' AND ${livePublicationSql} ORDER BY published_at DESC LIMIT ?`).all(config.selection.maximumConsecutiveClusterWins);
  const current=await refreshProductEvidence(products.filter((p) => isVisibleRecommendation(p.slug) && p.affiliateDestinationVerified).flatMap(product=>{
    const candidate=receipts.get(product.slug);
    return candidate&&String(candidate.productId)===String(product.productId)?[{product,candidate}]:[];
  }));
  return current.flatMap(({product,candidate}) => {
    const required = candidate?.evidence?.requiredForPublication;
    const duplicateOnly = candidate?.decision === 'reject' && /^Too similar to a recently published product\.?$/.test(String(candidate.rejectionReason || '').trim());
    if (!candidate || (candidate.decision !== 'keep' && !duplicateOnly) || !required || Object.values(required).some((value) => value !== true) || String(candidate.productId) !== String(product.productId)) return [];
    const suitability = instagramSuitability(candidate, { recentProductIds: recent });
    const diversified = last.length < config.selection.maximumConsecutiveClusterWins || !last.every((r) => r.cluster === product.cluster);
    const learned = db.prepare('SELECT performance_multiplier FROM instagram_cluster_performance WHERE cluster=? AND window_days=30').get(product.cluster)?.performance_multiplier || 1;
    if (AUTO_PROMOTION_ENABLED && !canAutoPromote(candidate, suitability)) {
      // No half-active product is created here. The existing production flow
      // may promote only after image/affiliate/page deployment verification.
      recordPromotionFailure(null, product.productId, 'VERIFICATION_GATE_NOT_SATISFIED').catch(() => {});
      return [];
    }
    return [{ product, candidate, suitability, diversified, selectionScore: Number(((candidate.totalScore * 0.4 + suitability.totalScore * 0.6) * learned).toFixed(2)) }];
  }).filter((row) => row.suitability.qualified).sort((a, b) => Number(b.diversified)-Number(a.diversified)||b.selectionScore-a.selectionScore);
}
