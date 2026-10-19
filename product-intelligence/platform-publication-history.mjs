import { readFile } from 'node:fs/promises';

const generatedProductsUrl = new URL('../app/generated-products.json', import.meta.url);
const affiliateDestinationsUrl = new URL('../app/affiliate-destinations.json', import.meta.url);
const productMediaUrl = new URL('../app/product-media.json', import.meta.url);

const ignoredTitleWords = new Set(['new','hot','sale','home','household','organizer','organiser','storage','rack','holder','shelf','for','with','and','the','a','an','of']);
export function productIdentityFingerprint(title) {
  return String(title || '').toLowerCase().replace(/\b\d+\s*(?:pcs?|pieces?|pack|cm|mm)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((word) => word.length > 2 && !ignoredTitleWords.has(word)).sort().join('|');
}

export function isPinterestPublication(record) {
  if (record?.cataloguePromotionSource === 'INSTAGRAM_AUTO_PROMOTION') return false;
  return record?.pinterestPlatform === 'pinterest' || String(record?.publicationId || '').startsWith('pub:');
}

export async function pinterestPublishedProductIds() {
  return (await pinterestPublicationHistory()).productIds;
}

export async function pinterestPublicationHistory() {
  const records = JSON.parse(await readFile(generatedProductsUrl, 'utf8').catch(() => '[]'));
  const generatedSlugs = new Set(records.map((record) => record.slug));
  const destinations = JSON.parse(await readFile(affiliateDestinationsUrl, 'utf8').catch(() => '{"records":[]}'));
  // Products defined in the original catalogue pre-date the explicit
  // pinterestPlatform field, but they were all Pinterest catalogue entries.
  // Instagram auto-promotions live in generated-products and are deliberately
  // excluded so cross-platform publication remains independent.
  const legacyPinterestIds = (destinations.records || [])
    .filter((record) => !generatedSlugs.has(record.slug))
    .map((record) => String(record.productId || ''));
  const pinterestGenerated = records.filter(isPinterestPublication);
  const publishedSlugs = new Set([...pinterestGenerated.map((record) => record.slug), ...(destinations.records || []).filter((record) => !generatedSlugs.has(record.slug)).map((record) => record.slug)]);
  const media = JSON.parse(await readFile(productMediaUrl, 'utf8').catch(() => '{"records":[]}'));
  return {
    productIds: new Set([...pinterestGenerated.map((record) => String(record.productId || '')), ...legacyPinterestIds].filter(Boolean)),
    imageShas: new Set((media.records || []).filter((record) => publishedSlugs.has(record.slug) && record.productImageVerified === true).map((record) => record.localSha256).filter(Boolean)),
    // Read publication identity from the JSON source directly. Importing
    // app/products.ts here made the catalogue module enter Node's cache before
    // a scheduled product was appended, so deployment validation saw a stale
    // product count in the same worker process.
    titleFingerprints: new Set(pinterestGenerated.map((record) => productIdentityFingerprint(record.name || record.shortName || record.title)).filter(Boolean)),
  };
}

export function instagramLivePublishedProductIds(db, livePublicationSql) {
  return new Set(db.prepare(`SELECT DISTINCT product_id FROM instagram_queue WHERE dry_run=0 AND state='PUBLISHED' AND media_id IS NOT NULL AND ${livePublicationSql}`).all().map((row) => String(row.product_id)));
}

export function instagramLivePublicationHistory(db, livePublicationSql) {
  const rows = db.prepare(`SELECT product_id,evidence_json FROM instagram_queue WHERE dry_run=0 AND state='PUBLISHED' AND media_id IS NOT NULL AND ${livePublicationSql}`).all();
  const candidates = rows.map((row) => { try { return JSON.parse(row.evidence_json || '{}').candidate || {}; } catch { return {}; } });
  return {
    productIds: new Set(rows.map((row) => String(row.product_id))),
    imageShas: new Set(candidates.map((candidate) => candidate.productImageVerification?.localSha256 || candidate.productImageVerification?.sha256).filter(Boolean)),
    titleFingerprints: new Set(candidates.map((candidate) => productIdentityFingerprint(candidate.title)).filter(Boolean)),
  };
}

export function isPreviouslyPublishedProduct(candidate, history) {
  const productId = String(candidate?.productId || candidate?.product?.productId || '');
  const imageSha = candidate?.productImageVerification?.localSha256 || candidate?.productImageVerification?.sha256;
  const title = productIdentityFingerprint(candidate?.title || candidate?.product?.name || candidate?.product?.shortName);
  return history.productIds.has(productId) || Boolean(imageSha && history.imageShas.has(imageSha)) || Boolean(title && history.titleFingerprints.has(title));
}

export function filterNeverPublished(candidates, publishedProductIds) {
  return candidates.filter((candidate) => !publishedProductIds.has(String(candidate?.productId || candidate?.product?.productId || '')));
}
