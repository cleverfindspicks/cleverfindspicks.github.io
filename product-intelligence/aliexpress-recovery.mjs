import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export const DEFERRED = 'DEFERRED_ALIEXPRESS_API_LIMIT';
export class AliExpressDeferred extends Error {
  constructor(nextAttemptAt){super(DEFERRED);this.code=DEFERRED;this.nextAttemptAt=nextAttemptAt;}
}
export const isAliExpressDeferred = error => error?.code===DEFERRED;
const defaultPath=fileURLToPath(new URL('./.local/aliexpress-recovery.sqlite',import.meta.url));
export function recoveryClient({path=process.env.CF_ALIEXPRESS_RECOVERY_DB||defaultPath,now=Date.now,fetcher=fetch}={}){
  function store(){mkdirSync(dirname(path),{recursive:true});const db=new DatabaseSync(path);db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS recovery(id INTEGER PRIMARY KEY, failures INTEGER NOT NULL, next_at INTEGER NOT NULL); INSERT OR IGNORE INTO recovery VALUES(1,0,0)');return db;}
  function check(){const db=store();try{const s=db.prepare('SELECT * FROM recovery WHERE id=1').get();if(s.next_at>now())throw new AliExpressDeferred(new Date(s.next_at).toISOString());return s;}finally{db.close();}}
  async function request(url,init){
    check();
    const startedAt=now();
    const response=await fetcher(url,init);
    const json=await response.clone().json().catch(()=>({}));
    const results=Object.values(json).filter(v=>v&&typeof v==='object');
    const limited=response.status===429||results.some(v=>/ApiCallLimit|rate.?limit|too many requests/i.test([v.code,v.sub_code,v.msg,v.resp_result?.resp_code,v.resp_result?.resp_msg].join(' ')));
    const db=store();
    try{
      if(limited){
        db.exec('BEGIN IMMEDIATE');
        const s=db.prepare('SELECT * FROM recovery WHERE id=1').get();
        const failures=s.failures+1;
        const retry=response.headers.get('retry-after');
        const serverDelay=retry?(Number.isFinite(Number(retry))?Number(retry)*1000:Math.max(0,Date.parse(retry)-now())):0;
        const next=Math.max(s.next_at,now()+Math.max(Math.min(21600000,900000*2**Math.min(failures-1,10)),serverDelay||0));
        db.prepare('UPDATE recovery SET failures=?,next_at=? WHERE id=1').run(failures,next);db.exec('COMMIT');
        throw new AliExpressDeferred(new Date(next).toISOString());
      }
      if(response.ok&&results.some(v=>Number(v.resp_result?.resp_code)===200))db.prepare('UPDATE recovery SET failures=0,next_at=0 WHERE id=1 AND next_at<=?').run(startedAt);
    }finally{db.close();}
    return response;
  }
  return {check,request};
}
export const assertAliExpressReady=()=>recoveryClient().check();
export const aliExpressFetch=(url,init,fetcher=fetch)=>recoveryClient({fetcher}).request(url,init);

// Deferred evidence is a retry input only. Callers must fetch current detail
// and score again before it can be used for publication.
function deferredStore(){
  const path=process.env.CF_ALIEXPRESS_RECOVERY_DB||defaultPath;
  mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS deferred_candidates(platform TEXT, product_id TEXT, candidate_json TEXT, PRIMARY KEY(platform,product_id))');
  return db;
}
export function rememberDeferred(platform,candidates){
  const db=deferredStore();try{const insert=db.prepare('INSERT OR REPLACE INTO deferred_candidates VALUES(?,?,?)');for(const c of candidates)insert.run(platform,String(c.productId),JSON.stringify(c));}finally{db.close();}
}
export function deferredCandidates(platform){
  const db=deferredStore();try{return db.prepare('SELECT candidate_json FROM deferred_candidates WHERE platform=?').all(platform).map(r=>JSON.parse(r.candidate_json));}finally{db.close();}
}
export function completeDeferred(platform,ids){
  const db=deferredStore();try{const remove=db.prepare('DELETE FROM deferred_candidates WHERE platform=? AND product_id=?');for(const id of ids)remove.run(platform,String(id));}finally{db.close();}
}
