import {readRows,pick} from '../product-intelligence/report-io.mjs';
import {nullableNumber} from '../product-intelligence/performance-store.mjs';
import {commissionByStatus,normalizeOrderStatus} from '../product-intelligence/performance.mjs';
import {openInstagramStore} from './store.mjs';
export const supportedMetrics=['reach','impressions','views','plays','likes','comments','saved','saves','shares','profile_visits','website_clicks'];
export function importInstagramMetrics(db,rows,source='instagram-official-export'){
  const statement=db.prepare('INSERT INTO instagram_metrics VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(metric_key) DO UPDATE SET metric_value=excluded.metric_value,observed_at=excluded.observed_at,raw_json=excluded.raw_json');
  for(const row of rows){
    const mediaId=pick(row,'media_id');const date=pick(row,'date','metric_date');
    if(!mediaId||!date)throw new Error('Instagram metric requires media_id and date');
    const pub=db.prepare("SELECT * FROM instagram_queue WHERE media_id=? AND state='PUBLISHED' AND dry_run=0").get(mediaId);
    for(const name of supportedMetrics){
      if(!(name in row))continue;
      const normalized=name==='saves'?'saved':name;
      const period=pick(row,'period')||'lifetime';
      statement.run(`${source}:${mediaId}:${date}:${normalized}:${period}`,mediaId,pub?.product_id||null,pub?.internal_instagram_tracking_id||null,date,normalized,nullableNumber(row[name]),period,source,new Date().toISOString(),JSON.stringify(row));
    }
  }
}
export function importInstagramSite(db,rows){
  for(const row of rows){
    if(pick(row,'utm_source','platform')!=='instagram')continue;
    const tracking=pick(row,'cf_ig','instagram_tracking_id');const id=pick(row,'product_id');const slug=pick(row,'product_slug');const date=pick(row,'date');
    if(!date)throw new Error('Site metrics require date');
    const product=db.prepare('SELECT product_id FROM products WHERE product_id=? OR product_slug=?').get(id,slug);
    const pub=tracking?db.prepare('SELECT * FROM instagram_queue WHERE internal_instagram_tracking_id=? AND dry_run=0').get(tracking):null;
    if(pub&&product&&pub.product_id!==product.product_id)throw new Error('Instagram tracking ID/product mismatch');
    const key=pick(row,'event_id','metric_key')||`${date}:${product?.product_id||'hub'}:${tracking||'bio'}`;
    db.prepare(`INSERT INTO instagram_site_metrics VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(metric_key) DO UPDATE SET visits=excluded.visits,product_views=excluded.product_views,aliexpress_clicks=excluded.aliexpress_clicks,observed_at=excluded.observed_at,raw_json=excluded.raw_json`).run(`ig-site:${key}`,product?.product_id||null,tracking||null,date,nullableNumber(pick(row,'visits','sessions')),nullableNumber(pick(row,'product_views')),nullableNumber(pick(row,'aliexpress_outbound_clicks','aliexpress_clicks')),'ga4-instagram-export',new Date().toISOString(),JSON.stringify(row));
  }
}
export function importInstagramCommerce(db,rows){
  for(const row of rows){
    const tracking=pick(row,'cf_ig','instagram_tracking_id','sub_id');
    const pub=tracking?db.prepare("SELECT * FROM instagram_queue WHERE internal_instagram_tracking_id=? AND state='PUBLISHED' AND dry_run=0").get(tracking):null;
    // Product ID alone proves the product, not the acquisition platform. Never
    // attribute an order to Instagram just because the product was posted there.
    if(!pub || String(pick(row,'product_id'))!==pub.product_id)continue;
    const orderId=pick(row,'order_id');const date=pick(row,'date','ordered_at');
    if(!orderId||!date)throw new Error('Order requires order_id and date');
    const status=normalizeOrderStatus(pick(row,'status'));const c=commissionByStatus(status,nullableNumber(pick(row,'commission_gbp')));
    db.prepare(`INSERT INTO instagram_commerce VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(order_key) DO UPDATE SET status=excluded.status,pending_commission_gbp=excluded.pending_commission_gbp,confirmed_commission_gbp=excluded.confirmed_commission_gbp,observed_at=excluded.observed_at,raw_json=excluded.raw_json`).run(`ig-order:${orderId}:${pub.product_id}`,orderId,pub.product_id,tracking,date,status,c.pendingCommissionGbp,c.confirmedCommissionGbp,1,'official-attributed-affiliate-report',new Date().toISOString(),JSON.stringify(row));
  }
}
if(process.argv[1]?.endsWith('import-metrics.mjs')){
  const [kind,path]=process.argv.slice(2);if(!path)throw new Error('Usage: instagram:import <media|site|orders> <file.csv|json>');
  const db=openInstagramStore();const rows=await readRows(path);
  ({media:importInstagramMetrics,site:importInstagramSite,orders:importInstagramCommerce}[kind]||(()=>{throw new Error('Unknown import kind')}))(db,rows);db.close();console.log(JSON.stringify({ok:true,kind,rows:rows.length}));
}
