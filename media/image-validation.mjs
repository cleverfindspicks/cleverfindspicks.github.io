import {createHash} from 'node:crypto';
import sharp from 'sharp';
export async function validateImageResponse(response){
  if(response.status!==200)throw new Error('IMAGE_HTTP_NOT_200');
  const contentType=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!['image/jpeg','image/png','image/webp','image/avif'].includes(contentType))throw new Error('IMAGE_CONTENT_TYPE_INVALID');
  const declared=Number(response.headers.get('content-length')||0);if(declared>20e6)throw new Error('IMAGE_TOO_LARGE');
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>20e6||bytes.length<256)throw new Error('IMAGE_SIZE_INVALID');
  const metadata=await sharp(bytes,{limitInputPixels:40e6}).metadata();
  if(!['jpeg','png','webp','avif','heif'].includes(metadata.format)||!metadata.width||!metadata.height||metadata.width<100||metadata.height<100)throw new Error('IMAGE_DECODE_OR_DIMENSIONS_INVALID');
  const stats=await sharp(bytes,{limitInputPixels:40e6}).stats();
  if(stats.channels.every(c=>c.stdev<1))throw new Error('IMAGE_PLACEHOLDER_OR_SOLID_COLOUR');
  return {bytes,contentType,width:metadata.width,height:metadata.height,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export async function fetchVerifiedImage(url,{fetcher=fetch}={}){
  const source=new URL(url);if(source.protocol!=='https:'||!(source.hostname==='cleverfindspicks.github.io'||source.hostname.endsWith('.aliexpress-media.com')))throw new Error('IMAGE_SOURCE_NOT_ALLOWED');
  if(/placeholder|no[-_]?image|image[-_]?not[-_]?found/i.test(source.pathname))throw new Error('IMAGE_PLACEHOLDER_URL');
  const response=await fetcher(source,{signal:AbortSignal.timeout(30000),redirect:'follow'});
  const final=new URL(response.url||source);if(final.protocol!=='https:'||!(final.hostname==='cleverfindspicks.github.io'||final.hostname.endsWith('.aliexpress-media.com')))throw new Error('IMAGE_REDIRECT_SOURCE_NOT_ALLOWED');
  return {...await validateImageResponse(response),sourceUrl:source.href};
}
export function imageGate(candidate){const proof=candidate?.productImageVerification;return typeof candidate?.image==='string'&&candidate.image.startsWith('https://')&&candidate?.productImageVerified===true&&proof?.productId===String(candidate.productId)&&proof?.sourceUrl===candidate.image&&proof?.sameProductConfirmed===true&&proof?.placeholder===false&&proof?.httpStatus===200&&['image/jpeg','image/png','image/webp','image/avif'].includes(proof?.contentType)&&/^[a-f0-9]{64}$/.test(proof?.sha256||'')&&Number.isFinite(Date.parse(proof?.verifiedAt))&&Date.now()-Date.parse(proof.verifiedAt)<86400000&&Date.now()-Date.parse(proof.verifiedAt)>=-60000;}
