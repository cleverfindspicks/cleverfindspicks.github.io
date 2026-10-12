import {readFile,rename,writeFile} from 'node:fs/promises';
import {scoreCandidate} from '../product-intelligence/scoring.mjs';
import {buildContentCandidate} from '../product-intelligence/content.mjs';
import {resolveAffiliateDestination} from '../product-intelligence/affiliate-destination.mjs';
import {instagramSuitability} from './suitability.mjs';
import {canAutoPromote} from './catalogue-promotion.mjs';
import {prepareProductImage,recordProductMedia} from '../media/prepare-product-image.mjs';
import {affiliateAuditRecord,upsertAffiliateAudit} from '../product-intelligence/publication-records.mjs';

const atomicWrite=async(url,value)=>{const temp=new URL(`${url.pathname}.${process.pid}.tmp`,url);await writeFile(temp,value);await rename(temp,url);};

export async function promoteSingleCandidate(productId,{recentProductIds=[]}={}){
  productId=String(productId||'');
  if(!/^\d{8,}$/.test(productId))throw new Error('PRODUCT_ID_REQUIRED');
  const poolUrl=new URL('../product-intelligence/data/candidate-pool.json',import.meta.url);
  const pool=JSON.parse(await readFile(poolUrl,'utf8'));
  const index=pool.candidates.findIndex(row=>String(row.productId)===productId);
  if(index<0)throw new Error('CANDIDATE_NOT_FOUND');
  let candidate=scoreCandidate(pool.candidates[index],{stage:'qualification'});
  const detailFresh=candidate.detailVerification?.productIdMatched===true&&Date.now()-Date.parse(candidate.detailVerification.checkedAt)<=24*3600000;
  if(!detailFresh)throw new Error('STALE_PRODUCT_DETAIL_EVIDENCE');
  candidate=await prepareProductImage(candidate,{officialLookup:async id=>String(id)===productId?{product_id:productId,product_main_image_url:candidate.image}:null});
  if(candidate.productImageVerified!==true)throw new Error('SKIPPED_IMAGE_NOT_VERIFIED');
  const destination=await resolveAffiliateDestination(candidate.affiliateUrl,productId);
  if(!destination.pass)throw new Error(`AFFILIATE_DESTINATION_${destination.reason}`);
  candidate={...candidate,affiliateDestinationVerified:true,affiliateDestination:destination,canonicalProductUrl:`https://www.aliexpress.com/item/${productId}.html`};
  const suitability=instagramSuitability(candidate,{recentProductIds});
  if(!canAutoPromote(candidate,suitability))throw new Error('AUTO_PROMOTION_GATE_FAILED');
  const {landingPage}=buildContentCandidate(candidate);
  const productsUrl=new URL('../app/generated-products.json',import.meta.url);
  const mediaUrl=new URL('../app/product-media.json',import.meta.url);
  const affiliateUrl=new URL('../app/affiliate-destinations.json',import.meta.url);
  const before={products:await readFile(productsUrl,'utf8'),media:await readFile(mediaUrl,'utf8'),affiliate:await readFile(affiliateUrl,'utf8')};
  try{
    const products=JSON.parse(before.products);
    const conflicting=products.find(row=>row.slug===landingPage.slug&&String(row.productId)!==productId);
    if(conflicting)throw new Error('CATALOGUE_SLUG_CONFLICT');
    const product={...landingPage,pinImage:null,publicationId:`catalogue:${landingPage.slug}:${new Date().toISOString().slice(0,10)}`,pinTrackingId:candidate.pinId,automationRunId:candidate.runId,searchQuery:Array.isArray(candidate.searchQuery)?candidate.searchQuery.join(' | '):candidate.searchQuery,cluster:candidate.cluster,publishedAt:new Date().toISOString(),activeCatalogue:true,cataloguePromotionSource:'INSTAGRAM_AUTO_PROMOTION',productImageVerified:true};
    if(!products.some(row=>String(row.productId)===productId))products.push(product);
    await recordProductMedia(landingPage.slug,candidate);
    const affiliate=upsertAffiliateAudit(JSON.parse(before.affiliate),affiliateAuditRecord({candidate,landingPage}));
    pool.candidates[index]=candidate;
    await atomicWrite(poolUrl,JSON.stringify(pool,null,2));
    await atomicWrite(productsUrl,JSON.stringify(products,null,2));
    await atomicWrite(affiliateUrl,JSON.stringify(affiliate,null,2));
    return {status:'ACTIVE_CATALOGUE_PROMOTED',product:{...product,affiliateDestinationVerified:true,canonicalProductUrl:candidate.canonicalProductUrl,affiliateUrl:candidate.affiliateUrl,productId,productImageVerified:true,displayImage:candidate.productImageVerification.localPublicPath},candidate,suitability,diversified:true,selectionScore:Number((candidate.totalScore*.4+suitability.totalScore*.6).toFixed(2))};
  }catch(error){
    await writeFile(productsUrl,before.products);await writeFile(mediaUrl,before.media);await writeFile(affiliateUrl,before.affiliate);
    throw error;
  }
}

export async function promoteNextCandidate({recentProductIds=[],limit=3}={}){
  const pool=JSON.parse(await readFile(new URL('../product-intelligence/data/candidate-pool.json',import.meta.url),'utf8'));
  const generated=JSON.parse(await readFile(new URL('../app/generated-products.json',import.meta.url),'utf8'));
  const existing=new Set(generated.map(row=>String(row.productId)));
  const candidates=(pool.candidates||[]).filter(candidate=>!existing.has(String(candidate.productId))&&candidate.decision==='keep'&&candidate.totalScore>=65&&candidate.confidence>=.75).sort((a,b)=>b.totalScore-a.totalScore).slice(0,limit);
  const failures=[];
  for(const candidate of candidates){try{return await promoteSingleCandidate(candidate.productId,{recentProductIds});}catch(error){failures.push({productId:candidate.productId,reason:String(error.message).slice(0,120)});}}
  return {status:'ACTIVE_CATALOGUE_PROMOTION_FAILED',failures};
}

if(process.argv[1]?.endsWith('promote-single-candidate.mjs')){
  try{const result=await promoteSingleCandidate(process.argv[2]);console.log(JSON.stringify({status:result.status,productId:result.product.productId,slug:result.product.slug,score:result.candidate.totalScore,confidence:result.candidate.confidence,suitability:result.suitability.totalScore}));}
  catch(error){console.error(JSON.stringify({status:'ACTIVE_CATALOGUE_PROMOTION_FAILED',detail:String(error.message).slice(0,180)}));process.exitCode=1;}
}
