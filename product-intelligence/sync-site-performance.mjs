import {localEnvironment} from './local-env.mjs';
import {attributionFromPath,ga4Rows,googleAccessToken,loadServiceAccount,productSlugFromPath,runGa4ProductReport} from './ga4-data.mjs';
import {openPerformanceStore} from './performance-store.mjs';

const env=await localEnvironment();
if(!env.GA4_PROPERTY_ID||!env.GOOGLE_APPLICATION_CREDENTIALS){
  console.log(JSON.stringify({ok:true,status:'NOT_CONFIGURED',imported:0,note:'GA4 property and read-only service account are required.'}));
  process.exit(0);
}
const account=await loadServiceAccount(env.GOOGLE_APPLICATION_CREDENTIALS);
const accessToken=await googleAccessToken(account);
const rows=ga4Rows(await runGa4ProductReport({propertyId:env.GA4_PROPERTY_ID,accessToken}));
const db=openPerformanceStore();
const productBySlug=db.prepare('SELECT product_id,product_slug FROM products WHERE product_slug=? LIMIT 1');
const website=db.prepare(`INSERT INTO website_metrics (metric_key,product_id,product_slug,pin_tracking_id,metric_date,product_views,qualified_visits,source,observed_at,raw_json)
  VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(metric_key) DO UPDATE SET product_views=excluded.product_views,qualified_visits=excluded.qualified_visits,observed_at=excluded.observed_at,raw_json=excluded.raw_json`);
const click=db.prepare(`INSERT INTO aliexpress_clicks (click_key,product_id,product_slug,pin_tracking_id,clicked_at,source,attribution_confidence,raw_json)
  VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(click_key) DO NOTHING`);
let metrics=0,clicks=0,unmatched=0;
const observedAt=new Date().toISOString();
db.exec('BEGIN IMMEDIATE');
try{
  for(const row of rows){
    const slug=productSlugFromPath(row.pagePathPlusQueryString);if(!slug)continue;
    const product=productBySlug.get(slug);if(!product){unmatched++;continue;}
    const date=String(row.date||'').replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
    const attribution=attributionFromPath(row.pagePathPlusQueryString);
    if(row.eventName==='product_view'){
      website.run(`ga4:${date}:${slug}:${attribution.pinTrackingId||'none'}:${row.sessionSource||'direct'}:${row.sessionMedium||'none'}`,product.product_id,slug,attribution.pinTrackingId,date,row.eventCount,row.sessions,'ga4-data-api',observedAt,JSON.stringify(row));metrics++;
    }else if(row.eventName==='aliexpress_outbound_click'){
      for(let index=0;index<row.eventCount;index++){
        const result=click.run(`ga4:${date}:${slug}:${attribution.pinTrackingId||attribution.instagramTrackingId||'direct'}:${row.sessionSource||'direct'}:${row.sessionMedium||'none'}:${index}`,product.product_id,slug,attribution.pinTrackingId,`${date}T12:00:00.000Z`,'ga4-data-api',attribution.pinTrackingId||attribution.instagramTrackingId?0.95:0.7,JSON.stringify(row));
        clicks+=result.changes;
      }
    }
  }
  db.exec('COMMIT');
}catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
console.log(JSON.stringify({ok:true,status:'CONNECTED',rows:rows.length,metrics,clicks,unmatched}));
