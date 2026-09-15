// Explicit official amount/currency pairs only. Requested market is not evidence.
export const currencyFields='sale_price,sale_price_currency,original_price,original_price_currency,target_sale_price,target_sale_price_currency,target_original_price,target_original_price_currency,commission_rate,commission_amount,commission_amount_currency';
const amount=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
const currency=v=>typeof v==='string'?v.trim().toUpperCase():null;
export function listingPrice(url){
  try{const u=new URL(url);if(!/(^|\.)aliexpress\.com$/.test(u.hostname))return null;const parts=u.searchParams.get('pdp_npi')?.split('!');
    return parts&&/^[A-Z]{3}$/.test(parts[1])&&amount(parts[3])?{currency:parts[1],price:amount(parts[3]),source:'official-product-detail-url.pdp_npi',sku:parts[9]||null}:null;
  }catch{return null;}
}
export function priceConflict(price,url){
  const listed=listingPrice(url);
  if(!listed)return {status:'UNAVAILABLE',mismatch:false,listingPrice:null};
  const mismatch=listed.currency!=='GBP'||price==null||Math.abs(price-listed.price)>Math.max(0.02,price*0.08);
  return {status:mismatch?'PRICE_OR_VARIANT_MISMATCH':'PASS',mismatch,listingPrice:listed};
}
export function verifyCurrency(item,{source='AliExpress official API',timestamp=new Date().toISOString()}={}){
  const raw_price=amount(item.sale_price),raw_currency=currency(item.sale_price_currency);
  const target=amount(item.target_sale_price),targetCurrency=currency(item.target_sale_price_currency);
  // Do not fall back to another price when an explicitly returned target currency contradicts GBP.
  let price=null,field=null,reason=null;
  if(target!==null){if(targetCurrency==='GBP'){price=target;field='target_sale_price_currency';}else reason=targetCurrency?'TARGET_CURRENCY_MISMATCH':'TARGET_CURRENCY_UNKNOWN';}
  else if(item.target_sale_price!==undefined&&item.target_sale_price!==null&&item.target_sale_price!=='')reason='TARGET_PRICE_INVALID';
  else if(raw_price!==null&&raw_currency==='GBP'){price=raw_price;field='sale_price_currency';}
  else reason=raw_currency?'NO_VERIFIED_GBP_AMOUNT':'CURRENCY_UNKNOWN';
  const conflict=priceConflict(price,item.product_detail_url);
  if(price!==null&&conflict.mismatch)reason='PRICE_OR_VARIANT_MISMATCH';
  const verified=price!==null&&!reason;
  return {raw_price,raw_currency,raw_target_price:target,raw_target_currency:targetCurrency,
    verified_price_gbp:verified?price:null,currency_source:field?source+'.'+field:null,
    currency_verified:verified,currencyVerified:verified,currency_verification_timestamp:timestamp,
    currencyReason:reason,currencyMismatch:target!==null&&targetCurrency!==null&&targetCurrency!=='GBP',
    originalCurrencyWasNotGbp:raw_currency!==null&&raw_currency!=='GBP',priceComparison:conflict};
}
export function commissionMetrics(item,verification){
  const parsed=Number.parseFloat(item.commission_rate);
  const rate=Number.isFinite(parsed)&&parsed>=0&&parsed<=100?parsed:null;
  const estimate=verification.currency_verified&&rate!==null?Math.round(verification.verified_price_gbp*rate)/100:null;
  return {priceGbp:verification.verified_price_gbp,commissionRatePct:rate,commissionAmountGbp:estimate,
    commissionAmountSource:estimate!==null?'estimated-from-verified-GBP-sale-price-and-official-rate':'unknown',
    rawCommissionAmount:amount(item.commission_amount),rawCommissionCurrency:currency(item.commission_amount_currency)};
}
export function currencyGate(candidate){
  const v=candidate.currencyVerification;
  return candidate.currencyVerified===true&&candidate.currency_verified!==false&&v?.currency_verified===true&&v.verified_price_gbp>0
    &&v.verified_price_gbp===candidate.metrics?.priceGbp&&!v.priceComparison?.mismatch;
}
