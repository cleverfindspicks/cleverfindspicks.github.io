import { generatePinterestSeo } from './pinterest-seo.mjs';

function slugify(value) {
  return String(value).toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '').slice(0, 72);
}

export function buildContentCandidate(candidate) {
  const pinterestSeo = generatePinterestSeo(candidate);
  const isSideTable = /side.*table|coffee table|storage table/i.test(candidate.title);
  const shortName = isSideTable ? 'Two-tier storage side table' : String(candidate.title).replace(/^\d+\s*pcs?\s*/i, '').slice(0, 68);
  const summary = isSideTable
    ? 'A compact two-tier side table that keeps everyday items close while adding a lower storage shelf without a bulky footprint.'
    : `A practical ${candidate.cluster.replaceAll('-', ' ')} option selected for smaller homes after price, demand and buyer-intent checks.`;
  const slug = slugify(shortName);
  const imageName = candidate.pinCreative?.path?.split('/').at(-1);
  const landingPage = {
    slug,
    eyebrow: candidate.cluster.replaceAll('-', ' ').toUpperCase(),
    name: String(candidate.title).slice(0, 120),
    shortName,
    summary,
    price: `From £${Number(candidate.metrics.priceGbp).toFixed(2)}`,
    positiveFeedback: `${candidate.metrics.feedbackPct}%`,
    recentVolume: Number(candidate.metrics.recentVolume).toLocaleString('en-GB'),
    image: candidate.image,
    affiliateUrl: candidate.affiliateUrl,
    productId: candidate.productId,
    canonicalProductUrl: candidate.canonicalProductUrl,
    affiliateDestinationVerified: candidate.affiliateDestinationVerified === true,
    affiliateDestinationStatus: candidate.affiliateDestination?.reason || 'NOT_VERIFIED',
    affiliateDestinationCheckedAt: candidate.affiliateDestination?.checkedAt || null,
    bestFor: isSideTable ? ['Small living rooms', 'Bedside storage', 'Using vertical space beside a sofa or bed'] : ['Small homes', 'Reducing visible clutter', 'A removable organisation upgrade'],
    checks: ['Check the exact dimensions against your available space.', 'Confirm the selected option and quantity on AliExpress.', 'Check the current delivered price before ordering.'],
  };
  return {
    landingPage,
    rssItem: { title: shortName, link: `https://cleverfindspicks.github.io/finds/${slug}`, image: imageName ? `https://cleverfindspicks.github.io/pinterest/${imageName}` : 'PENDING_CREATIVE' },
    pin: {
      title: pinterestSeo.seoTitle,
      description: pinterestSeo.seoDescription,
      seoTitle: pinterestSeo.seoTitle,
      seoDescription: pinterestSeo.seoDescription,
      keywords: pinterestSeo.keywords,
      hashtags: pinterestSeo.hashtags,
      category: pinterestSeo.category,
      cluster: pinterestSeo.cluster,
    },
  };
}
