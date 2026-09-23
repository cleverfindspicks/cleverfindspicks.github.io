/* oxlint-disable typescript/no-floating-promises -- node:test owns registered tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateInstagramCreativePlan, generateInstagramHashtags, forbiddenGenericCopy } from '../content-engine.mjs';
import { generatePinterestSeo } from '../../product-intelligence/pinterest-seo.mjs';

const kitchen = { productId: '1', title: 'Expandable kitchen countertop spice storage rack', cluster: 'tiny-kitchen-organisation' };
const wardrobe = { productId: '2', title: 'Slim non-slip wardrobe clothes hangers', cluster: 'wardrobe-space-saving' };

test('Instagram copy is product-specific, disclosed first and dynamically tagged', () => {
  const plan = generateInstagramCreativePlan(kitchen);
  assert.ok(plan.caption.startsWith('Ad / affiliate.'));
  assert.match(plan.hook, /counter|kitchen/i);
  assert.equal(forbiddenGenericCopy.some((copy) => plan.caption.toLowerCase().includes(copy)), false);
  assert.ok(plan.hashtags.length >= 5 && plan.hashtags.length <= 10);
  assert.ok(plan.hashtags.includes('#KitchenStorage'));
  assert.equal(plan.hashtags.includes('#fyp'), false);
  assert.notDeepEqual(generateInstagramHashtags(kitchen), generateInstagramHashtags(wardrobe));
});

test('four V2 layout families are recognised and consecutive reuse is avoided', () => {
  const allowed = ['problem-solution', 'product-spotlight', 'space-use-organisation', 'feature-benefit'];
  const first = generateInstagramCreativePlan(kitchen);
  const second = generateInstagramCreativePlan(kitchen, { layouts: [first.layoutFamily] });
  assert.ok(allowed.includes(first.layoutFamily));
  assert.ok(allowed.includes(second.layoutFamily));
  assert.notEqual(second.layoutFamily, first.layoutFamily);
});

test('Pinterest SEO uses natural keywords and a bounded relevant hashtag set', () => {
  const result = generatePinterestSeo(kitchen);
  assert.match(result.seoTitle, /Kitchen|Spice|Storage/i);
  assert.match(result.seoDescription, /UK small homes/i);
  assert.ok(result.keywords.length >= 4 && result.keywords.length <= 8);
  assert.ok(result.hashtags.length >= 2 && result.hashtags.length <= 5);
  assert.equal(result.hashtags.some((tag) => /fyp|viral|trending/i.test(tag)), false);
});
