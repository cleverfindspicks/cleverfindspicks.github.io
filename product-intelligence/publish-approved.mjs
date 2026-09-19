import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePublicationBundle } from './publication-gate.mjs';
import {prepareProductImage,recordProductMedia} from '../media/prepare-product-image.mjs';
import {imageGate} from '../media/image-validation.mjs';
import { affiliateAuditRecord, upsertAffiliateAudit } from './publication-records.mjs';

const bundlePath = process.argv[2];
if (!bundlePath) throw new Error('Usage: node product-intelligence/publish-approved.mjs <approved-bundle.json>');
const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
// The production worker already verifies and caches the exact official image
// immediately before creating the Pin. Reuse that fresh signed evidence so a
// second transient AliExpress request cannot reject an already verified image.
if(!imageGate(bundle.candidate))bundle.candidate=await prepareProductImage(bundle.candidate);
const gate = validatePublicationBundle(bundle);
if (!gate.ok) {
  console.error(JSON.stringify({ ok: false, status: 'BLOCKED_BY_PUBLICATION_GATE', errors: gate.errors }, null, 2));
  process.exit(1);
}
const target = new URL('../app/generated-products.json', import.meta.url);
const before = await readFile(target, 'utf8');
const products = JSON.parse(before);
if (products.some((item) => item.slug === bundle.landingPage.slug)) throw new Error('Generated product slug already exists.');
const mediaBefore=await readFile(new URL('../app/product-media.json',import.meta.url),'utf8');
const affiliateTarget = new URL('../app/affiliate-destinations.json', import.meta.url);
const affiliateBefore = await readFile(affiliateTarget, 'utf8');
await recordProductMedia(bundle.landingPage.slug,bundle.candidate);
const creativeSource = resolve(bundle.candidate.pinCreative.path);
const creativeName = basename(creativeSource);
await copyFile(creativeSource, new URL(`../public/pinterest/${creativeName}`, import.meta.url));
products.push({
  ...bundle.landingPage,
  pinImage: `https://cleverfindspicks.github.io/pinterest/${creativeName}`,
  affiliateUrl: bundle.candidate.affiliateUrl,
  productId: bundle.candidate.productId,
  canonicalProductUrl: bundle.candidate.canonicalProductUrl,
  affiliateDestinationVerified: true,
  affiliateDestinationStatus: bundle.candidate.affiliateDestination.reason,
  affiliateDestinationCheckedAt: bundle.candidate.affiliateDestination.checkedAt,
  publicationId: `pub:${bundle.landingPage.slug}:${String(bundle.publishedAt).slice(0, 10)}`,
  pinTrackingId: bundle.candidate.pinId,
  pinterestPinId: null,
  automationRunId: bundle.candidate.runId,
  searchQuery: Array.isArray(bundle.candidate.searchQuery) ? bundle.candidate.searchQuery.join(' | ') : bundle.candidate.searchQuery,
  cluster: bundle.candidate.cluster,
  publishedAt: bundle.publishedAt,
});
await writeFile(target, JSON.stringify(products, null, 2));
const affiliateRuntime = JSON.parse(affiliateBefore);
await writeFile(
  affiliateTarget,
  JSON.stringify(upsertAffiliateAudit(affiliateRuntime, affiliateAuditRecord(bundle)), null, 2),
);
// Do not invoke pnpm here: Scheduled Tasks commonly have a minimal PATH and
// previously failed after publishing the bundle with "pnpm not recognized".
// The local Node/Vinext build is deterministic and inherits the worker's Node.
const build = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/build-production.mjs', import.meta.url))], {
  cwd: new URL('..', import.meta.url), stdio: 'inherit', windowsHide: true,
});
if (build.status !== 0) {
  await writeFile(target, before);
  await writeFile(new URL('../app/product-media.json',import.meta.url),mediaBefore);
  await writeFile(affiliateTarget, affiliateBefore);
  throw new Error('Build failed; generated-products.json was rolled back.');
}
console.log(JSON.stringify({ ok: true, status: 'BUILT_AWAITING_GIT_PUBLISH', slug: bundle.landingPage.slug }));
