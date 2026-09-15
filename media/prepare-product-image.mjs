import {createHmac,createHash} from 'node:crypto';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {localEnvironment} from '../product-intelligence/local-env.mjs';
import {fetchVerifiedImage,imageGate} from './image-validation.mjs';
export async function prepareProductImage(candidate,{fetcher=fetch,officialLookup=null,writeCache=true}={}){
  try{
    const id=String(candidate.productId||'');if(!/^\d{8,}$/.test(id))throw new Error('IMAGE_PRODUCT_ID_INVALID');
    let source;
    if(officialLookup)source=await officialLookup(id);
    else{const env=await localEnvironment();if(!env.ALIEXPRESS_APP_KEY||!env.ALIEXPRESS_APP_SECRET)throw new Error('IMAGE_OFFICIAL_SOURCE_UNAVAILABLE');
      const params={app_key:env.ALIEXPRESS_APP_KEY.trim(),method:'aliexpress.affiliate.productdetail.get',timestamp:String(Date.now()),sign_method:'sha256',format:'json',v:'2.0',product_ids:id,country:'GB',target_currency:'GBP',target_language:'EN',fields:'product_id,product_main_image_url'};
      const sign=createHmac('sha256',env.ALIEXPRESS_APP_SECRET.trim()).update(Object.keys(params).sort().map(k=>k+params[k]).join('')).digest('hex').toUpperCase();
      const response=await fetcher('https://api-sg.aliexpress.com/sync',{method:'POST',body:new URLSearchParams({...params,sign}),signal:AbortSignal.timeout(30000)});const json=await response.json();
      source=json.aliexpress_affiliate_productdetail_get_response?.resp_result?.result?.products?.product?.find(p=>String(p.product_id)===id);
    }
    if(!source||String(source.product_id)!==id||source.product_main_image_url!==candidate.image)throw new Error('IMAGE_OFFICIAL_PRODUCT_OR_SOURCE_MISMATCH');
    const image=await fetchVerifiedImage(candidate.image,{fetcher});const localPath='/products/verified/'+id+'.jpg';
    const bytes=await sharp(image.bytes).rotate().jpeg({quality:92}).toBuffer();
    if(writeCache){await mkdir('public/products/verified',{recursive:true});await writeFile('public'+localPath,bytes);}
    const proof={productId:id,sourceUrl:candidate.image,sameProductConfirmed:true,placeholder:false,httpStatus:200,contentType:image.contentType,sha256:image.sha256,localSha256:createHash('sha256').update(bytes).digest('hex'),localPublicPath:localPath,verifiedAt:new Date().toISOString(),identitySource:'Official AliExpress Product Detail: exact product_id and product_main_image_url'};
    const result={...candidate,productImageVerified:true,productImageVerification:proof};if(!imageGate(result))throw new Error('IMAGE_PROOF_REJECTED');return result;
  }catch{return {...candidate,productImageVerified:false,productImageVerification:null,imageRejectionReason:'SKIPPED_IMAGE_NOT_VERIFIED'};}
}
export async function recordProductMedia(slug,candidate){
 if(!imageGate(candidate))throw new Error('SKIPPED_IMAGE_NOT_VERIFIED');
 const path='app/product-media.json';const data=JSON.parse(await readFile(path,'utf8'));const proof=candidate.productImageVerification;
 const row={slug,productId:candidate.productId,sourceImageUrl:candidate.image,localPublicPath:proof.localPublicPath,buildOutputPath:'dist/client'+proof.localPublicPath,publicAssetUrl:'https://cleverfindspicks.github.io'+proof.localPublicPath,productImageVerified:true,sameProductConfirmed:true,placeholder:false,httpStatus:200,contentType:proof.contentType,sourceSha256:proof.sha256,localSha256:proof.localSha256,verifiedAt:proof.verifiedAt,cached:true};
 const previous=data.records.find(r=>r.slug===slug&&String(r.productId)===String(candidate.productId)&&r.sourceImageUrl===candidate.image);
 if(previous?.currencyVerified){for(const key of ['currencyVerified','verifiedPriceGbp','priceVerifiedAt','priceCurrencySource'])if(previous[key]!==undefined)row[key]=previous[key];}
 data.records=data.records.filter(r=>r.slug!==slug);data.records.push(row);await writeFile(path,JSON.stringify(data,null,2)+'\n');
}
