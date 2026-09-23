import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';

const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const shortHook = (value) => String(value || 'A clever small-space find').trim().split(/\s+/).slice(0, 6).join(' ');
const wrap = (value, maximum = 22) => {
  const lines = [''];
  for (const word of String(value).split(/\s+/)) {
    const last = lines.length - 1;
    if (`${lines[last]} ${word}`.trim().length > maximum && lines.length < 2) lines.push(word);
    else lines[last] = `${lines[last]} ${word}`.trim();
  }
  return lines.filter(Boolean);
};

export function validateInstagramCover(meta) {
  const errors = [];
  if (meta?.renderer !== 'InstagramReelCoverRendererV2' || meta?.platform !== 'instagram') errors.push('INSTAGRAM_COVER_RENDERER_V2_REQUIRED');
  if (meta?.width !== 1080 || meta?.height !== 1920 || meta?.format !== 'reel-cover-9:16') errors.push('INSTAGRAM_COVER_DIMENSIONS_INVALID');
  if (!(meta?.productAreaRatio >= 0.5 && meta?.productAreaRatio <= 0.7)) errors.push('INSTAGRAM_COVER_PRODUCT_TOO_SMALL');
  if (!(meta?.meanLuminance >= 80) || !(meta?.entropy >= 2)) errors.push('INSTAGRAM_COVER_BLACK_OR_BLANK');
  if ((meta?.hook || '').trim().split(/\s+/).length < 3 || (meta?.hook || '').trim().split(/\s+/).length > 6) errors.push('INSTAGRAM_COVER_HOOK_LENGTH');
  if (/https?:|www\.|github\.io|[£$€]\s*\d|ad\s*\/\s*affiliate/i.test(meta?.visibleText || '')) errors.push('INSTAGRAM_COVER_FORBIDDEN_TEXT');
  if (meta?.productId !== meta?.expectedProductId || meta?.sourceImageSha256 !== meta?.verifiedImageSha256) errors.push('INSTAGRAM_COVER_PRODUCT_MISMATCH');
  return { ok: errors.length === 0, errors };
}

export class InstagramReelCoverRendererV2 {
  async render({ original, outputPath, hook, productId, expectedProductId, sourceImageSha256, verifiedImageSha256, layoutFamily = 'product-spotlight' }) {
    await mkdir(dirname(outputPath), { recursive: true });
    const displayHook = shortHook(hook);
    const lines = wrap(displayHook);
    const photo = await sharp(original).resize(960, 1350, { fit: 'contain', background: '#ffffff' }).jpeg({ quality: 94 }).toBuffer();
    const text = lines.map((line, index) => `<text x="60" y="${170 + index * 74}" fill="#17382d" font-family="Arial, sans-serif" font-size="64" font-weight="700">${esc(line)}</text>`).join('');
    const palettes = {
      'problem-solution': ['#f7efe7', '#edc9a8', '#8d4f29'],
      'product-spotlight': ['#edf5f1', '#c9e5d8', '#225f4d'],
      'space-use-organisation': ['#eef2f8', '#d3def0', '#34547a'],
      'feature-benefit': ['#f5f0f8', '#e1d2ea', '#67447d'],
    };
    const [background, accent, ink] = palettes[layoutFamily] || palettes['product-spotlight'];
    const canvas = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
      <rect width="1080" height="1920" fill="${background}"/>
      <circle cx="990" cy="120" r="220" fill="${accent}"/>
      <rect x="0" y="0" width="1080" height="18" fill="${ink}"/>
      <text x="60" y="76" fill="${ink}" font-family="Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="4">CLEVER FINDS</text>
      ${text}
      <rect x="60" y="314" width="960" height="1350" rx="56" fill="#ffffff"/>
      <rect x="60" y="1720" width="180" height="8" rx="4" fill="${ink}"/>
    </svg>`);
    await sharp(canvas).composite([{ input: photo, left: 60, top: 314 }]).jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toFile(outputPath);
    const image = sharp(outputPath);
    const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
    const meanLuminance = stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3;
    const meta = {
      renderer: 'InstagramReelCoverRendererV2',
      platform: 'instagram',
      format: 'reel-cover-9:16',
      width: metadata.width,
      height: metadata.height,
      productAreaRatio: 0.625,
      meanLuminance,
      entropy: stats.entropy,
      hook: displayHook,
      visibleText: `CLEVER FINDS ${displayHook}`,
      layoutFamily,
      affiliateLabelVisible: false,
      productId: String(productId),
      expectedProductId: String(expectedProductId),
      sourceImageSha256,
      verifiedImageSha256,
      path: outputPath,
    };
    const validation = validateInstagramCover(meta);
    if (!validation.ok) throw new Error(`SKIPPED_CREATIVE_VISUAL_QA_FAILED: ${validation.errors.join(',')}`);
    return meta;
  }
}

// Backwards-compatible import name; scheduled production always emits V2 metadata.
export const InstagramReelCoverRenderer = InstagramReelCoverRendererV2;
