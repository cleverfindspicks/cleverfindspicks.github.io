import { productContentProfile } from '../instagram/content-engine.mjs';

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const unique = (values) => [...new Set(values.filter(Boolean))];

export function generatePinterestSeo(product) {
  const profile = productContentProfile(product);
  const sourceTitle = clean(product.shortName || product.title || product.name || 'Home storage organiser')
    .replace(/^\d+\s*(?:pcs?|pack)\s*/i, '')
    .split(/[,|]/)[0]
    .split(/\s+/)
    .slice(0, 9)
    .join(' ');
  const title = /storage|organisation|organiser|organizer/i.test(sourceTitle)
    ? sourceTitle
    : `${sourceTitle} for ${profile.category}`;
  const seoTitle = `${/space.?saving/i.test(title) ? '' : 'Space-Saving '}${title}`.replace(/\s+/g, ' ').trim().slice(0, 100);
  const text = `${product.title || ''} ${product.cluster || ''}`.toLowerCase();
  const attributes = unique([
    text.match(/no.?drill/) ? 'no-drill storage' : null,
    text.match(/renter|removable|adhesive/) ? 'renter-friendly organisation' : null,
    text.match(/fold|collaps/) ? 'foldable storage' : null,
    text.match(/narrow|slim/) ? 'narrow-space storage' : null,
  ]);
  const keywords = unique([
    sourceTitle.toLowerCase(),
    profile.category.toLowerCase(),
    `${profile.room.toLowerCase()} organisation`,
    profile.subject,
    'small-space storage',
    ...attributes,
  ]).slice(0, 8);
  const seoDescription = `${profile.solution}. ${profile.benefits.join('. ')}. A practical ${keywords[1]} idea for UK small homes; check the exact dimensions and selected option before ordering.`;
  const hashtags = unique([
    ...profile.hashtags,
    'SmallSpaceLiving',
    attributes.includes('renter-friendly organisation') ? 'RenterFriendly' : null,
  ]).slice(0, 5).map((tag) => `#${tag.replace(/^#/, '')}`);
  return { seoTitle, seoDescription, keywords, hashtags, category: profile.category, cluster: product.cluster || null };
}
