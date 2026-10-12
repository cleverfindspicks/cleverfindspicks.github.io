import {createHmac} from 'node:crypto';
import {aliExpressFetch} from './aliexpress-recovery.mjs';
import {commissionByStatus} from './performance.mjs';

export const affiliateOrderStatuses=['Payment Completed','Buyer Confirmed Receipt'];

const apiTime=value=>new Date(value).toISOString().slice(0,19).replace('T',' ');
const numberOrNull=value=>{
  if(value===null||value===undefined||value===''||String(value).toLowerCase()==='null')return null;
  const number=Number(String(value).replaceAll(',',''));
  return Number.isFinite(number)?number:null;
};

export function orderLifecycle(row={}){
  const detail=String(row.effect_detail_status||row.effect_status_detail||'').toLowerCase();
  const status=String(row.order_status||row.effect_status||row._queriedStatus||'').toLowerCase();
  if(/refund/.test(detail)||/refund/.test(status))return 'refunded';
  if(/cancel/.test(detail)||/cancel/.test(status))return 'cancelled';
  if(/invalid/.test(detail)||/invalid/.test(status))return 'invalid';
  // Buyer receipt proves an order, not that the affiliate commission has
  // settled. Keep it pending until AliExpress exposes an explicit settlement.
  if(/settlement completed|commission paid|validated/.test(status))return 'completed';
  return 'pending';
}

export function commissionEvidenceGbp(row={},status=orderLifecycle(row)){
  const currency=String(row.settled_currency||row.publisher_settled_currency||'').toUpperCase();
  if(currency!=='GBP')return null;
  return numberOrNull(status==='completed'
    ? row.estimated_finished_commission
    : row.estimated_paid_commission);
}

function signedParams(credentials,request){
  const params={
    app_key:credentials.appKey,
    method:'aliexpress.affiliate.order.list',
    timestamp:String(Date.now()),
    sign_method:'sha256',format:'json',v:'2.0',
    app_signature:credentials.trackingId,
    ...request,
  };
  const canonical=Object.keys(params).sort().map(name=>name+params[name]).join('');
  const sign=createHmac('sha256',credentials.appSecret).update(canonical,'utf8').digest('hex').toUpperCase();
  return {...params,sign};
}

export async function fetchAffiliateOrders({credentials,start=new Date(Date.now()-30*86400000),end=new Date(),statuses=affiliateOrderStatuses,maxPages=5,request=aliExpressFetch}={}){
  if(!credentials?.appKey||!credentials?.appSecret||!credentials?.trackingId)throw new Error('Missing AliExpress Affiliate credentials.');
  const output=[];
  for(const status of statuses){
    for(let page=1;page<=maxPages;page++){
      const params=signedParams(credentials,{
        start_time:apiTime(start),end_time:apiTime(end),status,
        page_no:String(page),page_size:'50',
        fields:'order_id,order_number,sub_order_id,tracking_id,order_status,effect_detail_status,created_time,paid_time,finished_time,estimated_paid_commission,estimated_finished_commission,settled_currency,product_id,product_title,product_count,ship_to_country',
      });
      const response=await request('https://api-sg.aliexpress.com/sync',{method:'POST',body:new URLSearchParams(params),signal:AbortSignal.timeout(25000)});
      const data=await response.json();
      const wrapper=data.aliexpress_affiliate_order_list_response?.resp_result;
      const code=String(wrapper?.resp_code??data.error_response?.code??'');
      const message=String(wrapper?.resp_msg??data.error_response?.msg??'');
      if(code==='405'&&/empty/i.test(message))break;
      if(!response.ok||code!=='200')throw new Error(`AliExpress order report failed: ${code||response.status} ${message}`.trim());
      const rows=wrapper?.result?.orders?.order;
      const pageRows=Array.isArray(rows)?rows:[];
      output.push(...pageRows.map(row=>({...row,_queriedStatus:status})));
      const totalPages=Number(wrapper?.result?.total_page_no)||page;
      if(pageRows.length<50||page>=totalPages)break;
    }
  }
  return output;
}

export function importAffiliateOrders(db,rows,{observedAt=new Date().toISOString()}={}){
  const findProduct=db.prepare('SELECT product_id FROM products WHERE product_id=? LIMIT 1');
  const findPin=db.prepare('SELECT pin_tracking_id FROM pins WHERE pin_tracking_id=? LIMIT 1');
  const upsert=db.prepare(`INSERT INTO aliexpress_orders
    (order_key,external_order_id,product_id,pin_tracking_id,ordered_at,status,pending_commission_gbp,confirmed_commission_gbp,source,attribution_confidence,observed_at,raw_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(order_key) DO UPDATE SET
    status=excluded.status,pending_commission_gbp=excluded.pending_commission_gbp,
    confirmed_commission_gbp=excluded.confirmed_commission_gbp,observed_at=excluded.observed_at,raw_json=excluded.raw_json`);
  let imported=0,unmatched=0;
  const unique=new Map();
  for(const row of rows){
    const externalId=String(row.sub_order_id||row.order_id||row.order_number||'');
    if(!externalId)continue;
    const sourceProductId=String(row.product_id||'');
    unique.set(`${externalId}:${sourceProductId}`,row);
  }
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const [identity,row] of unique){
      const sourceProductId=String(row.product_id||'');
      const match=sourceProductId?findProduct.get(sourceProductId):null;
      if(!match)unmatched++;
      const sourceTracking=String(row.tracking_id||'');
      const pin=sourceTracking?findPin.get(sourceTracking):null;
      const status=orderLifecycle(row);
      const commission=commissionEvidenceGbp(row,status);
      const values=commissionByStatus(status,commission);
      const orderedAt=row.paid_time||row.created_time||observedAt;
      upsert.run(`aliexpress-api:${identity}`,String(row.sub_order_id||row.order_id||row.order_number),match?.product_id||null,pin?.pin_tracking_id||null,orderedAt,status,values.pendingCommissionGbp,values.confirmedCommissionGbp,'aliexpress-affiliate-order-api',match?1:0,observedAt,JSON.stringify(row));
      imported++;
    }
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return {imported,unmatched};
}

export async function syncAffiliateOrders(db,{credentials,...options}={}){
  const rows=await fetchAffiliateOrders({credentials,...options});
  return {...importAffiliateOrders(db,rows),fetched:rows.length};
}
