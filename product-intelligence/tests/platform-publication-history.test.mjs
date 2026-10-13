/* oxlint-disable typescript/no-floating-promises -- node:test owns registered tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterNeverPublished, isPinterestPublication, isPreviouslyPublishedProduct, productIdentityFingerprint } from '../platform-publication-history.mjs';

test('Pinterest history ignores Instagram-only catalogue promotion', () => {
  assert.equal(isPinterestPublication({ publicationId: 'catalogue:x', cataloguePromotionSource: 'INSTAGRAM_AUTO_PROMOTION' }), false);
  assert.equal(isPinterestPublication({ publicationId: 'pub:x:2026-10-01' }), true);
  assert.equal(isPinterestPublication({ pinterestPlatform: 'pinterest' }), true);
});

test('exact Product ID history permanently removes a platform duplicate', () => {
  const rows = [{ productId: '1' }, { productId: '2' }];
  assert.deepEqual(filterNeverPublished(rows, new Set(['1'])), [{ productId: '2' }]);
});

test('same verified image or normalized product identity blocks relisted duplicates', () => {
  const history = { productIds: new Set(), imageShas: new Set(['a'.repeat(64)]), titleFingerprints: new Set([productIdentityFingerprint('10 pcs slim non-slip clothes hangers')]) };
  assert.equal(isPreviouslyPublishedProduct({ productId: 'new-listing', title: 'Slim non slip clothes hangers', productImageVerification: { localSha256: 'a'.repeat(64) } }, history), true);
  assert.equal(isPreviouslyPublishedProduct({ productId: 'different', title: 'Under sink pull-out drawer', productImageVerification: { localSha256: 'b'.repeat(64) } }, history), false);
});
