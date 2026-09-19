import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {aliExpressFetch,isAliExpressDeferred} from './aliexpress-recovery.mjs';
import {createHmac} from 'node:crypto';
import {parseEnv} from 'node:util';
import {verifyCurrency,commissionMetrics,currencyFields} from './currency.mjs';
import {enrichCandidate,priceBenchmarks,classifyEvidence} from './enrichment.mjs';
import {scoreCandidates} from './scoring.mjs';
import {products} from '../app/products.ts';
const root=new URL('./',import.meta.url);
const env=parseEnv(await readFile(new URL('../.env.local',import.meta.url),'utf8'));
async function fetchDetails(ids){
 const params={app_key:env.ALIEXPRESS_APP_KEY.trim(),method:'aliexpress.affiliate.productdetail.get',timestamp:String(Date.now()),sign_method:'sha256',format:'json',v:'2.0',product_ids:ids.join(','),country:'GB',target_currency:'GBP',target_language:'EN',tracking_id:env.ALIEXPRESS_TRACKING_ID.trim(),
 fields:'product_id,product_title,product_main_image_url,product_detail_url,promotion_link,evaluate_rate,lastest_volume,ship_to_days,'+currencyFields};
 const canonical=Object.keys(params).sort().map(k=>k+params[k]).join('');
 const sign=createHmac('sha256',env.ALIEXPRESS_APP_SECRET.trim()).update(canonical).digest('hex').toUpperCase();
 const response=await aliExpressFetch('https://api-sg.aliexpress.com/sync',{method:'POST',body:new URLSearchParams({...params,sign}),signal:AbortSignal.timeout(25000)});
 const data=await response.json();const result=data.aliexpress_affiliate_productdetail_get_response?.resp_result;
 if(!response.ok||Number(result?.resp_code)!==200)throw Error('Official GBP detail request failed');
 return result.result?.products?.product||[];
}
await mkdir(new URL('.local/',root),{recursive:true});
const retry=process.argv.includes('--retry-missing');
const pool=JSON.parse(await readFile(new URL(retry?'.local/currency-before.json':'data/candidate-pool.json',root),'utf8'));
if(!retry)await writeFile(new URL('.local/currency-before.json',root),JSON.stringify(pool));
const publishedIds=JSON.parse(await readFile(new URL('../app/affiliate-destinations.json',root),'utf8')).records;
const ids=[...new Set([...pool.candidates.map(c=>c.productId),...publishedIds.map(p=>p.productId).filter(id=>/^\d+$/.test(id||''))])];
const raw=retry?JSON.parse(await readFile(new URL('.local/currency-api.json',root),'utf8')):[];let failedBatches=0;
const cached=new Set(raw.map(r=>String(r.product_id)));
const pending=ids.filter(id=>!cached.has(String(id)));
for(let i=0;i<pending.length;i+=20){try{raw.push(...await fetchDetails(pending.slice(i,i+20)));}catch(error){if(isAliExpressDeferred(error))throw error;failedBatches++;}}
await writeFile(new URL('.local/currency-api.json',root),JSON.stringify(raw));
const byId=new Map(raw.map(r=>[String(r.product_id),r]));
const fresh=pool.candidates.map(old=>{
 const item=byId.get(old.productId);const v=verifyCurrency(item||{},{source:'AliExpress Affiliate Product Detail (GB, GBP)'});
 const metrics=commissionMetrics(item||{},v);
 const candidate={...old};
 for(const key of ['scoreBreakdown','totalScore','confidence','decision','rejectionReason','evidence','priceSanity','expectedPriceBandGbp'])delete candidate[key];
 return {...candidate,...v,currencyVerification:v,metrics:{...old.metrics,...metrics,feedbackPct:item?Number.parseFloat(item.evaluate_rate)||null:null,recentVolume:item?Number(item.lastest_volume)||0:0},
 productUrl:item?.product_detail_url||old.productUrl,affiliateUrl:item?.promotion_link||old.affiliateUrl,
 listing:{...old.listing,priceVerifiedForShownVariant:false},factors:{...old.factors,valueForMoney:null,impulsePurchase:null},
 detailVerification:{productIdMatched:!!item&&String(item.product_id)===old.productId,priceMatched:v.currency_verified,queryPriceGbp:null,detailPriceGbp:v.verified_price_gbp,checkedAt:v.currency_verification_timestamp,source:'Official fresh GB/GBP detail, compared to returned listing URL'},
 currencyBefore:{storedPriceGbp:old.metrics.priceGbp,storedCommissionGbp:old.metrics.commissionAmountGbp}};
});
const benchmarks=priceBenchmarks(fresh);
const evaluated=scoreCandidates(fresh.map(c=>enrichCandidate(c,benchmarks.get(c.cluster))),{stage:'qualification'}).map(c=>({...c,evidence:classifyEvidence(c)}));
await writeFile(new URL('data/candidate-pool.json',root),JSON.stringify({...pool,generatedAt:new Date().toISOString(),note:'All current candidates re-fetched and rescored from explicit official currency pairs; old scores discarded.',candidates:evaluated},null,2));
const qualified=evaluated.filter(c=>c.decision==='keep');
const brief=c=>({productId:c.productId,title:c.title,score:c.totalScore,verifiedPriceGbp:c.verified_price_gbp,estimatedCommissionGbp:c.metrics.commissionAmountGbp,rawPrice:c.raw_price,rawCurrency:c.raw_currency,currencySource:c.currency_source});
const published=products.map(p=>{
 const previous=publishedIds.find(r=>r.slug===p.slug);const item=byId.get(previous?.productId||p.productId);
 const v=verifyCurrency(item||{});const stored=Number.parseFloat(p.price.replace(/[^\d.]/g,''));
 return {slug:p.slug,productId:previous?.productId||p.productId,storedPrice:p.price,...v,metrics:commissionMetrics(item||{},v),
 storedPriceDiffers:v.currency_verified?Math.abs(stored-v.verified_price_gbp)>0.02:null,
 storedMatchesNonGbpRaw:v.raw_currency&&v.raw_currency!=='GBP'&&v.raw_price?Math.abs(stored-v.raw_price)<0.02:false};
});
const report={timestamp:new Date().toISOString(),totalCandidates:evaluated.length,failedBatches,currenciesVerified:evaluated.filter(c=>c.currency_verified).length,
 affectedCandidates:evaluated.filter(c=>c.currencyBefore.storedPriceGbp!==c.verified_price_gbp).length,
 originalCurrencyMismatch:evaluated.filter(c=>c.originalCurrencyWasNotGbp).length,currencyMismatches:evaluated.filter(c=>c.currencyMismatch).length,
 priceVariantMismatches:evaluated.filter(c=>c.priceComparison.mismatch&&c.raw_target_currency==='GBP').length,
 qualified:qualified.length,top10:qualified.slice(0,10).map(brief),winner:qualified[0]?brief(qualified[0]):null,published};
await writeFile(new URL('reports/currency-audit.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,published:published.map(p=>({slug:p.slug,stored:p.storedPrice,gbp:p.verified_price_gbp,verified:p.currency_verified,storedMatchesNonGbpRaw:p.storedMatchesNonGbpRaw}))}));
