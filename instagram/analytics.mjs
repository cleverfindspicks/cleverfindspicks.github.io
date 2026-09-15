import {writeFile} from 'node:fs/promises';
import {instagramMultiplier} from './suitability.mjs';
import {importInstagramMetrics} from './import-metrics.mjs';
import config from './config.json' with { type:'json' };
import {livePublicationSql} from './store.mjs';
export async function syncInstagramInsights(db,api){
  let successes=0;let unavailable=0;
  const rows=db.prepare(`SELECT * FROM instagram_queue WHERE dry_run=0 AND state='PUBLISHED' AND ${livePublicationSql}`).all();
  for(const row of rows){
    if(!row.permalink){try{const m=await api.media(row.media_id);db.prepare('UPDATE instagram_queue SET permalink=? WHERE media_id=?').run(m.permalink||null,row.media_id);}catch{/* metadata stays unknown */}}
    for(const name of config.insightMetrics){
      try{const data=await api.insights(row.media_id,name);const metric=data.data?.find(m=>m.name===name);if(!metric){unavailable++;continue;}
        const value=metric.total_value?.value ?? metric.values?.[0]?.value ?? null;
        importInstagramMetrics(db,[{media_id:row.media_id,date:new Date().toISOString().slice(0,10),period:metric.period||'lifetime',[name]:value}],'instagram-official-api');successes++;
      }catch(error){if(error.tokenExpired)throw error;unavailable++;}
    }
  }
  return {successes,unavailable};
}
export function instagramReport(db,windowDays=30){
  const cutoff=new Date(Date.now()-windowDays*86400000).toISOString().slice(0,10);
  const pubs=db.prepare(`SELECT * FROM instagram_queue WHERE dry_run=0 AND state='PUBLISHED' AND published_at>=? AND ${livePublicationSql}`).all(cutoff);
  const rows=pubs.map(pub=>{
    // API snapshots are lifetime counters, not daily deltas. Take the newest
    // counter per media/metric; NEVER sum repeated lifetime snapshots.
    const media=db.prepare(`SELECT metric_name,metric_value FROM instagram_metrics m WHERE media_id=? AND period='lifetime' AND metric_date=(SELECT MAX(metric_date) FROM instagram_metrics WHERE media_id=m.media_id AND metric_name=m.metric_name AND period='lifetime') ORDER BY observed_at DESC`).all(pub.media_id);
    const metrics={};for(const m of media)if(!(m.metric_name in metrics))metrics[m.metric_name]=m.metric_value;
    const site=db.prepare('SELECT SUM(visits) visits,SUM(aliexpress_clicks) aliexpressClicks FROM instagram_site_metrics WHERE product_id=? AND metric_date>=?').get(pub.product_id,cutoff);
    const commerce=db.prepare("SELECT COUNT(*) rows,COUNT(CASE WHEN status='completed' THEN 1 END) orders,SUM(CASE WHEN status='completed' THEN confirmed_commission_gbp END) confirmedCommissionGbp,SUM(CASE WHEN status='pending' THEN pending_commission_gbp END) pendingCommissionGbp FROM instagram_commerce WHERE product_id=? AND date(ordered_at)>=? AND status NOT IN ('cancelled','refunded','invalid')").get(pub.product_id,cutoff);
    return {productId:pub.product_id,productSlug:pub.product_slug,cluster:pub.cluster,mediaId:pub.media_id,views:metrics.views??null,reach:metrics.reach??null,impressions:metrics.impressions??null,saves:metrics.saved??null,shares:metrics.shares??null,likes:metrics.likes??null,...site,orders:commerce.rows?commerce.orders:null,confirmedCommissionGbp:commerce.confirmedCommissionGbp,pendingCommissionGbp:commerce.pendingCommissionGbp};
  });
  const sum=(list,key)=>{const known=list.map(r=>r[key]).filter(v=>v!==null&&v!==undefined);return known.length?known.reduce((a,b)=>a+b,0):null};
  const clusters=[...new Set(rows.map(r=>r.cluster))].map(cluster=>{
    const subset=rows.filter(r=>r.cluster===cluster);const metrics={posts:subset.length,...Object.fromEntries(['views','reach','impressions','visits','aliexpressClicks','orders','confirmedCommissionGbp','pendingCommissionGbp','saves','shares','likes'].map(k=>[k,sum(subset,k)]))};
    const multiplier=instagramMultiplier(metrics);
    db.prepare('INSERT OR REPLACE INTO instagram_cluster_performance VALUES(?,?,?,?,?,?)').run(cluster,windowDays,new Date().toISOString(),JSON.stringify(metrics),multiplier,multiplier===1?'NEUTRAL_OR_INSUFFICIENT_DATA':'ACTIVE');
    return {cluster,...metrics,multiplier};
  });
  return {windowDays,publishedPosts:pubs.length,mediaCounterBasis:'Lifetime counters for posts published within the window, NOT period activity.',metrics:Object.fromEntries(['views','reach','impressions','visits','aliexpressClicks','orders','confirmedCommissionGbp','pendingCommissionGbp'].map(k=>[k,sum(rows,k)])),products:rows,clusters,note:'Views and reach are not Pinterest impressions. Per-post reach is not deduplicated across posts. Platform-attributed orders require explicit acquisition attribution. Instagram EPMI is not calculated from lifetime views plus period earnings.'};
}
export async function writeInstagramReport(db){
  const report=instagramReport(db);
  await writeFile(new URL('../product-intelligence/reports/instagram-performance.json',import.meta.url),JSON.stringify(report,null,2));
  return report;
}
