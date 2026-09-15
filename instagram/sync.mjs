import {openInstagramStore,setHealth} from './store.mjs';
import {loadCredentials,refreshIfNeeded} from './credentials.mjs';
import {tokenHealth,InstagramApi} from './api.mjs';
import {syncInstagramInsights,writeInstagramReport} from './analytics.mjs';
const db=openInstagramStore();
try{
  let c=await loadCredentials();const status=tokenHealth(c);setHealth(db,'INSTAGRAM',status);
  if(!['NOT_CONFIGURED','TOKEN_EXPIRED'].includes(status)){c=await refreshIfNeeded(c);console.log(JSON.stringify(await syncInstagramInsights(db,new InstagramApi(c))));}
  else console.log(JSON.stringify({status,publishingUnaffected:true}));
  await writeInstagramReport(db);
}catch(error){setHealth(db,'INSTAGRAM',error.tokenExpired?'TOKEN_EXPIRED':'ERROR',String(error.message).slice(0,150));console.log(JSON.stringify({status:'ERROR',pinterestUnaffected:true}));}finally{db.close();}
