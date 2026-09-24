import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import { imageGate } from '../media/image-validation.mjs';

const escapeXml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const wrap = (value, maximum = 24, linesMaximum = 2) => {
  const words = String(value).trim().split(/\s+/);
  const lines = [''];
  for (const word of words) {
    const last = lines.length - 1;
    if (`${lines[last]} ${word}`.trim().length > maximum && lines.length < linesMaximum) lines.push(word);
    else lines[last] = `${lines[last]} ${word}`.trim();
  }
  return lines.filter(Boolean);
};

export function pinterestCopy(candidate) {
  const text = `${candidate.title || ''} ${candidate.cluster || ''}`.toLowerCase();
  if (/narrow|gap|slim/.test(text)) return { hook: 'Use every narrow gap', benefit: 'Slim storage for overlooked spaces.' };
  if (/under.?sink|sink/.test(text)) return { hook: 'Make sink space work', benefit: 'Keep everyday essentials within reach.' };
  if (/no.?drill|renter/.test(text)) return { hook: 'Storage without drilling', benefit: 'A removable fix for smaller homes.' };
  if (/wardrobe|clothes|hanger/.test(text)) return { hook: 'Make wardrobes work harder', benefit: 'Create useful space without extra furniture.' };
  if (/side.?table|small table|table.*storage|storage.*table|bedside|corner/.test(text)) return { hook: 'Make this corner useful', benefit: 'Add practical storage without a bulky footprint.' };
  if (/kitchen|countertop|drawer/.test(text)) return { hook: 'Clear the kitchen clutter', benefit: 'A practical home for everyday essentials.' };
  return { hook: 'A smarter small-space fix', benefit: 'Practical organisation without the bulky footprint.' };
}

export function validatePinterestCreative(meta) {
  const visible = (meta?.visibleText || []).join(' ');
  const errors = [];
  if (meta?.renderer !== 'PinterestCreativeRenderer' || meta?.platform !== 'pinterest') errors.push('BLOCKED_CROSS_PLATFORM_CREATIVE_CONTAMINATION');
  if (meta?.format !== 'static-2:3' || meta?.width !== 1000 || meta?.height !== 1500) errors.push('PINTEREST_STATIC_2_3_REQUIRED');
  if (meta?.layoutFamily !== 'pinterest-editorial-v3' || meta?.videoFrameStyling !== false) errors.push('BLOCKED_CROSS_PLATFORM_CREATIVE_CONTAMINATION');
  if (/link in bio|reel|instagram|ad\s*\/\s*affiliate/i.test(visible)) errors.push('BLOCKED_CROSS_PLATFORM_CREATIVE_CONTAMINATION');
  if (meta?.sourceProductId == null || !/^[a-f0-9]{64}$/.test(meta?.sourceImageSha256 || '')) errors.push('PINTEREST_PRODUCT_PROVENANCE_MISSING');
  if (meta?.rawProductImageAsPin !== false) errors.push('RAW_PRODUCT_IMAGE_AS_PIN');
  if (!(meta?.productAreaRatio >= 0.5 && meta?.productAreaRatio <= 0.72)) errors.push('PINTEREST_PRODUCT_NOT_PRIMARY');
  return { ok: errors.length === 0, errors };
}

export class PinterestCreativeRenderer {
  async render(candidate, { outputPath } = {}) {
    if (!imageGate(candidate)) throw new Error('SKIPPED_IMAGE_NOT_VERIFIED');
    const local = resolve(`public${candidate.productImageVerification.localPublicPath}`);
    const product = await sharp(await readFile(local)).resize(880, 900, { fit: 'contain', background: '#ffffff', withoutEnlargement: true }).png().toBuffer();
    const copy = pinterestCopy(candidate);
    const hook = wrap(copy.hook, 23, 2);
    const benefit = wrap(copy.benefit, 42, 2);
    const hookText = hook.map((line, index) => `<text x="64" y="${168 + index * 70}" font-family="Arial, sans-serif" font-size="62" font-weight="700" fill="#17382d">${escapeXml(line)}</text>`).join('');
    const benefitText = benefit.map((line, index) => `<text x="64" y="${1328 + index * 43}" font-family="Arial, sans-serif" font-size="32" font-weight="500" fill="#365a4e">${escapeXml(line)}</text>`).join('');
    const background = Buffer.from(`<svg width="1000" height="1500" xmlns="http://www.w3.org/2000/svg">
      <rect width="1000" height="1500" fill="#f5f0e6"/>
      <rect x="0" y="0" width="18" height="1500" fill="#d89b5b"/>
      <text x="64" y="78" font-family="Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="4" fill="#557568">CLEVER FINDS · SMALL-SPACE EDIT</text>
      ${hookText}
      <rect x="54" y="304" width="892" height="930" rx="42" fill="#ffffff"/>
      ${benefitText}
      <text x="64" y="1450" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="2" fill="#a36c3e">SEE THE FULL FIND</text>
    </svg>`);
    const path = outputPath || resolve('public/pinterest', `${candidate.trackingId}-pin.png`);
    await mkdir(dirname(path), { recursive: true });
    await sharp(background).composite([{ input: product, left: 60, top: 320 }]).png({ quality: 94 }).toFile(path);
    const metadata = await sharp(path).metadata();
    const meta = {
      path,
      width: metadata.width,
      height: metadata.height,
      reviewedNonClickbait: true,
      renderer: 'PinterestCreativeRenderer',
      platform: 'pinterest',
      mediaType: 'IMAGE',
      videoSourceType: null,
      rawProductImageAsPin: false,
      format: 'static-2:3',
      layoutFamily: 'pinterest-editorial-v3',
      videoFrameStyling: false,
      sourceProductId: String(candidate.productId),
      sourceImageSha256: candidate.productImageVerification.localSha256,
      productAreaRatio: 0.535,
      visibleText: ['CLEVER FINDS', copy.hook, copy.benefit, 'SEE THE FULL FIND'],
      hook: copy.hook,
      benefit: copy.benefit,
    };
    const validation = validatePinterestCreative(meta);
    if (!validation.ok) throw new Error(validation.errors.join(','));
    return meta;
  }
}

const renderer = new PinterestCreativeRenderer();
export const generatePinterestCreative = (candidate, options) => renderer.render(candidate, options);
