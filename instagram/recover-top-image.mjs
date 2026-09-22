import {createHash} from 'node:crypto';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {fetchVerifiedImage} from '../media/image-validation.mjs';
import {scoreCandidates} from '../product-intelligence/scoring.mjs';
import {instagramSuitability} from './suitability.mjs';

const poolUrl=new URL('../product-intelligence/data/candidate-pool.json',import.meta.url);
const pool=JSON.parse(await readFile(poolUrl,'utf8'));
const ranked=scoreCandidates(pool.candidates||[],{stage:'qualification'})
  .filter(c=>c.decision==='keep'&&c.totalScore>=65&&c.confidence>=.75&&c.productImageVerified!==true&&c.detailVerification?.productIdMatched===true)
  .map(candidate=>({candidate,suitability:instagramSuitability(candidate,{recentProductIds:[]})}))
  .filter(row=>row.suitability.qualified)
  .sort((a,b)=>b.candidate.totalScore-a.candidate.totalScore||b.candidate.confidence-a.candidate.confidence||b.suitability.totalScore-a.suitability.totalScore)
  .slice(0,5);

const results=[];let verified=null;
for(const {candidate} of ranked){
  try{
    const image=await fetchVerifiedImage(candidate.image);
    const bytes=await sharp(image.bytes).rotate().jpeg({quality:92}).toBuffer();
    const id=String(candidate.productId),localPath=`/products/verified/${id}.jpg`;
    await mkdir(new URL('../public/products/verified/',import.meta.url),{recursive:true});
    await writeFile(new URL(`../public${localPath}`,import.meta.url),bytes);
    const proof={productId:id,sourceUrl:candidate.image,sameProductConfirmed:true,placeholder:false,httpStatus:200,contentType:image.contentType,sha256:image.sha256,localSha256:createHash('sha256').update(bytes).digest('hex'),localPublicPath:localPath,verifiedAt:new Date().toISOString(),identitySource:'Existing exact-ID AliExpress Product Detail evidence + verified source image'};
    const index=pool.candidates.findIndex(row=>String(row.productId)===id);
    pool.candidates[index]={...pool.candidates[index],productImageVerified:true,productImageVerification:proof};
    const temporary=new URL(`../product-intelligence/data/candidate-pool.${process.pid}.tmp`,import.meta.url);
    await writeFile(temporary,JSON.stringify(pool,null,2));await rename(temporary,poolUrl);
    verified={productId:id,proof};results.push({productId:id,status:'VERIFIED'});break;
  }catch(error){results.push({productId:candidate.productId,status:'FAILED',reason:String(error.message).slice(0,100)});}
}
console.log(JSON.stringify({tried:results,verified},null,2));
