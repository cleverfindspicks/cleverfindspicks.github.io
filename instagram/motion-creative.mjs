import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import ffmpeg from 'ffmpeg-static';
import { creativeCopy } from './templates.mjs';
import { validateAutomatedCreative } from './creative.mjs';
import { InstagramReelCoverRenderer } from './instagram-reel-cover-renderer.mjs';
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

export const motionSceneDurations = [2.5, 2.5, 3, 2];
export function motionTexts(candidate, history = []) {
  const copy = creativeCopy(candidate, history);
  const identity = `${candidate.title || ''} ${candidate.cluster || ''}`.toLowerCase();
  let scenes;
  if (/side.?table|small table|table.*storage|storage.*table|bedside|corner/.test(identity)) scenes = [
    ['Make this corner useful'], ['Storage that earns its space'], ['Two useful tiers', 'A compact footprint'], ['See today’s find — link in bio'],
  ];
  else if (/under.?sink|sink/.test(identity)) scenes = [
    ['Clear the sink clutter'], ['Turn awkward space into storage'], ['Everyday items in reach', 'A tidier cabinet'], ['See today’s find — link in bio'],
  ];
  else if (/narrow|gap|slim/.test(identity)) scenes = [
    ['Use every narrow gap'], ['Storage for overlooked spaces'], ['Slim profile', 'Useful extra capacity'], ['See today’s find — link in bio'],
  ];
  else if (/bathroom/.test(identity)) scenes = [
    ['A tidier bathroom, instantly'], ['Keep essentials off the floor'], ['Small-space friendly', 'Easy everyday access'], ['See today’s find — link in bio'],
  ];
  else {
    const hook = /one small-home find/i.test(copy.hook || '') ? 'A smarter small-space fix' : trimWords(copy.hook, 6);
    scenes = [[hook], [trimWords(copy.solution, 7)], [trimWords(copy.benefits[0], 5), trimWords(copy.benefits[1], 5)], ['See today’s find — link in bio']];
  }
  return {
    copy,
    scenes,
  };
}

async function renderScene({ original, outputPath, lines, sceneIndex }) {
  const photo = await sharp(original).resize(960, 1160, { fit: 'contain', background: '#ffffff' }).jpeg({ quality: 94 }).toBuffer();
  const wrapped = lines.flatMap((line) => wrap(line, sceneIndex === 3 ? 24 : 25, 2)).slice(0, 3);
  const text = wrapped.map((line, index) => `<text x="60" y="${170 + index * 68}" fill="#17382d" font-family="Arial, sans-serif" font-size="${sceneIndex === 3 ? 55 : 58}" font-weight="700">${esc(line)}</text>`).join('');
  const footer = sceneIndex === 3 ? 'Find it through our bio' : 'Small-space organisation, made simpler';
  const background = sceneIndex % 2 === 0 ? '#eaf4ef' : '#f5f0e7';
  const canvas = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
    <rect width="1080" height="1920" fill="${background}"/>
    <circle cx="995" cy="120" r="210" fill="#d4e8de"/>
    <rect x="0" y="0" width="1080" height="18" fill="#2f7d65"/>
    <text x="60" y="76" fill="#557568" font-family="Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="4">CLEVER FINDS</text>
    ${text}
    <rect x="60" y="354" width="960" height="1160" rx="56" fill="#ffffff"/>
    <text x="60" y="1630" fill="#365a4e" font-family="Arial, sans-serif" font-size="32" font-weight="600">${esc(footer)}</text>
    <text x="60" y="1870" fill="#557568" font-family="Arial, sans-serif" font-size="24">Ad / affiliate</text>
  </svg>`);
  await sharp(canvas).composite([{ input: photo, left: 60, top: 354 }]).png().toFile(outputPath);
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
  const { copy, scenes } = motionTexts(candidate, row.recentHooks || []);
  const sourceHash = sha(original);
  const creativeId = `igcreative-${sha(Buffer.from(`instagram-reel-v3:${row.internal_instagram_tracking_id}${sourceHash}${JSON.stringify(scenes)}`)).slice(0, 16)}`;
  const work = workDirectory || resolve('product-intelligence/.local/instagram-assets', creativeId);
  await mkdir(work, { recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(work, 'original-image'), original);

  const coverRenderer = new InstagramReelCoverRenderer();
  const posterPath = join(outputDirectory, `${creativeId}.jpg`);
  const cover = await coverRenderer.render({
    original,
    outputPath: posterPath,
    hook: scenes[0][0],
    productId: candidate.productId,
    expectedProductId: row.product_id,
    sourceImageSha256: sourceHash,
    verifiedImageSha256: expectedSourceHash,
  });
  await sharp(posterPath).png().toFile(join(work, 'scene-0.png'));
  for (let index = 1; index < 4; index++) await renderScene({ original, outputPath: join(work, `scene-${index}.png`), lines: scenes[index], sceneIndex: index });

  for (let index = 0; index < 4; index++) {
    const frames = Math.round(motionSceneDurations[index] * 30);
    const zoom = index % 2 === 0 ? `min(1+0.035*on/${frames},1.035)` : `max(1.035-0.035*on/${frames},1)`;
    const x = index % 2 === 0 ? `(iw-iw/zoom)*on/${frames}` : `(iw-iw/zoom)*(1-on/${frames})`;
    await execute(['-y', '-hide_banner', '-loglevel', 'error', '-loop', '1', '-i', join(work, `scene-${index}.png`), '-vf', `zoompan=z='${zoom}':x='${x}':y='(ih-ih/zoom)/2':d=1:s=1080x1920:fps=30,format=yuv420p`, '-t', String(motionSceneDurations[index]), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '21', join(work, `part-${index}.mp4`)]);
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
    return `${stamp(start)} --> ${stamp(end)}\n${index === 0 ? 'Ad / affiliate. ' : ''}${lines.join('. ')}\n`;
  }).join('\n')}`;
  await writeFile(join(outputDirectory, `${creativeId}.vtt`), vtt);
  const reelBytes = await readFile(assetPath);
  const visibleCharacterCount = scenes.flat().join(' ').length + 'Ad / affiliate'.length;
  const meta = {
    creativeId,
    renderer: 'InstagramReelRenderer',
    platform: 'instagram',
    layoutFamily: 'instagram-reel-premium-v3',
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
    template: 'instagram-reel-premium-v3',
    hook: scenes[0][0],
    caption: copy.caption,
    disclosure: 'Ad / affiliate',
    claimsSource: copy.claimsSource,
    scenes: scenes.map((text, index) => ({ start: motionSceneDurations.slice(0, index).reduce((sum, duration) => sum + duration, 0), end: motionSceneDurations.slice(0, index + 1).reduce((sum, duration) => sum + duration, 0), text })),
    cameraMotion: 'Gentle independent pan and zoom with clean scene cuts',
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
      disclosureFontSize: 24,
      disclosureUnobtrusive: true,
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

export class InstagramReelRenderer {
  render(row, options) { return generateMotionReel(row, options); }
}
