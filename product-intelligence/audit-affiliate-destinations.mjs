import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { products } from '../app/products.ts';
import { canonicalProductUrl, generateAffiliateLink, resolveAffiliateDestination } from './affiliate-destination.mjs';

const runtimeUrl = new URL('../app/affiliate-destinations.json', import.meta.url);
const reportUrl = new URL('./data/affiliate-destination-audit.json', import.meta.url);
const runtime = JSON.parse(await readFile(runtimeUrl, 'utf8'));
const previousBySlug = new Map((runtime.records || []).map((record) => [record.slug, record]));
const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8').then(parseEnv).catch(() => ({}));
const credentialsAvailable = Boolean(env.ALIEXPRESS_APP_KEY && env.ALIEXPRESS_APP_SECRET && env.ALIEXPRESS_TRACKING_ID);
const results = [];

for (const product of products) {
  const previous = previousBySlug.get(product.slug) || {};
  const expectedProductId = previous.productId || product.productId || null;
  const originalPromotionLink = previous.originalAffiliateUrl || product.affiliateUrl;
  let activePromotionLink = previous.affiliateUrl || product.affiliateUrl;
  let validation = await resolveAffiliateDestination(activePromotionLink, expectedProductId);
  let action = validation.pass ? 'NONE_REQUIRED' : 'CTA_DISABLED';

  if (!validation.pass && expectedProductId && credentialsAvailable) {
    try {
      const generated = await generateAffiliateLink({
        productId: expectedProductId,
        appKey: env.ALIEXPRESS_APP_KEY.trim(),
        appSecret: env.ALIEXPRESS_APP_SECRET.trim(),
        trackingId: env.ALIEXPRESS_TRACKING_ID.trim(),
      });
      const regeneratedValidation = await resolveAffiliateDestination(generated.affiliateUrl, expectedProductId);
      if (regeneratedValidation.pass) {
        activePromotionLink = generated.affiliateUrl;
        validation = regeneratedValidation;
        action = 'AFFILIATE_LINK_REPAIRED_SAME_PRODUCT_ID';
      } else {
        action = 'REGENERATION_FAILED_CTA_DISABLED';
      }
    } catch {
      action = 'REGENERATION_FAILED_CTA_DISABLED';
    }
  } else if (!validation.pass && !expectedProductId) {
    action = 'EXACT_LEGACY_PRODUCT_ID_UNAVAILABLE_CTA_DISABLED';
  }

  results.push({
    slug: product.slug,
    product: product.shortName,
    productId: expectedProductId,
    canonicalProductDetailUrl: expectedProductId ? canonicalProductUrl(expectedProductId) : null,
    originalAffiliateUrl: originalPromotionLink,
    affiliatePromotionLink: activePromotionLink,
    finalResolvedDestination: validation.finalDestination,
    destinationProductId: validation.finalProductId,
    destinationType: validation.destinationType,
    validationTimestamp: validation.checkedAt,
    affiliateDestinationVerified: validation.pass,
    status: validation.pass ? 'PASS' : 'FAIL',
    reason: validation.reason,
    action,
    redirectChain: validation.redirectChain,
  });
}

const generatedAt = new Date().toISOString();
const report = {
  schemaVersion: 1,
  generatedAt,
  summary: {
    checked: results.length,
    pass: results.filter((item) => item.status === 'PASS').length,
    fail: results.filter((item) => item.status === 'FAIL').length,
    homepage: results.filter((item) => item.destinationType === 'HOMEPAGE').length,
    repaired: results.filter((item) => item.action === 'AFFILIATE_LINK_REPAIRED_SAME_PRODUCT_ID').length,
    disabled: results.filter((item) => !item.affiliateDestinationVerified).length,
  },
  records: results,
};
await writeFile(reportUrl, JSON.stringify(report, null, 2));
await writeFile(runtimeUrl, JSON.stringify({ schemaVersion: 1, updatedAt: generatedAt, records: results.map((item) => ({
  slug: item.slug,
  productId: item.productId,
  canonicalProductUrl: item.canonicalProductDetailUrl,
  originalAffiliateUrl: item.originalAffiliateUrl,
  affiliateUrl: item.affiliatePromotionLink,
  finalResolvedDestination: item.finalResolvedDestination,
  destinationProductId: item.destinationProductId,
  destinationType: item.destinationType,
  validationTimestamp: item.validationTimestamp,
  affiliateDestinationVerified: item.affiliateDestinationVerified,
  status: item.status,
  reason: item.reason,
  action: item.action,
})) }, null, 2));
console.log(JSON.stringify({ ok: true, ...report.summary }));
