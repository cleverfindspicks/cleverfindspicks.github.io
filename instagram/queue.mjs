import { createHash } from 'node:crypto';
import config from './config.json' with { type: 'json' };

export const states = ['PENDING','CREATIVE_GENERATING','READY','PUBLISHING','PUBLISHED','FAILED_RETRYABLE','FAILED_PERMANENT','SKIPPED'];
const transitions = {
  PENDING: ['CREATIVE_GENERATING','SKIPPED','FAILED_PERMANENT'],
  CREATIVE_GENERATING: ['READY','FAILED_RETRYABLE','FAILED_PERMANENT'],
  READY: ['PUBLISHING','FAILED_PERMANENT'],
  PUBLISHING: ['PUBLISHED','FAILED_RETRYABLE','FAILED_PERMANENT'],
  FAILED_RETRYABLE: ['CREATIVE_GENERATING','PUBLISHING','PUBLISHED','FAILED_PERMANENT','READY'],
  PUBLISHED: [], FAILED_PERMANENT: [], SKIPPED: [],
};
export function londonClock(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: config.schedule.timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(date).map((p) => [p.type,p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
export function isScheduleDue(date = new Date()) {
  const { time } = londonClock(date);
  const minutes = (s) => s.split(':').reduce((h,m) => h*60 + Number(m),0);
  const elapsed = minutes(time) - minutes(config.schedule.time);
  return elapsed >= 0 && elapsed <= config.schedule.catchUpMinutes;
}
export function enqueue(db, choice, day, dryRun = false) {
  const hash = createHash('sha256').update(`${choice.product.productId}:${day}:${dryRun?'dry':'live'}`).digest('hex').slice(0,16);
  const id = `igpub-${hash}`; const tracking = `ig-${hash}`;
  const now = new Date().toISOString();
  db.prepare(`INSERT OR IGNORE INTO instagram_queue
    (instagram_publication_id,internal_instagram_tracking_id,product_id,product_slug,cluster,state,scheduled_day,suitability_score,suitability_json,product_score,evidence_json,dry_run,created_at,updated_at)
    VALUES(?,?,?,?,?,'PENDING',?,?,?,?,?,?,?,?)`).run(id,tracking,choice.product.productId,choice.product.slug,choice.product.cluster,day,choice.suitability.totalScore,JSON.stringify(choice.suitability),choice.candidate.totalScore,JSON.stringify({ candidate:choice.candidate, product:choice.product }),Number(dryRun),now,now);
  const row=db.prepare('SELECT * FROM instagram_queue WHERE instagram_publication_id=?').get(id);
  if(!row)throw new Error('Daily Instagram queue slot already claimed by another product');
  return row;
}
export function transition(db, id, state, fields = {}) {
  const row = db.prepare('SELECT * FROM instagram_queue WHERE instagram_publication_id=?').get(id);
  if (!row || !transitions[row.state]?.includes(state)) throw new Error(`Invalid queue transition ${row?.state} -> ${state}`);
  const allowed = ['creative_id','creative_json','caption','hook','asset_path','public_asset_url','container_id','media_id','permalink','published_at','attempts','next_attempt_at','publish_attempt_at','publish_uncertain','last_error'];
  if (Object.keys(fields).some((key) => !allowed.includes(key))) throw new Error('Unknown queue field');
  const keys = Object.keys(fields);
  const changed = db.prepare(`UPDATE instagram_queue SET state=?,updated_at=?${keys.map(k=>`,${k}=?`).join('')} WHERE instagram_publication_id=? AND state=?`).run(state,new Date().toISOString(),...keys.map(k=>fields[k]),id,row.state);
  if (!changed.changes) throw new Error('Queue was claimed by another worker');
  return db.prepare('SELECT * FROM instagram_queue WHERE instagram_publication_id=?').get(id);
}
export function retryDelay(attempt) { return Math.min(config.retry.maximumBackoffSeconds,config.retry.initialBackoffSeconds * 2 ** Math.max(0,attempt-1)); }
