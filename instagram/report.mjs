import {openInstagramStore} from './store.mjs';
import {instagramReport,writeInstagramReport} from './analytics.mjs';
import {writeFile} from 'node:fs/promises';
const esc=s=>String(s??'Unknown').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function crossPlatformCommerce(db){
  const all=db.prepare('SELECT external_order_id,product_id,status,confirmed_commission_gbp,pin_tracking_id,observed_at FROM aliexpress_orders').all();
  const ig=db.prepare('SELECT external_order_id,product_id,status,confirmed_commission_gbp,instagram_tracking_id,observed_at FROM instagram_commerce').all();
  const merged=new Map();for(const row of [...all,...ig].sort((a,b)=>String(a.observed_at).localeCompare(String(b.observed_at))))merged.set(`${row.external_order_id}:${row.product_id}`,row);
  const confirmed=[...merged.values()].filter(r=>r.status==='completed'&&r.confirmed_commission_gbp!==null);
  const pinterest=all.filter(r=>r.pin_tracking_id && db.prepare('SELECT 1 FROM pins WHERE pin_tracking_id=?').get(r.pin_tracking_id));
  const aggregate=rows=>({orders:rows.length||null,confirmedCommissionGbp:rows.filter(r=>r.status==='completed'&&r.confirmed_commission_gbp!==null).length?rows.filter(r=>r.status==='completed').reduce((sum,r)=>sum+(r.confirmed_commission_gbp||0),0):null});
  return {pinterest:aggregate(pinterest),instagram:aggregate(ig),combined:{uniqueObservedOrders:merged.size||null,confirmedCommissionGbp:confirmed.length?confirmed.reduce((sum,r)=>sum+r.confirmed_commission_gbp,0):null},note:'Combined orders deduplicated by external order ID + product ID. Orders without a confirmed acquisition identity are not assigned to Pinterest or Instagram.'};
}
export function platformReportHtml(db){
  const ig=instagramReport(db);const commerce=crossPlatformCommerce(db);
  return `<h2>Platform isolation — Pinterest / Instagram / Combined</h2><p>Legacy product totals above are not proof of acquisition platform. Unknown platform attribution remains Unknown.</p><h3>Instagram — posts published in last 30 days</h3><p>${esc(ig.mediaCounterBasis)}</p><pre>${esc(JSON.stringify({publishedPosts:ig.publishedPosts,...ig.metrics},null,2))}</pre><p>${esc(ig.note)}</p><h3>Cross-platform commercial performance (lifetime)</h3><pre>${esc(JSON.stringify(commerce,null,2))}</pre><h3>Instagram health</h3><pre>${esc(JSON.stringify(db.prepare('SELECT name,status,checked_at,detail FROM instagram_health').all(),null,2))}</pre>`;
}
if(process.argv[1]?.endsWith('report.mjs')){const db=openInstagramStore();await writeInstagramReport(db);await writeFile(new URL('../product-intelligence/reports/cross-platform-performance.json',import.meta.url),JSON.stringify(crossPlatformCommerce(db),null,2));console.log(JSON.stringify({ok:true,instagram:instagramReport(db).publishedPosts,pinterestUnaffected:true}));db.close();}
