import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { products } from '../app/products.ts';

assert.ok(products.length >= 14, 'The legacy catalogue must contain at least 14 products.');
for (const product of products) {
  assert.ok(product.slug && product.image && product.affiliateUrl && product.publishedAt);
  assert.equal(new URL(product.affiliateUrl).hostname, 's.click.aliexpress.com');
  if (product.affiliateDestinationVerified) {
    assert.ok(product.productId, `Verified product ${product.slug} must store its Product ID.`);
    assert.match(product.canonicalProductUrl || '', new RegExp(`/item/${product.productId}\\.html$`));
  }
}
const destinationAudit = JSON.parse(await readFile(new URL('../app/affiliate-destinations.json', import.meta.url), 'utf8'));
assert.equal(destinationAudit.records.length, products.length, 'Every published product must have an Affiliate destination audit record.');
assert.ok(destinationAudit.records.every((record) => record.status === 'PASS' || record.action.includes('CTA_DISABLED')), 'Every failed destination must have its CTA disabled.');
const rssSource = await readFile(new URL('../app/rss.xml/route.ts', import.meta.url), 'utf8');
assert.match(rssSource, /<rss version="2\.0"/);
assert.match(rssSource, /products\.map/);
assert.match(rssSource, /product\.pinImage \?\? product\.image/);

const listed = spawnSync('git', ['ls-files'], { encoding: 'utf8' }).stdout.trim().split(/\r?\n/).filter(Boolean);
const secretPatterns = [/[A-Z0-9]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, /gh[pousr]_[A-Za-z0-9]{30,}/, /sk-[A-Za-z0-9]{32,}/, /AKIA[0-9A-Z]{16}/];
for (const file of listed) {
  if (/\.(png|jpe?g|gif|ico|woff2?)$/i.test(file)) continue;
  const body = await readFile(file, 'utf8').catch(() => '');
  for (const pattern of secretPatterns) assert.equal(pattern.test(body), false, `Potential secret pattern in ${file}`);
}
console.log(JSON.stringify({ ok: true, products: products.length, expectedRssItems: products.length, trackedFilesScanned: listed.length }));
