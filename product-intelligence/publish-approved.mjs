import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { validatePublicationBundle } from './publication-gate.mjs';

const bundlePath = process.argv[2];
if (!bundlePath) throw new Error('Usage: node product-intelligence/publish-approved.mjs <approved-bundle.json>');
const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
const gate = validatePublicationBundle(bundle);
if (!gate.ok) {
  console.error(JSON.stringify({ ok: false, status: 'BLOCKED_BY_PUBLICATION_GATE', errors: gate.errors }, null, 2));
  process.exit(1);
}
const target = new URL('../app/generated-products.json', import.meta.url);
const before = await readFile(target, 'utf8');
const products = JSON.parse(before);
if (products.some((item) => item.slug === bundle.landingPage.slug)) throw new Error('Generated product slug already exists.');
const creativeSource = resolve(bundle.candidate.pinCreative.path);
const creativeName = basename(creativeSource);
await copyFile(creativeSource, new URL(`../public/pinterest/${creativeName}`, import.meta.url));
products.push({ ...bundle.landingPage, pinImage: `https://cleverfindspicks.github.io/pinterest/${creativeName}`, affiliateUrl: bundle.candidate.affiliateUrl, publishedAt: bundle.publishedAt });
await writeFile(target, JSON.stringify(products, null, 2));
const build = process.platform === 'win32'
  ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'pnpm build'], { cwd: new URL('..', import.meta.url), stdio: 'inherit' })
  : spawnSync('pnpm', ['build'], { cwd: new URL('..', import.meta.url), stdio: 'inherit' });
if (build.status !== 0) {
  await writeFile(target, before);
  throw new Error('Build failed; generated-products.json was rolled back.');
}
console.log(JSON.stringify({ ok: true, status: 'BUILT_AWAITING_GIT_PUBLISH', slug: bundle.landingPage.slug }));
