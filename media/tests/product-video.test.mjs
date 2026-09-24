/* oxlint-disable typescript/no-floating-promises -- node:test owns registered tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverOfficialProductVideo, prepareProductVideo } from '../product-video.mjs';

const candidate = {
  productId: '1005001234567890',
  officialProductVideoUrl: 'https://video.aliexpress-media.com/product/demo.mp4',
  productVideoProductId: '1005001234567890',
  productVideoSourceBasis: 'ALIEXPRESS_OFFICIAL_PRODUCT_DETAIL',
};

test('official video discovery requires exact product identity and approved AliExpress provenance', () => {
  assert.equal(discoverOfficialProductVideo(candidate).found, true);
  assert.equal(discoverOfficialProductVideo({ ...candidate, productVideoProductId: 'different' }).found, false);
  assert.equal(discoverOfficialProductVideo({ ...candidate, officialProductVideoUrl: 'https://youtube.com/reupload.mp4' }).found, false);
  assert.equal(discoverOfficialProductVideo({ ...candidate, productVideoSourceBasis: 'SELLER_PAGE_UNKNOWN_RIGHTS' }).found, false);
});

test('video stays an image fallback when watermark, price and variant safety evidence is absent', async () => {
  let fetched = false;
  const result = await prepareProductVideo(candidate, { fetcher: async () => { fetched = true; throw new Error('must not fetch'); } });
  assert.equal(result.productVideoVerified, false);
  assert.equal(result.productVideoVerification.reason, 'VIDEO_VISUAL_SAFETY_EVIDENCE_MISSING');
  assert.equal(fetched, false);
});
