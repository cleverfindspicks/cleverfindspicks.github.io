import {openInstagramStore,setHealth} from './store.mjs';
import {loadCredentials} from './credentials.mjs';
import {tokenHealth,InstagramApi} from './api.mjs';
export async function instagramHealth({verify=false}={}){
  const db=openInstagramStore();const c=await loadCredentials();let status=tokenHealth(c);
  if(verify&&['CONNECTED','TOKEN_EXPIRING'].includes(status))try{const p=await new InstagramApi(c).profile();if(String(p.user_id||p.id)!==String(c.userId))status='ERROR';}catch(error){status=error.tokenExpired?'TOKEN_EXPIRED':'ERROR';}
  setHealth(db,'INSTAGRAM',status);const queue=db.prepare('SELECT state,COUNT(*) count FROM instagram_queue WHERE dry_run=0 GROUP BY state').all();db.close();return {instagram:status,queue,pinterestUnaffected:true};
}
if(process.argv[1]?.endsWith('health.mjs'))console.log(JSON.stringify(await instagramHealth({verify:process.argv.includes('--verify')})));
