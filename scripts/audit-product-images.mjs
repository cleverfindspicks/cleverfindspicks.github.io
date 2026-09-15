import {writeFile,mkdir,access} from 'node:fs/promises';
import sharp from 'sharp';
import {products} from '../app/products.ts';
import {fetchVerifiedImage} from '../media/image-validation.mjs';
const base='https://cleverfindspicks.github.io';const records=[];const fix=process.argv.includes('--cache');
await mkdir('product-intelligence/reports',{recursive:true});
for(const p of products){
  const local=p.image.startsWith(base+'/')?new URL(p.image).pathname:null;
  const record={slug:p.slug,productId:p.productId,sourceImageUrl:p.image,localPublicPath:local,buildOutputPath:local?'dist/client'+local:null,publicAssetUrl:p.image,remoteOnly:!local,productImageVerified:false};
  try{const original=await fetchVerifiedImage(p.image);Object.assign(record,{beforeValid:true,httpStatus:200,contentType:original.contentType,width:original.width,height:original.height,sourceSha256:original.sha256});
    if(fix){const name=/^\d+$/.test(p.productId||'')?p.productId:p.slug;const path='/products/verified/'+name+'.jpg';await mkdir('public/products/verified',{recursive:true});const bytes=await sharp(original.bytes).rotate().jpeg({quality:92}).toBuffer();await writeFile('public'+path,bytes);Object.assign(record,{localPublicPath:path,buildOutputPath:'dist/client'+path,publicAssetUrl:base+path,cached:true,placeholder:false,sameProductConfirmed:false,productImageVerified:false,verifiedAt:new Date().toISOString()});}
  }catch(error){Object.assign(record,{beforeValid:false,error:error.message,manualReviewRequired:true});}
  if(local){record.localExists=await access('public'+local).then(()=>true,()=>false);record.buildExists=await access('dist/client'+local).then(()=>true,()=>false);}
  records.push(record);
}
const summary={total:records.length,validBefore:records.filter(r=>r.beforeValid).length,brokenBefore:records.filter(r=>!r.beforeValid).length,remoteOnlyBefore:records.filter(r=>r.remoteOnly).length,locallyCachedBefore:records.filter(r=>!r.remoteOnly).length,cachedNow:records.filter(r=>r.cached).length,manualReviewRequired:records.filter(r=>r.manualReviewRequired).length};
await writeFile('product-intelligence/reports/image-audit.json',JSON.stringify({summary,records},null,2));
if(fix)await writeFile('app/product-media.json',JSON.stringify({records},null,2)+'\n');
console.log(JSON.stringify(summary));
