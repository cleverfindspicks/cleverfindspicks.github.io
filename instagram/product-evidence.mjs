import {createHmac} from 'node:crypto';
import {localEnvironment} from '../product-intelligence/local-env.mjs';
import {verifyCurrency,commissionMetrics,currencyFields,currencyGate} from '../product-intelligence/currency.mjs';
import {enrichCandidate,priceBenchmarks,classifyEvidence} from '../product-intelligence/enrichment.mjs';
import {scoreCandidate} from '../product-intelligence/scoring.mjs';
import {applyVerificationEvidence,loadVerificationEvidence,evidenceIsFresh} from '../product-intelligence/verification.mjs';

// Historic receipts supply editorial provenance, never today's price proof.
export async function refreshProductEvidence(choices,{fetcher=fetch}={}){
  if(!choices.length)return [];
  const env=await localEnvironment();
  if(!env.ALIEXPRESS_APP_KEY||!env.ALIEXPRESS_APP_SECRET||!env.ALIEXPRESS_TRACKING_ID)return [];
  const rows=[];
  for(let i=0;i<choices.length;i+=20){
    const params={app_key:env.ALIEXPRESS_APP_KEY.trim(),method:'aliexpress.affiliate.productdetail.get',timestamp:String(Date.now()),sign_method:'sha256',format:'json',v:'2.0',product_ids:choices.slice(i,i+20).map(c=>c.product.productId).join(','),country:'GB',target_currency:'GBP',target_language:'EN',tracking_id:env.ALIEXPRESS_TRACKING_ID.trim(),fields:'product_id,product_title,product_main_image_url,product_detail_url,evaluate_rate,lastest_volume,ship_to_days,'+currencyFields};
    const sign=createHmac('sha256',env.ALIEXPRESS_APP_SECRET.trim()).update(Object.keys(params).sort().map(k=>k+params[k]).join('')).digest('hex').toUpperCase();
    try{
      const response=await fetcher('https://api-sg.aliexpress.com/sync',{method:'POST',body:new URLSearchParams({...params,sign}),signal:AbortSignal.timeout(25000)});
      const data=await response.json();const result=data.aliexpress_affiliate_productdetail_get_response?.resp_result;
      if(response.ok&&Number(result?.resp_code)===200)rows.push(...(result.result?.products?.product||[]));
    }catch{/* Unknown official evidence makes the product ineligible. */}
  }
  const byId=new Map(rows.map(r=>[String(r.product_id),r]));
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
