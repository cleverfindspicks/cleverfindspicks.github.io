import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const registryUrl = new URL('../app/product-videos.json', import.meta.url);
const allowedVideoTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const allowedHost = (hostname) => hostname.endsWith('.aliexpress-media.com');
const execute = (args) => new Promise((resolvePromise, rejectPromise) => {
  const child = spawn(process.env.CF_FFMPEG_PATH || ffmpeg, args, { windowsHide: true });
  let stderr = '';
  child.stderr.on('data', (bytes) => { stderr = `${stderr}${bytes}`.slice(-12000); });
  child.on('error', rejectPromise);
  child.on('exit', (code) => code === 0 ? resolvePromise(stderr) : rejectPromise(new Error(`VIDEO_DECODE_FAILED: ${stderr.slice(-1200)}`)));
});
const readRegistry = async () => JSON.parse(await readFile(registryUrl, 'utf8').catch(() => '{"schemaVersion":1,"records":[]}'));
async function saveRegistry(registry) {
  registry.updatedAt = new Date().toISOString();
  const temporary = new URL(`../app/product-videos.${process.pid}.tmp`, import.meta.url);
  await writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`);
  await rename(temporary, registryUrl);
}

export function discoverOfficialProductVideo(candidate) {
  const productId = String(candidate?.productId || '');
  const options = [
    candidate?.productVideo?.sourceUrl,
    candidate?.productVideoUrl,
    candidate?.officialProductVideoUrl,
    ...(candidate?.officialProductVideoUrls || []),
  ].filter(Boolean);
  const sourceUrl = options.find((value) => {
    try { const url = new URL(value); return url.protocol === 'https:' && allowedHost(url.hostname); } catch { return false; }
  });
  const associatedProductId = String(candidate?.productVideo?.productId || candidate?.productVideoProductId || '');
  if (!sourceUrl || associatedProductId !== productId) return { found: false, reason: 'NO_EXACT_OFFICIAL_PRODUCT_VIDEO' };
  if (!['ALIEXPRESS_OFFICIAL_PRODUCT_MEDIA_API', 'ALIEXPRESS_OFFICIAL_PRODUCT_DETAIL'].includes(candidate?.productVideoSourceBasis)) return { found: false, reason: 'VIDEO_RIGHTS_SOURCE_BASIS_UNVERIFIED' };
  return { found: true, sourceUrl, productId, sourceType: 'ALIEXPRESS_OFFICIAL_PRODUCT_VIDEO', rightsSourceBasis: candidate.productVideoSourceBasis };
}

export async function verifiedVideoRecord(productId) {
  const registry = await readRegistry();
  const row = registry.records.find((record) => String(record.productId) === String(productId) && record.productVideoVerified === true);
  if (!row?.localPublicPath || !row?.sha256) return null;
  const bytes = await readFile(resolve(`public${row.localPublicPath}`)).catch(() => null);
  if (!bytes || sha(bytes) !== row.sha256 || !bytes.subarray(0, 64).includes(Buffer.from('ftyp')) || !bytes.includes(Buffer.from('moov'))) return null;
  return row;
}

export async function prepareProductVideo(candidate, { fetcher = fetch } = {}) {
  const productId = String(candidate?.productId || '');
  const cached = await verifiedVideoRecord(productId);
  if (cached) return { ...candidate, productVideoVerified: true, productVideoVerification: cached };
  const discovered = discoverOfficialProductVideo(candidate);
  if (!discovered.found) return { ...candidate, productVideoVerified: false, productVideoVerification: { productId, reason: discovered.reason, checkedAt: new Date().toISOString() } };

  // The current workflow has no trustworthy OCR/content-moderation evidence
  // for price overlays or third-party watermarks. Never guess: an official
  // media candidate becomes publishable only when those explicit safety facts
  // are present from an approved verifier.
  const safety = candidate.productVideoSafety;
  if (safety?.thirdPartyWatermarkAbsent !== true || safety?.stalePriceClaimAbsent !== true || safety?.sameVariantContext !== true) {
    return { ...candidate, productVideoVerified: false, productVideoVerification: { ...discovered, reason: 'VIDEO_VISUAL_SAFETY_EVIDENCE_MISSING', checkedAt: new Date().toISOString() } };
  }

  const response = await fetcher(discovered.sourceUrl, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  const finalUrl = new URL(response.url || discovered.sourceUrl);
  if (response.status !== 200 || !allowedVideoTypes.has(contentType) || !allowedHost(finalUrl.hostname)) return { ...candidate, productVideoVerified: false, productVideoVerification: { ...discovered, reason: 'VIDEO_HTTP_MIME_OR_REDIRECT_INVALID', checkedAt: new Date().toISOString() } };
  const sourceBytes = Buffer.from(await response.arrayBuffer());
  if (sourceBytes.length < 50_000 || sourceBytes.length > 100_000_000) return { ...candidate, productVideoVerified: false, productVideoVerification: { ...discovered, reason: 'VIDEO_SIZE_INVALID', checkedAt: new Date().toISOString() } };

  const work = resolve('product-intelligence/.local/video-verification', productId);
  const sourcePath = resolve(work, 'source-video');
  const localPublicPath = `/products/verified/videos/${productId}.mp4`;
  const targetPath = resolve(`public${localPublicPath}`);
  await mkdir(work, { recursive: true });
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(sourcePath, sourceBytes);
  const probe = await execute(['-hide_banner', '-i', sourcePath, '-map', '0:v:0', '-t', '12', '-f', 'null', '-']);
  const resolution = probe.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
  const duration = probe.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const width = Number(resolution?.[1] || 0), height = Number(resolution?.[2] || 0);
  const durationSeconds = duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : 0;
  if (Math.min(width, height) < 360 || durationSeconds < 2 || durationSeconds > 120) return { ...candidate, productVideoVerified: false, productVideoVerification: { ...discovered, reason: 'VIDEO_RESOLUTION_OR_DURATION_INVALID', checkedAt: new Date().toISOString() } };
  await execute(['-y', '-hide_banner', '-loglevel', 'error', '-i', sourcePath, '-map', '0:v:0', '-an', '-t', '11', '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=white,fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '21', '-movflags', '+faststart', targetPath]);
  const output = await readFile(targetPath);
  if (!output.subarray(0, 64).includes(Buffer.from('ftyp')) || !output.includes(Buffer.from('moov'))) return { ...candidate, productVideoVerified: false, productVideoVerification: { ...discovered, reason: 'VIDEO_OUTPUT_CORRUPT', checkedAt: new Date().toISOString() } };
  const record = {
    productId,
    sourceUrl: discovered.sourceUrl,
    localPublicPath,
    publicAssetUrl: `https://cleverfindspicks.github.io${localPublicPath}`,
    sha256: sha(output),
    sourceSha256: sha(sourceBytes),
    sourceType: discovered.sourceType,
    rightsSourceBasis: discovered.rightsSourceBasis,
    productVideoVerified: true,
    exactProductIdMatch: true,
    sameVariantContext: true,
    thirdPartyWatermarkAbsent: true,
    stalePriceClaimAbsent: true,
    originalAudioUsed: false,
    audioPolicy: 'ORIGINAL_AUDIO_STRIPPED_UNLESS_RIGHTS_VERIFIED',
    sourceWidth: width,
    sourceHeight: height,
    sourceDurationSeconds: durationSeconds,
    verifiedAt: new Date().toISOString(),
  };
  const registry = await readRegistry();
  registry.records = [...registry.records.filter((item) => String(item.productId) !== productId), record];
  await saveRegistry(registry);
  return { ...candidate, productVideoVerified: true, productVideoVerification: record };
}
