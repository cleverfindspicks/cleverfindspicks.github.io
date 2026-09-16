import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateFidelity } from './creative.mjs';
import { transition,retryDelay } from './queue.mjs';
import config from './config.json' with { type: 'json' };
import {currencyGate} from '../product-intelligence/currency.mjs';
import {imageGate} from '../media/image-validation.mjs';

export async function publishQueued(db,row,api,{verifyDestination,fetcher=fetch}={}) {
  if(row.dry_run)return {status:'DRY_RUN_NO_API_CALL'};
  if(row.state==='PUBLISHED')return {status:'ALREADY_PUBLISHED',mediaId:row.media_id};
  if(row.next_attempt_at&&new Date(row.next_attempt_at)>new Date())return {status:'WAITING_BACKOFF'};
  if(!['READY','PUBLISHING','FAILED_RETRYABLE'].includes(row.state))return {status:'NOT_READY'};
  if(!currencyGate(JSON.parse(row.evidence_json||'{}').candidate||{}))return {status:'CURRENCY_VERIFICATION_REJECTED'};
  const meta=JSON.parse(row.creative_json || '{}');
  if(!row.publish_uncertain&&!imageGate({...JSON.parse(row.evidence_json).candidate,productImageVerified:meta.productImageVerified,productImageVerification:meta.productImageVerification}))return {status:'SKIPPED_IMAGE_NOT_VERIFIED'};
  if(meta.creativeVerified!==true||!validateFidelity(meta).ok || !row.caption?.startsWith('Ad / affiliate'))throw new Error('Creative/disclosure gate rejected');
  const localSha=createHash('sha256').update(await readFile(row.asset_path)).digest('hex');
  if(localSha!==meta.reelSha256)throw new Error('Creative hash changed after validation');
  if(!row.publish_uncertain){
    const destination=await verifyDestination(row);
    if(!destination.pass){transition(db,row.instagram_publication_id,'FAILED_PERMANENT',{last_error:destination.reason||'BROKEN_AFFILIATE_DESTINATION'});return {status:'DESTINATION_REJECTED'};}
    const response=await fetcher(row.public_asset_url,{signal:AbortSignal.timeout(30000)});
    if(!response.ok || !response.headers.get('content-type')?.includes('video/mp4'))throw new Error('Public Reel asset not ready');
    const remoteSha=createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
    if(remoteSha!==meta.reelSha256)throw new Error('Public Reel asset hash does not match validated creative');
  }
  const id=row.instagram_publication_id;
  if(row.state!=='PUBLISHING')row=transition(db,id,'PUBLISHING',{attempts:row.attempts+1,last_error:null});
  try {
    if(row.publish_uncertain){
      const recovered=await api.reconcile(row);
      if(recovered){transition(db,id,'PUBLISHED',{media_id:recovered.id,permalink:recovered.permalink||null,published_at:recovered.timestamp,publish_uncertain:0});return {status:'RECOVERED_PUBLISHED',mediaId:recovered.id};}
      // No match is not proof that publishing failed. Hold for reconciliation.
      transition(db,id,'FAILED_RETRYABLE',{last_error:'PUBLISH_OUTCOME_UNKNOWN_RECONCILE_ONLY',next_attempt_at:new Date(Date.now()+retryDelay(row.attempts)*1000).toISOString()});return {status:'RECONCILIATION_REQUIRED'};
    }
    if(!row.container_id){
      const container=await api.createReel(row.public_asset_url,row.caption);
      if(!container.id)throw new Error('No official container ID');
      db.prepare('UPDATE instagram_queue SET container_id=? WHERE instagram_publication_id=?').run(container.id,id);
      row.container_id=container.id;
    }
    const state=await api.container(row.container_id);
    if(state.status_code==='ERROR'||state.status_code==='EXPIRED'){transition(db,id,'FAILED_PERMANENT',{last_error:`CONTAINER_${state.status_code}`});return {status:'CONTAINER_REJECTED'};}
    if(state.status_code==='PUBLISHED'){db.prepare('UPDATE instagram_queue SET publish_uncertain=1 WHERE instagram_publication_id=?').run(id);return {status:'RECONCILE_NEXT_RUN'};}
    if(state.status_code!=='FINISHED')return {status:'CONTAINER_PROCESSING'};
    // Persist uncertainty BEFORE the HTTP publish call. A killed process or lost
    // response will only reconcile, never blindly submit another Reel.
    const attemptedAt=new Date().toISOString();
    db.prepare('UPDATE instagram_queue SET publish_uncertain=1,publish_attempt_at=? WHERE instagram_publication_id=?').run(attemptedAt,id);
    const published=await api.publish(row.container_id);
    if(!published.id)throw new Error('Missing media ID after publishing');
    transition(db,id,'PUBLISHED',{media_id:published.id,published_at:attemptedAt,publish_uncertain:0,next_attempt_at:null});
    try{const media=await api.media(published.id);db.prepare('UPDATE instagram_queue SET permalink=? WHERE instagram_publication_id=?').run(media.permalink||null,id);}catch{ /* Publishing succeeded; metadata is retried by analytics, not by republishing. */ }
    return {status:'PUBLISHED',mediaId:published.id};
  }catch(error){
    const current=db.prepare('SELECT * FROM instagram_queue WHERE instagram_publication_id=?').get(id);
    // Auth/permission errors may need human action; ambiguous publication never
    // transitions to a state that permits a second product for the same day.
    const retryable=current.publish_uncertain||error.retryable===true;
    transition(db,id,retryable?'FAILED_RETRYABLE':'FAILED_PERMANENT',{last_error:String(error.message).slice(0,200),next_attempt_at:retryable?new Date(Date.now()+retryDelay(current.attempts)*1000).toISOString():null});
    if(current.attempts>=config.retry.maximumAttempts && !current.publish_uncertain)db.prepare("UPDATE instagram_queue SET state='FAILED_PERMANENT' WHERE instagram_publication_id=?").run(id);
    if(error.tokenExpired)throw error;
    return {status:retryable?'FAILED_RETRYABLE':'FAILED_PERMANENT'};
  }
}
