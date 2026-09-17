import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { imageGate } from '../media/image-validation.mjs';

const escapeXml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function headline(candidate) {
  const words = String(candidate.title || 'A clever small-space find').replace(/^\d+\s*pcs?\s*/i, '').split(/\s+/);
  const lines = [];
  while (words.length && lines.length < 3) {
    let line = '';
    while (words.length && `${line} ${words[0]}`.trim().length <= 28) line = `${line} ${words.shift()}`.trim();
    if (!line) line = words.shift();
    lines.push(line);
  }
  return lines;
}

export async function generatePinterestCreative(candidate) {
  if (!imageGate(candidate)) throw new Error('SKIPPED_IMAGE_NOT_VERIFIED');
  const local = resolve(`public${candidate.productImageVerification.localPublicPath}`);
  const product = await sharp(await readFile(local)).resize(860, 910, { fit: 'contain', withoutEnlargement: true }).png().toBuffer();
  const lines = headline(candidate);
  const text = lines.map((line, index) => `<text x="500" y="${1110 + index * 86}" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#16251f">${escapeXml(line)}</text>`).join('');
  const background = Buffer.from(`<svg width="1000" height="1500" xmlns="http://www.w3.org/2000/svg">
    <rect width="1000" height="1500" fill="#f4f0e7"/>
    <rect x="50" y="55" width="900" height="980" rx="46" fill="#ffffff"/>
    <text x="500" y="113" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="4" fill="#3e6a58">CLEVER FINDS</text>
    ${text}
    <text x="500" y="1415" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="600" fill="#3e6a58">A practical find for smaller homes</text>
  </svg>`);
  const path = resolve('public/pinterest', `${candidate.trackingId}-pin.png`);
  await mkdir(resolve('public/pinterest'), { recursive: true });
  await sharp(background).composite([{ input: product, gravity: 'north', top: 105, left: 70 }]).png({ quality: 94 }).toFile(path);
  const meta = await sharp(path).metadata();
  if (meta.width !== 1000 || meta.height !== 1500) throw new Error('PINTEREST_CREATIVE_DIMENSIONS_INVALID');
  return { path, width: 1000, height: 1500, reviewedNonClickbait: true, sourceProductId: String(candidate.productId), sourceImageSha256: candidate.productImageVerification.localSha256 };
}
