import { products } from '../products';

const baseUrl = 'https://cleverfindspicks.github.io';
const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export const dynamic = 'force-static';

export function GET() {
  const items = products.map((product) => `
    <item>
      <title>${escapeXml(product.shortName)}</title>
      <link>${baseUrl}/finds/${product.slug}</link>
      <guid isPermaLink="true">${baseUrl}/finds/${product.slug}</guid>
      <description>${escapeXml(`${product.summary} Affiliate disclosure: we may earn a commission from qualifying purchases.`)}</description>
      <pubDate>${new Date(product.publishedAt).toUTCString()}</pubDate>
      <media:content url="${escapeXml(product.image)}" medium="image" />
    </item>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Clever Finds</title>
    <link>${baseUrl}</link>
    <description>Practical home organisers shortlisted using buyer feedback, recent demand and value.</description>
    <lastBuildDate>${new Date(Math.max(...products.map((product) => Date.parse(product.publishedAt)))).toUTCString()}</lastBuildDate>
    <ttl>15</ttl>${items}
  </channel>
</rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' } });
}
