import {writeFile} from 'node:fs/promises';
import {openInstagramStore} from './store.mjs';
import {qualifiedCatalogue} from './catalogue.mjs';
import {enqueue,transition,londonClock} from './queue.mjs';
import {generateReel} from './creative.mjs';
import {resolveAffiliateDestination} from '../product-intelligence/affiliate-destination.mjs';
import {instagramDestination} from '../lib/tracking.ts';
const db=openInstagramStore();
try{
  const choices=await qualifiedCatalogue(db);let choice;
  for(const candidate of choices){const destination=await resolveAffiliateDestination(candidate.product.affiliateUrl,candidate.product.productId);if(destination.pass){choice=candidate;break;}}
  if(!choice)throw new Error('No qualified current product with verified affiliate destination');
  let row=enqueue(db,choice,londonClock().day,true);
  if(row.state==='PENDING')row=transition(db,row.instagram_publication_id,'CREATIVE_GENERATING');
  const creative=await generateReel(row);
  if(row.state==='READY' && row.dry_run===1){db.prepare('UPDATE instagram_queue SET creative_id=?,creative_json=?,caption=?,hook=?,asset_path=?,public_asset_url=? WHERE instagram_publication_id=? AND dry_run=1 AND state=\'READY\'').run(creative.creativeId,JSON.stringify(creative),creative.caption,creative.hook,creative.assetPath,creative.publicAssetUrl,row.instagram_publication_id);}
  if(row.state==='CREATIVE_GENERATING')row=transition(db,row.instagram_publication_id,'READY',{creative_id:creative.creativeId,creative_json:JSON.stringify(creative),caption:creative.caption,hook:creative.hook,asset_path:creative.assetPath,public_asset_url:creative.publicAssetUrl});
  const report={fixtureOrDryRun:true,published:false,product:choice.product.shortName,productId:row.product_id,productSlug:row.product_slug,productScore:row.product_score,instagramSuitabilityScore:row.suitability_score,reason:'Qualified Product Intelligence receipt, verified exact affiliate destination, original product image, high visual/problem clarity and no Instagram duplicate.',creative,trackingId:row.internal_instagram_tracking_id,hubDestination:instagramDestination('https://cleverfindspicks.github.io',row.product_slug,row.internal_instagram_tracking_id),simulatedApiPayload:{method:'POST',path:'/{instagram-user-id}/media',body:{media_type:'REELS',video_url:creative.publicAssetUrl,caption:creative.caption,share_to_feed:true}},productionHubEntry:null,previewHubEntry:{productId:row.product_id,productSlug:row.product_slug,trackingId:row.internal_instagram_tracking_id,status:'DRY_RUN_NOT_PUBLISHED'}};
  await writeFile(new URL('../product-intelligence/reports/instagram-dry-run.json',import.meta.url),JSON.stringify(report,null,2));
  await writeFile(new URL('../app/instagram-preview.json',import.meta.url),JSON.stringify({productId:row.product_id,productSlug:row.product_slug,trackingId:row.internal_instagram_tracking_id,creativeId:creative.creativeId,caption:creative.caption,score:row.suitability_score},null,2)+'\n');
  console.log(JSON.stringify({ok:true,published:false,product:report.product,productId:row.product_id,suitabilityScore:row.suitability_score,creativePath:creative.assetPath,trackingId:row.internal_instagram_tracking_id,report:'product-intelligence/reports/instagram-dry-run.json'}));
}finally{db.close();}
