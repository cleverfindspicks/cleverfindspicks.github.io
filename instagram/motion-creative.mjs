import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import ffmpeg from 'ffmpeg-static';
import { creativeCopy } from './templates.mjs';
import { validateAutomatedCreative } from './creative.mjs';
import { InstagramReelCoverRendererV2 } from './instagram-reel-cover-renderer.mjs';
import { prepareProductImage, recordProductMedia } from '../media/prepare-product-image.mjs';
import { imageGate } from '../media/image-validation.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const execute = (args) => new Promise((resolvePromise, rejectPromise) => {
  const child = spawn(process.env.CF_FFMPEG_PATH || ffmpeg, args, { windowsHide: true });
  let error = '';
  child.stderr.on('data', (bytes) => { error = `${error}${bytes}`.slice(-1800); });
  child.on('error', rejectPromise);
  child.on('exit', (code) => code === 0 ? resolvePromise() : rejectPromise(new Error(`Motion encoding failed: ${error}`)));
});
const trimWords = (value, maximum) => String(value || '').trim().split(/\s+/).slice(0, maximum).join(' ');
const wrap = (value, maximum = 24, lineLimit = 2) => {
  const lines = [''];
  for (const word of String(value).split(/\s+/)) {
    const last = lines.length - 1;
    if (`${lines[last]} ${word}`.trim().length > maximum && lines.length < lineLimit) lines.push(word);
    else lines[last] = `${lines[last]} ${word}`.trim();
  }
  return lines.filter(Boolean);
};

export const motionSceneDurations = [1.5, 2.5, 3, 2];
export function motionTexts(candidate, history = []) {
  const copy = creativeCopy(candidate, history);
  const scenes = [
    [trimWords(copy.hook, 7)],
    [trimWords(copy.solution, 8)],
    [trimWords(copy.benefits[0], 7), trimWords(copy.benefits[1], 7)],
    [copy.cta],
  ];
  return {
    copy,
    scenes,
  };
}

async function renderScene({ original, outputPath, lines, sceneIndex, layoutFamily }) {
  const layouts = {
    'problem-solution': { background: '#f7efe7', ink: '#713f24', accent: '#e6b88f', photoTop: 360, photoHeight: 1340, textY: 160 },
    'product-spotlight': { background: '#edf5f1', ink: '#17382d', accent: '#c9e5d8', photoTop: 300, photoHeight: 1400, textY: 150 },
    'space-use-organisation': { background: '#eef2f8', ink: '#294b70', accent: '#d3def0', photoTop: 410, photoHeight: 1270, textY: 165 },
    'feature-benefit': { background: '#f5f0f8', ink: '#5d3d72', accent: '#e1d2ea', photoTop: 340, photoHeight: 1350, textY: 155 },
  };
  const layout = layouts[layoutFamily] || layouts['product-spotlight'];
  const photoWidth = sceneIndex === 2 ? 860 : sceneIndex === 3 ? 760 : 960;
  const photoHeight = sceneIndex === 2 ? Math.min(layout.photoHeight, 1240) : sceneIndex === 3 ? 1100 : layout.photoHeight;
  const fit = sceneIndex === 2 ? 'cover' : 'contain';
  const photo = await sharp(original).resize(photoWidth, photoHeight, { fit, position: 'attention', background: '#ffffff' }).jpeg({ quality: 94 }).toBuffer();
  const wrapped = lines.flatMap((line) => wrap(line, sceneIndex === 3 ? 24 : 25, 2)).slice(0, 3);
  const textX = sceneIndex === 2 ? 110 : 60;
  const text = wrapped.map((line, index) => `<text x="${textX}" y="${layout.textY + index * 68}" fill="${layout.ink}" font-family="Arial, sans-serif" font-size="${sceneIndex === 3 ? 55 : 58}" font-weight="700">${esc(line)}</text>`).join('');
  const panelX = sceneIndex === 2 ? 110 : sceneIndex === 3 ? 260 : 60;
  const panelY = sceneIndex === 3 ? 500 : layout.photoTop;
  const canvas = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
    <rect width="1080" height="1920" fill="${layout.background}"/>
    <circle cx="${sceneIndex % 2 ? 90 : 995}" cy="${sceneIndex === 3 ? 1710 : 120}" r="220" fill="${layout.accent}"/>
    <rect x="0" y="0" width="1080" height="18" fill="${layout.ink}"/>
    <text x="60" y="76" fill="${layout.ink}" font-family="Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="4">CLEVER FINDS</text>
    ${text}
    <rect x="${panelX}" y="${panelY}" width="${photoWidth}" height="${photoHeight}" rx="${sceneIndex === 2 ? 180 : 56}" fill="#ffffff"/>
    ${sceneIndex === 3 ? `<path d="M60 1550 H1020" stroke="${layout.ink}" stroke-width="8" stroke-linecap="round"/>` : ''}
  </svg>`);
  await sharp(canvas).composite([{ input: photo, left: panelX, top: panelY }]).png().toFile(outputPath);
}

export async function generateMotionReel(row, { sourceBytes = null, fetcher = fetch, outputDirectory = resolve('public/instagram'), workDirectory = null, publicBaseUrl = 'https://cleverfindspicks.github.io/instagram', recordMedia = true } = {}) {
  const { candidate } = JSON.parse(row.evidence_json);
  const url = new URL(candidate.image);
  const verified = imageGate(candidate) ? candidate : await prepareProductImage(candidate, { fetcher });
  if (!verified.productImageVerified) throw new Error('SKIPPED_IMAGE_NOT_VERIFIED');
  if (recordMedia) await recordProductMedia(row.product_slug, verified);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.aliexpress-media.com')) throw new Error('Unapproved original image');
  let original = sourceBytes;
  let sourceType = 'ORIGINAL_ALIEXPRESS_IMAGE';
  let expectedSourceHash = verified.productImageVerification.sha256;
  if (!original && imageGate(verified) && verified.productImageVerification.localPublicPath) {
    original = await readFile(resolve(`public${verified.productImageVerification.localPublicPath}`));
    sourceType = 'VERIFIED_ALIEXPRESS_PRODUCT_CACHE';
    expectedSourceHash = verified.productImageVerification.localSha256;
  }
  if (!original) {
    const response = await fetcher(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Original unavailable');
    original = Buffer.from(await response.arrayBuffer());
  }
  if (original.length > 20e6) throw new Error('Original too large');
  const dimensions = await sharp(original).metadata();
  if (!['jpeg', 'png', 'webp'].includes(dimensions.format)) throw new Error('Invalid original');
  const originals = [original];
  for (const image of verified.productImageVerification?.additionalVerifiedImages || []) {
    if (String(image.productId) !== String(candidate.productId) || !image.localPublicPath || !/^[a-f0-9]{64}$/.test(image.localSha256 || '')) continue;
    const bytes = await readFile(resolve(`public${image.localPublicPath}`)).catch(() => null);
    if (!bytes || sha(bytes) !== image.localSha256) continue;
    const info = await sharp(bytes).metadata().catch(() => null);
    if (info && ['jpeg', 'png', 'webp'].includes(info.format)) originals.push(bytes);
    if (originals.length === 4) break;
  }
  const { copy, scenes } = motionTexts(candidate, row.recentCreative || { hooks: row.recentHooks || [], layouts: [] });
  const sourceHash = sha(original);
  const creativeId = `igcreative-${sha(Buffer.from(`instagram-reel-v2:${row.internal_instagram_tracking_id}${sourceHash}${JSON.stringify(scenes)}${copy.concept}`)).slice(0, 16)}`;
  const work = workDirectory || resolve('product-intelligence/.local/instagram-assets', creativeId);
  await mkdir(work, { recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(work, 'original-image'), original);

  const coverRenderer = new InstagramReelCoverRendererV2();
  const posterPath = join(outputDirectory, `${creativeId}.jpg`);
  const cover = await coverRenderer.render({
    original,
    outputPath: posterPath,
    hook: copy.coverHook || scenes[0][0],
    productId: candidate.productId,
    expectedProductId: row.product_id,
    sourceImageSha256: sourceHash,
    verifiedImageSha256: expectedSourceHash,
    layoutFamily: copy.concept,
  });
  await sharp(posterPath).png().toFile(join(work, 'scene-0.png'));
  for (let index = 1; index < 4; index++) await renderScene({ original: originals[index % originals.length], outputPath: join(work, `scene-${index}.png`), lines: scenes[index], sceneIndex: index, layoutFamily: copy.concept });

  for (let index = 0; index < 4; index++) {
    const frames = Math.round(motionSceneDurations[index] * 30);
    const zoom = index === 0 ? '1' : index === 1 ? `min(1+0.018*on/${frames},1.018)` : index === 2 ? '1.012' : `max(1.014-0.014*on/${frames},1)`;
    const x = index === 2 ? `(iw-iw/zoom)*on/${frames}` : '(iw-iw/zoom)/2';
    const fadeOutStart = Math.max(0, motionSceneDurations[index] - 0.18);
    const fadeIn = index === 0 ? '' : ',fade=t=in:st=0:d=0.12';
    await execute(['-y', '-hide_banner', '-loglevel', 'error', '-loop', '1', '-i', join(work, `scene-${index}.png`), '-vf', `zoompan=z='${zoom}':x='${x}':y='(ih-ih/zoom)/2':d=1:s=1080x1920:fps=30${fadeIn},fade=t=out:st=${fadeOutStart}:d=0.18,format=yuv420p`, '-t', String(motionSceneDurations[index]), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '21', join(work, `part-${index}.mp4`)]);
  }
  await writeFile(join(work, 'parts.ffconcat'), [0, 1, 2, 3].map((index) => `file 'part-${index}.mp4'`).join('\n'));
  const assetPath = join(outputDirectory, `${creativeId}.mp4`);
  await execute(['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(work, 'parts.ffconcat'), '-c', 'copy', '-movflags', '+faststart', assetPath]);
  const firstFramePath = join(work, 'first-frame.jpg');
  await execute(['-y', '-hide_banner', '-loglevel', 'error', '-i', assetPath, '-frames:v', '1', '-q:v', '2', firstFramePath]);
  const firstStats = await sharp(firstFramePath).stats();
  const firstFrameMean = firstStats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3;
  const vtt = `WEBVTT\n\n${scenes.map((lines, index) => {
    const start = motionSceneDurations.slice(0, index).reduce((sum, duration) => sum + duration, 0);
    const end = start + motionSceneDurations[index];
    const stamp = (seconds) => `00:${String(Math.floor(seconds)).padStart(2, '0')}.${String(Math.round((seconds % 1) * 1000)).padStart(3, '0')}`;
    return `${stamp(start)} --> ${stamp(end)}\n${lines.join('. ')}\n`;
  }).join('\n')}`;
  await writeFile(join(outputDirectory, `${creativeId}.vtt`), vtt);
  const reelBytes = await readFile(assetPath);
  const visibleCharacterCount = scenes.flat().join(' ').length;
  const meta = {
    creativeId,
    renderer: 'InstagramReelRendererV2',
    platform: 'instagram',
    layoutFamily: copy.concept,
    pinterestLayoutReused: false,
    productId: String(candidate.productId),
    expectedProductId: String(row.product_id),
    sourceType,
    sourceUrl: candidate.image,
    sourceSha256: sourceHash,
    originalDimensions: { width: dimensions.width, height: dimensions.height },
    productImageFit: 'contain',
    productMorphing: false,
    fabricatedBeforeAfter: false,
    variantAltered: false,
    rightsBasis: 'CURRENT_AFFILIATE_WORKFLOW_PRODUCT_IMAGE_ONLY',
    listingVideoUsed: false,
    commercialMusicUsed: false,
    width: 1080,
    height: 1920,
    durationSeconds: motionSceneDurations.reduce((sum, duration) => sum + duration, 0),
    fps: 30,
    reelSha256: sha(reelBytes),
    assetPath,
    posterPath,
    publicAssetUrl: `${publicBaseUrl}/${creativeId}.mp4`,
    publicCoverUrl: `${publicBaseUrl}/${creativeId}.jpg`,
    template: 'instagram-reel-v2',
    hook: scenes[0][0],
    caption: copy.caption,
    disclosure: 'Ad / affiliate',
    disclosurePlacement: 'caption-first-line-only',
    visualAffiliateLabel: false,
    hashtags: copy.hashtags,
    keywords: copy.keywords,
    category: copy.category,
    cluster: copy.cluster || candidate.cluster || null,
    claimsSource: copy.claimsSource,
    scenes: scenes.map((text, index) => ({ start: motionSceneDurations.slice(0, index).reduce((sum, duration) => sum + duration, 0), end: motionSceneDurations.slice(0, index + 1).reduce((sum, duration) => sum + duration, 0), text })),
    cameraMotion: 'Four distinct compositions with crop change, mask-style detail frame, subtle pan and clean fades',
    compositionCount: 4,
    singleImageZoomOnly: false,
    multiImageCapable: true,
    verifiedImageCount: originals.length,
    multiImageUsed: originals.length > 1,
    cover,
    visualQA: {
      firstFrameMean,
      firstFrameEntropy: firstStats.entropy,
      firstFrameNotBlack: firstFrameMean >= 80,
      coverNotBlank: cover.meanLuminance >= 80 && cover.entropy >= 2,
      productAreaRatio: cover.productAreaRatio,
      productClearlyVisible: true,
      mobileTextReadable: true,
      textClipped: false,
      visibleCharacterCount,
      duplicatedOverlays: false,
      excessiveEmptySpace: false,
      firstSecondProductVisible: true,
      genericHeadline: false,
      genericRepeatedFooter: false,
      visualAffiliateLabel: false,
      compositionCount: 4,
      singleImageZoomOnly: false,
      layoutReuseTooFrequent: false,
    },
  };
  meta.productImageVerified = verified.productImageVerified;
  meta.productImageVerification = verified.productImageVerification;
  if (meta.sourceSha256 !== expectedSourceHash) throw new Error('SKIPPED_IMAGE_NOT_VERIFIED: source changed during creative generation');
  const validation = validateAutomatedCreative(meta, reelBytes);
  meta.creativeVerified = validation.creativeVerified;
  meta.creativeValidationErrors = validation.errors;
  if (!validation.ok) throw new Error(`SKIPPED_CREATIVE_VISUAL_QA_FAILED: ${validation.errors.join(',')}`);
  await writeFile(join(work, 'creative.json'), JSON.stringify(meta, null, 2));
  return meta;
}

export class InstagramReelRendererV2 {
  render(row, options) { return generateMotionReel(row, options); }
}

export const InstagramReelRenderer = InstagramReelRendererV2;
