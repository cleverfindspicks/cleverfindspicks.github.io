import {createHmac} from 'node:crypto';
import {aliExpressFetch,isAliExpressDeferred,rememberDeferred,completeDeferred} from '../product-intelligence/aliexpress-recovery.mjs';
import {localEnvironment} from '../product-intelligence/local-env.mjs';
import {verifyCurrency,commissionMetrics,currencyFields,currencyGate} from '../product-intelligence/currency.mjs';
import {enrichCandidate,priceBenchmarks,classifyEvidence} from '../product-intelligence/enrichment.mjs';
import {scoreCandidate} from '../product-intelligence/scoring.mjs';
import {applyVerificationEvidence,loadVerificationEvidence,evidenceIsFresh} from '../product-intelligence/verification.mjs';
import {readFile,rename,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const cacheUrl=new URL('../product-intelligence/.local/instagram-product-evidence-cache.json',import.meta.url);
const FRESH_HOURS=24;
const signature=({product,candidate})=>createHash('sha256').update(JSON.stringify({productId:String(product.productId),canonical:product.canonicalProductUrl||candidate.canonicalProductUrl||null,image:candidate.image||null,variant:candidate.listing||null})).digest('hex');
async function loadCache(){try{return JSON.parse(await readFile(cacheUrl,'utf8'));}catch{return {records:{}};}}
async function saveCache(cache){await mkdir(new URL('../product-intelligence/.local/',import.meta.url),{recursive:true});const temp=new URL(`../product-intelligence/.local/instagram-product-evidence-cache.${process.pid}.tmp`,import.meta.url);await writeFile(temp,JSON.stringify(cache));await rename(temp,cacheUrl);}
const cacheIsFresh=(row)=>row&&Date.now()-Date.parse(row.checkedAt)<=FRESH_HOURS*3600000&&Date.now()>=Date.parse(row.checkedAt)-60000;

// Historic receipts supply editorial provenance, never today's price proof.
export async function refreshProductEvidence(choices,{fetcher=fetch}={}){
  if(!choices.length)return [];
  const env=await localEnvironment();
  if(!env.ALIEXPRESS_APP_KEY||!env.ALIEXPRESS_APP_SECRET||!env.ALIEXPRESS_TRACKING_ID)return [];
  const cache=await loadCache();
  const rows=[];const missing=[];
  for(const choice of choices){const cached=cache.records?.[String(choice.product.productId)];if(cacheIsFresh(cached)&&cached.signature===signature(choice))rows.push(cached.item);else missing.push(choice);}
  for(let i=0;i<missing.length;i+=20){
    const batch=missing.slice(i,i+20);
    const params={app_key:env.ALIEXPRESS_APP_KEY.trim(),method:'aliexpress.affiliate.productdetail.get',timestamp:String(Date.now()),sign_method:'sha256',format:'json',v:'2.0',product_ids:batch.map(c=>c.product.productId).join(','),country:'GB',target_currency:'GBP',target_language:'EN',tracking_id:env.ALIEXPRESS_TRACKING_ID.trim(),fields:'product_id,product_title,product_main_image_url,product_detail_url,evaluate_rate,lastest_volume,ship_to_days,'+currencyFields};
    const sign=createHmac('sha256',env.ALIEXPRESS_APP_SECRET.trim()).update(Object.keys(params).sort().map(k=>k+params[k]).join('')).digest('hex').toUpperCase();
    try{
      const response=await aliExpressFetch('https://api-sg.aliexpress.com/sync',{method:'POST',body:new URLSearchParams({...params,sign}),signal:AbortSignal.timeout(25000)},fetcher);
      const data=await response.json();const result=data.aliexpress_affiliate_productdetail_get_response?.resp_result;
      if(response.ok&&Number(result?.resp_code)===200){const received=result.result?.products?.product||[];rows.push(...received);for(const item of received){const choice=batch.find(c=>String(c.product.productId)===String(item.product_id));if(choice){cache.records[String(item.product_id)]={checkedAt:new Date().toISOString(),signature:signature(choice),item};}}await saveCache(cache);}
    }catch(error){if(isAliExpressDeferred(error)){rememberDeferred('instagram',choices.map(c=>c.candidate));throw error;}/* Unknown official evidence makes the product ineligible. */}
  }
  const byId=new Map(rows.map(r=>[String(r.product_id),r]));
  completeDeferred('instagram',[...byId.keys()]);
  const evidence=await loadVerificationEvidence();
  const fresh=choices.flatMap(({product,candidate})=>{
    const item=byId.get(String(product.productId));if(!item)return [];
    const v=verifyCurrency(item,{source:'Instagram selection: official AliExpress GB/GBP product detail'});
    const updated={...candidate,...v,currencyVerification:v,metrics:{...commissionMetrics(item,v),feedbackPct:Number.parseFloat(item.evaluate_rate)||null,recentVolume:Number(item.lastest_volume)||0},productUrl:item.product_detail_url,image:item.product_main_image_url||candidate.image,affiliateUrl:product.affiliateUrl,canonicalProductUrl:product.canonicalProductUrl,affiliateDestinationVerified:product.affiliateDestinationVerified,detailVerification:{productIdMatched:String(item.product_id)===String(product.productId),priceMatched:v.currency_verified,checkedAt:v.currency_verification_timestamp},expectedPriceBandGbp:null};
    return [{product,candidate:updated}];
  });
  const benchmarks=priceBenchmarks(fresh.map(c=>c.candidate));
  return fresh.map(({product,candidate})=>{
    const old=evidence.get(String(product.productId));
    const enriched=applyVerificationEvidence(enrichCandidate(candidate,benchmarks.get(candidate.cluster)),evidenceIsFresh(old)?old:null);
    const scored=scoreCandidate(enriched,{stage:'qualification'});
    return {product,candidate:{...scored,evidence:classifyEvidence(scored)}};
  }).map(c=>({...c,currencyPassed:currencyGate(c.candidate)}));
}
