import {writeFile} from 'node:fs/promises';
import {currencyGate} from '../product-intelligence/currency.mjs';
export async function exportHub(db){
  const rows=db.prepare("SELECT * FROM instagram_queue WHERE state='PUBLISHED' AND dry_run=0 AND media_id IS NOT NULL ORDER BY published_at DESC LIMIT 20").all();
  const safe=rows.map(r=>{const c=JSON.parse(r.evidence_json||'{}').candidate;return {instagramPublicationId:r.instagram_publication_id,trackingId:r.internal_instagram_tracking_id,productId:r.product_id,productSlug:r.product_slug,creativeId:r.creative_id,publishedAt:r.published_at,mediaId:r.media_id,permalink:r.permalink,hook:r.hook,currencyVerified:currencyGate(c||{}),productApproved:c?.decision==='keep'};});
  await writeFile(new URL('../app/instagram-publications.json',import.meta.url),JSON.stringify(safe,null,2)+'\n');
  return safe;
}
