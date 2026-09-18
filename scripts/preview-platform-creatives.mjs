import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { openInstagramStore } from '../instagram/store.mjs';
import { PinterestCreativeRenderer, validatePinterestCreative } from '../product-intelligence/pinterest-creative.mjs';
import { InstagramReelRenderer } from '../instagram/motion-creative.mjs';
import { validateAutomatedCreative } from '../instagram/creative.mjs';

const root = resolve('product-intelligence/.local/creative-platform-preview');
const work = join(root, 'work');
await mkdir(work, { recursive: true });
const db = openInstagramStore();
const row = db.prepare("SELECT * FROM instagram_queue WHERE state='PUBLISHED' AND media_id IS NOT NULL ORDER BY published_at DESC LIMIT 1").get();
db.close();
if (!row) throw new Error('No live Instagram product is available for the shared-product preview.');

const evidence = JSON.parse(row.evidence_json);
const media = JSON.parse(await readFile('app/product-media.json', 'utf8')).records.find((item) => String(item.productId) === String(row.product_id));
if (!media?.productImageVerified || !media.localSha256 || !media.sourceSha256) throw new Error('Selected product has no verified local image evidence.');
evidence.candidate.productImageVerified = true;
evidence.candidate.productImageVerification = {
  productId: String(row.product_id), sourceUrl: media.sourceImageUrl, sameProductConfirmed: true, placeholder: false,
  httpStatus: media.httpStatus, contentType: media.contentType, sha256: media.sourceSha256, localSha256: media.localSha256,
  localPublicPath: media.localPublicPath, verifiedAt: media.verifiedAt,
};
row.evidence_json = JSON.stringify(evidence);
const candidate = { ...evidence.candidate, trackingId: 'preview-platform-separation' };

const pinterestPath = join(root, 'pinterest-preview.png');
const pinterest = await new PinterestCreativeRenderer().render(candidate, { outputPath: pinterestPath });
const instagram = await new InstagramReelRenderer().render(row, { outputDirectory: root, workDirectory: work, publicBaseUrl: 'https://preview.invalid', recordMedia: false });
const coverPath = join(root, 'instagram-cover-preview.jpg');
const reelPath = join(root, 'instagram-reel-preview.mp4');
if (resolve(instagram.posterPath) !== resolve(coverPath)) await copyFile(instagram.posterPath, coverPath);
if (resolve(instagram.assetPath) !== resolve(reelPath)) await copyFile(instagram.assetPath, reelPath);

const contactSheet = join(work, 'instagram-reel-qa-contact-sheet.jpg');
const ffmpegResult = spawnSync(process.env.CF_FFMPEG_PATH || ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', reelPath, '-vf', 'fps=1/2.5,scale=270:480,tile=4x1', '-frames:v', '1', contactSheet], { windowsHide: true });
if (ffmpegResult.status !== 0) throw new Error('Unable to render Reel QA contact sheet.');
const reelBytes = await readFile(reelPath);
const report = {
  productId: String(row.product_id), productSlug: row.product_slug,
  outputs: { pinterest: pinterestPath, instagramCover: coverPath, instagramReel: reelPath },
  internalQaContactSheet: contactSheet,
  validation: { pinterest: validatePinterestCreative(pinterest), instagram: validateAutomatedCreative(instagram, reelBytes) },
  renderers: [pinterest.renderer, instagram.cover.renderer, instagram.renderer],
  visuallyIndependent: pinterest.layoutFamily !== instagram.layoutFamily && pinterest.renderer !== instagram.renderer && instagram.cover.renderer !== instagram.renderer,
};
await writeFile(join(root, 'preview-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
