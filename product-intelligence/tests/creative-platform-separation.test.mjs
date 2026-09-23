/* oxlint-disable typescript/no-floating-promises -- node:test owns registered tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePinterestCreative } from '../pinterest-creative.mjs';
import { validateAutomatedCreative } from '../../instagram/creative.mjs';
import { validateInstagramCover } from '../../instagram/instagram-reel-cover-renderer.mjs';

const productId = '1005008660091954';
const pinterest = {
  renderer: 'PinterestCreativeRenderer', platform: 'pinterest', format: 'static-2:3', width: 1000, height: 1500,
  layoutFamily: 'pinterest-editorial-v3', videoFrameStyling: false, sourceProductId: productId,
  sourceImageSha256: 'a'.repeat(64), productAreaRatio: .535,
  visibleText: ['CLEVER FINDS', 'Make this corner useful', 'Storage without a bulky footprint'],
};
const instagram = {
  renderer: 'InstagramReelRendererV2', platform: 'instagram', layoutFamily: 'product-spotlight', pinterestLayoutReused: false,
  sourceType: 'VERIFIED_ALIEXPRESS_PRODUCT_CACHE', sourceUrl: 'https://ae-pic-a1.aliexpress-media.com/kf/product.jpg', sourceSha256: 'a'.repeat(64),
  productId, expectedProductId: productId, productImageFit: 'contain', productMorphing: false, fabricatedBeforeAfter: false, variantAltered: false,
  rightsBasis: 'CURRENT_AFFILIATE_WORKFLOW_PRODUCT_IMAGE_ONLY', listingVideoUsed: false, commercialMusicUsed: false,
  reelSha256: 'b'.repeat(64), width: 1080, height: 1920, durationSeconds: 9, disclosure: 'Ad / affiliate', caption: 'Ad / affiliate.\n\nProduct-specific caption', visualAffiliateLabel: false,
  scenes: [{ text: ['Make this corner useful'] }, { text: ['Add practical storage'] }, { text: ['Small footprint'] }, { text: ['See today’s find — link in bio'] }],
  productImageVerified: true, productImageVerification: { productId },
  cover: { renderer: 'InstagramReelCoverRendererV2', productId },
  visualQA: { firstFrameMean: 180, firstFrameEntropy: 5, firstFrameNotBlack: true, coverNotBlank: true, productAreaRatio: .56, productClearlyVisible: true, mobileTextReadable: true, textClipped: false, visibleCharacterCount: 120, duplicatedOverlays: false, excessiveEmptySpace: false, firstSecondProductVisible: true, genericHeadline: false, genericRepeatedFooter: false, visualAffiliateLabel: false, compositionCount: 4, singleImageZoomOnly: false, layoutReuseTooFrequent: false },
};
const mp4 = Buffer.concat([Buffer.from('0000ftyp'), Buffer.alloc(12000), Buffer.from('moov')]);

test('Pinterest accepts only its static editorial renderer', () => {
  assert.equal(validatePinterestCreative(pinterest).ok, true);
  assert.deepEqual(validatePinterestCreative({ ...pinterest, renderer: 'InstagramReelRenderer' }).errors, ['BLOCKED_CROSS_PLATFORM_CREATIVE_CONTAMINATION']);
  assert.ok(validatePinterestCreative({ ...pinterest, visibleText: ['See today’s find — link in bio'] }).errors.includes('BLOCKED_CROSS_PLATFORM_CREATIVE_CONTAMINATION'));
});

test('Instagram rejects black frames and Pinterest layouts', () => {
  assert.equal(validateAutomatedCreative(instagram, mp4).ok, true);
  assert.ok(validateAutomatedCreative({ ...instagram, visualQA: { ...instagram.visualQA, firstFrameNotBlack: false, firstFrameMean: 2 } }, mp4).errors.includes('BLACK_OR_BLANK_REEL_COVER'));
  assert.ok(validateAutomatedCreative({ ...instagram, renderer: 'PinterestCreativeRenderer', layoutFamily: 'pinterest-editorial-v3' }, mp4).errors.includes('INSTAGRAM_RENDERER_OR_LAYOUT_INVALID'));
});

test('Instagram cover is bright, product-led and tied to the selected product', () => {
  const cover = { renderer: 'InstagramReelCoverRendererV2', platform: 'instagram', format: 'reel-cover-9:16', width: 1080, height: 1920, productAreaRatio: .56, meanLuminance: 180, entropy: 5, hook: 'Make this corner useful', visibleText: 'Make this corner useful', productId, expectedProductId: productId, sourceImageSha256: 'a'.repeat(64), verifiedImageSha256: 'a'.repeat(64) };
  assert.equal(validateInstagramCover(cover).ok, true);
  assert.ok(validateInstagramCover({ ...cover, meanLuminance: 2 }).errors.includes('INSTAGRAM_COVER_BLACK_OR_BLANK'));
});
