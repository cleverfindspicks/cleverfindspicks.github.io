import { checkedAt, products } from '../products';

const baseUrl = 'https://cleverfindspicks.mohammdmadhar99.chatgpt.site';
const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export function GET() {
  const items = products.map((product) => `
    <item>
      <title>${escapeXml(product.shortName)}</title>
      <link>${baseUrl}/finds/${product.slug}</link>
      <guid isPermaLink="true">${baseUrl}/finds/${product.slug}</guid>
      <description>${escapeXml(`${product.summary} Affiliate disclosure: we may earn a commission from qualifying purchases.`)}</description>
      <pubDate>${new Date(checkedAt).toUTCString()}</pubDate>
      <media:content url="${escapeXml(product.image)}" medium="image" />
    </item>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Clever Finds</title>
    <link>${baseUrl}</link>
    <description>Practical home organisers shortlisted using buyer feedback, recent demand and value.</description>${items}
  </channel>
</rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
