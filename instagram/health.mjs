import {openInstagramStore,setHealth} from './store.mjs';
import {loadCredentials} from './credentials.mjs';
import {tokenHealth,InstagramApi} from './api.mjs';
export async function instagramHealth({verify=false}={}){
  const db=openInstagramStore();const c=await loadCredentials();let status=tokenHealth(c);let detail=null;
  if(verify&&['CONNECTED','TOKEN_EXPIRING'].includes(status))try{const p=await new InstagramApi(c).profile();if(String(p.user_id||p.id)!==String(c.userId)){status='ERROR';detail='ACCOUNT_ID_MISMATCH';}}catch(error){status=error.tokenExpired?'TOKEN_EXPIRED':'ERROR';detail=`HTTP_${error.status||'UNKNOWN'}:${error.code||error.name||'API_ERROR'}`;}
  setHealth(db,'INSTAGRAM',status,detail);const queue=db.prepare('SELECT state,COUNT(*) count FROM instagram_queue WHERE dry_run=0 GROUP BY state').all();db.close();return {instagram:status,detail,queue,pinterestUnaffected:true};
}
if(process.argv[1]?.endsWith('health.mjs'))console.log(JSON.stringify(await instagramHealth({verify:process.argv.includes('--verify')})));
