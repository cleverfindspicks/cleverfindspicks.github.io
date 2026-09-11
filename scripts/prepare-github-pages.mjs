import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { products } from '../app/products.ts';

const outputDirectory = 'dist/client';
const baseUrl = 'https://cleverfindspicks.github.io';
const escapeXml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');
const imageType = (url) => url.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg';

async function addDirectoryIndexes(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await addDirectoryIndexes(path);
      continue;
    }
    if (!entry.name.endsWith('.html') || entry.name === 'index.html' || entry.name === '404.html') continue;
    const cleanPath = path.slice(0, -'.html'.length);
    await mkdir(cleanPath, { recursive: true });
    await copyFile(path, join(cleanPath, 'index.html'));
  }
}

const items = products.map((product) => {
  const image = product.pinImage ?? product.image;
  return `
    <item>
      <title>${escapeXml(product.shortName)}</title>
      <link>${baseUrl}/finds/${product.slug}/</link>
      <guid isPermaLink="true">${baseUrl}/finds/${product.slug}/</guid>
      <description>${escapeXml(`${product.summary} Affiliate disclosure: we may earn a commission from qualifying purchases.`)}</description>
      <pubDate>${new Date(product.publishedAt).toUTCString()}</pubDate>
      <media:content url="${escapeXml(image)}" medium="image" />
      <enclosure url="${escapeXml(image)}" type="${imageType(image)}" length="0" />
    </item>`;
}).join('');

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

await addDirectoryIndexes(outputDirectory);
await writeFile(join(outputDirectory, 'rss.xml'), xml, 'utf8');
await writeFile(join(outputDirectory, '.nojekyll'), '', 'utf8');
console.log(`Prepared ${relative(process.cwd(), outputDirectory)} for GitHub Pages.`);
