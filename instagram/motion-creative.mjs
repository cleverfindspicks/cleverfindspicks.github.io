import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import sharp from 'sharp';
import ffmpeg from 'ffmpeg-static';
import {creativeCopy} from './templates.mjs';
import {validateAutomatedCreative} from './creative.mjs';
import {prepareProductImage,recordProductMedia} from '../media/prepare-product-image.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const execute=args=>new Promise((yes,no)=>{const p=spawn(process.env.CF_FFMPEG_PATH||ffmpeg,args,{windowsHide:true});let error='';p.stderr.on('data',b=>{error=(error+b).slice(-1500);});p.on('error',no);p.on('exit',code=>code===0?yes():no(new Error('Motion encoding failed: '+error)));});
export const motionSceneDurations=[2,3,3,2];
export function motionTexts(candidate,history=[]){const copy=creativeCopy(candidate,history);return {copy,scenes:[[copy.hook],[copy.solution],[copy.benefits[0],copy.benefits[1]],['See today’s find — link in bio']]};}
export async function generateMotionReel(row,{sourceBytes=null,fetcher=fetch}={}){
 const {candidate}=JSON.parse(row.evidence_json);const url=new URL(candidate.image);
 const verified=await prepareProductImage(candidate,{fetcher});
 if(!verified.productImageVerified)throw new Error('SKIPPED_IMAGE_NOT_VERIFIED');
 await recordProductMedia(row.product_slug,verified);
 if(url.protocol!=='https:'||!url.hostname.endsWith('.aliexpress-media.com'))throw new Error('Unapproved original image');
 let original=sourceBytes;if(!original){const r=await fetcher(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Original unavailable');original=Buffer.from(await r.arrayBuffer());}
 if(original.length>20e6)throw new Error('Original too large');
 const dimensions=await sharp(original).metadata();if(!['jpeg','png','webp'].includes(dimensions.format))throw new Error('Invalid original');
 const {copy,scenes}=motionTexts(candidate,row.recentHooks||[]);
 const creativeId='igcreative-'+sha(Buffer.from('motion-v2:'+row.internal_instagram_tracking_id+sha(original)+JSON.stringify(copy))).slice(0,16);
 const work=resolve('product-intelligence/.local/instagram-assets',creativeId);await mkdir(work,{recursive:true});await mkdir('public/instagram',{recursive:true});
 await writeFile(join(work,'original-image'),original);
 // Contain the complete original first. Only camera movement is applied;
 // no reconstruction, recolouring, retouching, accessory or quantity changes.
 const photo=await sharp(original).resize(1000,1160,{fit:'contain',background:'#ffffff'}).png().toBuffer();
 await sharp({create:{width:1080,height:1920,channels:4,background:'#071424'}}).composite([{input:photo,left:40,top:400}]).png().toFile(join(work,'photo.png'));
 for(let i=0;i<4;i++){
  const lines=scenes[i].flatMap(text=>{const result=[''];for(const word of text.split(' ')){const n=result.length-1;if((result[n]+' '+word).trim().length>28)result.push(word);else result[n]=(result[n]+' '+word).trim();}return result;});
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect x="0" y="0" width="1080" height="400" fill="#071424"/><rect x="0" y="1570" width="1080" height="350" fill="#071424"/><text x="70" y="95" fill="#53dafa" font-family="Arial" font-size="32" font-weight="bold">CLEVER FINDS</text><text x="1010" y="95" text-anchor="end" fill="#d9eef5" font-family="Arial" font-size="26">Ad / affiliate</text>${lines.map((l,n)=>`<text x="70" y="${210+n*65}" fill="#f5f8ff" font-family="Arial" font-size="54" font-weight="bold">${esc(l)}</text>`).join('')}<text x="70" y="1715" fill="#53dafa" font-family="Arial" font-size="34">${i===3?'See today’s find — Link in bio':'Practical organisation for small homes'}</text></svg>`;
  const overlay=join(work,`overlay-${i}.png`);await sharp(Buffer.from(svg)).png().toFile(overlay);
  await sharp(join(work,'photo.png')).composite([{input:overlay}]).png().toFile(join(work,`scene-${i}.png`));
  const count=motionSceneDurations[i]*30;
  const z=i%2===0?'1+0.08*on/'+count:'1.08-0.08*on/'+count;
  const x=i%2===0?'(iw-iw/zoom)*on/'+count:'(iw-iw/zoom)*(1-on/'+count+')';
  // Text is a separate transparent layer: slides into place and fades in,
  // while the real product has an independent pan/zoom camera move.
  const filter=`[0:v]zoompan=z='${z}':x='${x}':y='(ih-ih/zoom)/2':d=1:s=1080x1920:fps=30[photo];[1:v]format=rgba,fade=t=in:st=0:d=0.2:alpha=1[text];[photo][text]overlay=x=0:y='max(0,24-120*t)':eval=frame,fade=t=in:st=0:d=0.12,fade=t=out:st=${motionSceneDurations[i]-0.12}:d=0.12,format=yuv420p[v]`;
  await execute(['-y','-hide_banner','-loglevel','error','-loop','1','-i',join(work,'photo.png'),'-loop','1','-i',overlay,'-filter_complex',filter,'-map','[v]','-t',String(motionSceneDurations[i]),'-an','-c:v','libx264','-preset','fast','-crf','22',join(work,`part-${i}.mp4`)]);
 }
 await writeFile(join(work,'parts.ffconcat'),[0,1,2,3].map(i=>`file 'part-${i}.mp4'`).join('\n'));
 const assetPath=resolve('public/instagram',creativeId+'.mp4');await execute(['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',join(work,'parts.ffconcat'),'-c','copy','-movflags','+faststart',assetPath]);
 const posterPath=resolve('public/instagram',creativeId+'.png');await copyFile(join(work,'scene-0.png'),posterPath);
 const vtt='WEBVTT\n\n'+scenes.map((lines,i)=>{const start=[0,2,5,8][i],end=[2,5,8,10][i];return `00:${String(start).padStart(2,'0')}.000 --> 00:${String(end).padStart(2,'0')}.000\n${i===0?'Ad / affiliate. ':''}${lines.join('. ')}\n`;}).join('\n');await writeFile(resolve('public/instagram',creativeId+'.vtt'),vtt);
 const reelBytes=await readFile(assetPath);const meta={creativeId,productId:String(candidate.productId),expectedProductId:String(row.product_id),sourceType:'ORIGINAL_ALIEXPRESS_IMAGE',sourceUrl:candidate.image,sourceSha256:sha(original),originalDimensions:{width:dimensions.width,height:dimensions.height},productImageFit:'contain',productMorphing:false,fabricatedBeforeAfter:false,variantAltered:false,rightsBasis:'CURRENT_AFFILIATE_WORKFLOW_PRODUCT_IMAGE_ONLY',listingVideoUsed:false,commercialMusicUsed:false,width:1080,height:1920,durationSeconds:10,fps:30,reelSha256:sha(reelBytes),assetPath,posterPath,publicAssetUrl:`https://cleverfindspicks.github.io/instagram/${creativeId}.mp4`,template:'motion-v2',hook:copy.hook,caption:copy.caption,disclosure:'Ad / affiliate',claimsSource:copy.claimsSource,scenes:scenes.map((text,i)=>({start:[0,2,5,8][i],end:[2,5,8,10][i],text})),cameraMotion:'Independent pan/zoom, alternating directions; separate sliding/fading text'};
 meta.productImageVerified=verified.productImageVerified;meta.productImageVerification=verified.productImageVerification;
 if(meta.sourceSha256!==verified.productImageVerification.sha256)throw new Error('SKIPPED_IMAGE_NOT_VERIFIED: source changed during creative generation');
 const validation=validateAutomatedCreative(meta,reelBytes);meta.creativeVerified=validation.creativeVerified;meta.creativeValidationErrors=validation.errors;
 if(!validation.ok)throw new Error('Motion fidelity gate rejected: '+validation.errors.join(','));
 await writeFile(join(work,'creative.json'),JSON.stringify(meta,null,2));return meta;
}
