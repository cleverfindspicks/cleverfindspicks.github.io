import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import ffmpeg from 'ffmpeg-static';
import config from './config.json' with { type: 'json' };
import { creativeCopy } from './templates.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const esc = (s) => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function validateFidelity(meta) {
  const errors = [];
  if (meta?.sourceType !== 'ORIGINAL_ALIEXPRESS_IMAGE' || !meta?.sourceUrl || !/^[a-f0-9]{64}$/.test(meta?.sourceSha256 || '')) errors.push('MISSING_ORIGINAL_SOURCE_PROVENANCE');
  if (meta?.productId !== meta?.expectedProductId) errors.push('PRODUCT_ID_MISMATCH');
  if (meta?.productImageFit !== 'contain' || meta?.productMorphing !== false || meta?.fabricatedBeforeAfter !== false || meta?.variantAltered !== false) errors.push('PRODUCT_FIDELITY_NOT_PRESERVED');
  if (meta?.rightsBasis !== 'CURRENT_AFFILIATE_WORKFLOW_PRODUCT_IMAGE_ONLY' || meta?.listingVideoUsed !== false || meta?.commercialMusicUsed !== false) errors.push('UNAPPROVED_SOURCE_OR_AUDIO');
  if (!/^[a-f0-9]{64}$/.test(meta?.reelSha256 || '') || meta?.width !== 1080 || meta?.height !== 1920 || meta?.durationSeconds < 8 || meta?.durationSeconds > 15) errors.push('INVALID_REEL_ASSET');
  return { ok: !errors.length, errors };
}
async function runFfmpeg(args) {
  await new Promise((yes,no) => {
    const child = spawn(process.env.CF_FFMPEG_PATH || ffmpeg,args,{windowsHide:true});
    let errors = '';
    child.stderr.on('data',b=>{errors=(errors+b).slice(-3000)});
    child.on('error',no); child.on('exit',code=>code===0?yes():no(new Error(`FFmpeg failed (${code}): ${errors}`)));
  });
}
export {generateMotionReel as generateReel} from './motion-creative.mjs';
export async function generateLegacyReel(queueRow, { sourceBytes = null, fetcher = fetch } = {}) {
  const { candidate } = JSON.parse(queueRow.evidence_json);
  const url = new URL(candidate.image);
  if (!url.hostname.endsWith('.aliexpress-media.com') || url.protocol !== 'https:') throw new Error('Unapproved product image host');
  let original = sourceBytes;
  if (!original) {
    const response = await fetcher(url,{signal:AbortSignal.timeout(30000)});
    if (!response.ok || Number(response.headers.get('content-length') || 0) > 20e6) throw new Error('Product image unavailable');
    original = Buffer.from(await response.arrayBuffer());
    if (original.length > 20e6) throw new Error('Product image too large');
  }
  const sourceInfo = await sharp(original).metadata();
  if (!['jpeg','png','webp'].includes(sourceInfo.format) || !sourceInfo.width || !sourceInfo.height) throw new Error('Unsupported product image');
  const copy = creativeCopy(candidate, queueRow.recentHooks || []);
  const creativeId = `igcreative-${sha(Buffer.from(queueRow.internal_instagram_tracking_id + sha(original) + JSON.stringify(copy))).slice(0,16)}`;
  const work = resolve('product-intelligence/.local/instagram-assets',creativeId);
  await mkdir(work,{recursive:true}); await mkdir('public/instagram',{recursive:true});
  await writeFile(join(work,'original-image'),original);
  const durations = [2,5,3,2];
  const texts = [[copy.hook,copy.solution],[copy.solution,'A practical find for small homes'],[copy.benefits[0],copy.benefits[1]],[copy.cta,'Check current price & the exact option']];
  const logo=await sharp('public/clever-finds.png').resize(64,64,{fit:'contain'}).png().toBuffer();
  const wrap = (text,max=28) => {
    const lines=['']; for(const word of text.split(' ')){const last=lines.length-1;if((lines[last]+' '+word).trim().length>max)lines.push(word);else lines[last]=(lines[last]+' '+word).trim();} return lines;
  };
  for(let index=0;index<4;index++) {
    const heading=wrap(texts[index][0]); const detail=wrap(texts[index][1],34);
    const panelWidth=880; const panelHeight=780;
    const image=await sharp(original).resize(panelWidth,panelHeight,{fit:'contain',background:'#ffffff'}).png().toBuffer();
    const svg=`<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><rect width="1080" height="1920" fill="#f4f3ee"/><rect width="1080" height="18" fill="#245b4a"/><rect x="70" y="510" width="940" height="850" rx="36" fill="white"/><text x="80" y="95" fill="#245b4a" font-size="32" font-family="Arial" font-weight="700">CLEVER FINDS</text><text x="1000" y="95" text-anchor="end" fill="#245b4a" font-size="30" font-family="Arial">Ad / affiliate</text>${heading.map((l,i)=>`<text x="80" y="${235+i*70}" fill="#172f27" font-size="58" font-weight="700" font-family="Arial">${esc(l)}</text>`).join('')}${detail.map((l,i)=>`<text x="80" y="${1490+i*49}" fill="#172f27" font-size="37" font-family="Arial">${esc(l)}</text>`).join('')}<text x="80" y="1705" fill="#245b4a" font-size="32" font-family="Arial">Small homes. Practical organisation.</text><text x="80" y="1755" fill="#245b4a" font-size="30" font-family="Arial">cleverfindspicks.github.io/instagram</text></svg>`;
    const branded=svg.replaceAll('#f4f3ee','#071424').replaceAll('#245b4a','#53dafa').replaceAll('#172f27','#f5f8ff').replace('<text x="80" y="95"','<text x="165" y="95"');
    await sharp(Buffer.from(branded)).composite([{input:image,left:100,top:545},{input:logo,left:80,top:40}]).png().toFile(join(work,`scene-${index}.png`));
  }
  const concat=durations.map((d,i)=>`file 'scene-${i}.png'\nduration ${d}`).join('\n')+"\nfile 'scene-3.png'\n";
  await writeFile(join(work,'frames.ffconcat'),concat);
  const assetPath=resolve('public/instagram',`${creativeId}.mp4`);
  await runFfmpeg(['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',join(work,'frames.ffconcat'),'-vf',"fps=30,zoompan=z='1+0.01*sin(on/60)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=30,format=yuv420p",'-t',String(config.creative.durationSeconds),'-an','-c:v','libx264','-preset','fast','-crf','22','-movflags','+faststart',assetPath]);
  const posterPath=resolve('public/instagram',`${creativeId}.png`);
  await copyFile(join(work,'scene-0.png'),posterPath);
  const vtt=`WEBVTT\n\n00:00.000 --> 00:02.000\nAd / affiliate. ${copy.hook}\n\n00:02.000 --> 00:07.000\n${copy.solution}\n\n00:07.000 --> 00:10.000\n${copy.benefits[0]}. ${copy.benefits[1]}\n\n00:10.000 --> 00:12.000\n${copy.cta}. Check the current price and exact option.\n`;
  await writeFile(resolve('public/instagram',`${creativeId}.vtt`),vtt);
  const meta={ creativeId,productId:String(candidate.productId),expectedProductId:String(queueRow.product_id),sourceType:'ORIGINAL_ALIEXPRESS_IMAGE',sourceUrl:candidate.image,sourceSha256:sha(original),originalDimensions:{width:sourceInfo.width,height:sourceInfo.height},productImageFit:'contain',productMorphing:false,fabricatedBeforeAfter:false,variantAltered:false,rightsBasis:'CURRENT_AFFILIATE_WORKFLOW_PRODUCT_IMAGE_ONLY',listingVideoUsed:false,commercialMusicUsed:false,width:1080,height:1920,durationSeconds:12,fps:30,reelSha256:sha(await readFile(assetPath)),assetPath,posterPath,publicAssetUrl:`https://cleverfindspicks.github.io/instagram/${creativeId}.mp4`,template:copy.concept,hook:copy.hook,caption:copy.caption,disclosure:copy.disclosure,claimsSource:copy.claimsSource };
  if(!validateFidelity(meta).ok)throw new Error('Creative fidelity rejected');
  await writeFile(join(work,'creative.json'),JSON.stringify(meta,null,2));
  return meta;
}
