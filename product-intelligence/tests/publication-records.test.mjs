import assert from 'node:assert/strict';
import test from 'node:test';
import { affiliateAuditRecord, upsertAffiliateAudit } from '../publication-records.mjs';

const bundle = {
  landingPage: { slug: 'verified-product' },
  candidate: {
    productId: '1005001234567890',
    canonicalProductUrl: 'https://www.aliexpress.com/item/1005001234567890.html',
    affiliateUrl: 'https://s.click.aliexpress.com/e/example',
    affiliateDestination: {
      checkedAt: '2026-09-18T00:00:00.000Z',
      finalDestination: 'https://www.aliexpress.com/item/1005001234567890.html?aff=test',
      finalProductId: '1005001234567890',
      destinationType: 'PRODUCT',
      matchesExpectedProduct: true,
      pass: true,
      reason: 'PASS_EXACT_PRODUCT_ID',
    },
  },
};

test('creates and upserts the publication affiliate audit atomically', () => {
  const record = affiliateAuditRecord(bundle);
  const runtime = upsertAffiliateAudit({ schemaVersion: 1, records: [{ slug: 'older' }] }, record);
  assert.equal(record.destinationProductId, bundle.candidate.productId);
  assert.equal(record.affiliateDestinationVerified, true);
  assert.deepEqual(runtime.records.map((item) => item.slug), ['older', 'verified-product']);
});

test('refuses an unverified destination', () => {
  const invalid = structuredClone(bundle);
  invalid.candidate.affiliateDestination.pass = false;
  assert.throws(() => affiliateAuditRecord(invalid), /unverified affiliate destination/);
});
