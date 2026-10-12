import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {localEnvironment} from './local-env.mjs';
import {openPerformanceStore} from './performance-store.mjs';
import {syncAffiliateOrders} from './aliexpress-orders.mjs';

const env=await localEnvironment();
const local=new URL('./.local/',import.meta.url);
const stateUrl=new URL('aliexpress-order-sync.json',local);
await mkdir(local,{recursive:true});
const state=JSON.parse(await readFile(stateUrl,'utf8').catch(()=>'{}'));
const force=process.argv.includes('--force');
if(!force&&state.lastSuccessAt&&Date.now()-Date.parse(state.lastSuccessAt)<6*3600000){
  console.log(JSON.stringify({ok:true,status:'NOT_DUE',lastSuccessAt:state.lastSuccessAt,orders:state.orders||0}));
  process.exit(0);
}
const credentials={appKey:env.ALIEXPRESS_APP_KEY?.trim(),appSecret:env.ALIEXPRESS_APP_SECRET?.trim(),trackingId:env.ALIEXPRESS_TRACKING_ID?.trim()};
if(!credentials.appKey||!credentials.appSecret||!credentials.trackingId){
  console.log(JSON.stringify({ok:true,status:'NOT_CONFIGURED',imported:0}));
  process.exit(0);
}
const db=openPerformanceStore();
try{
  const result=await syncAffiliateOrders(db,{credentials});
  const next={status:'CONNECTED',lastSuccessAt:new Date().toISOString(),coverageDays:30,orders:result.fetched,imported:result.imported,unmatched:result.unmatched};
  const temporary=new URL(`aliexpress-order-sync.${process.pid}.tmp`,local);
  await writeFile(temporary,JSON.stringify(next,null,2));await rename(temporary,stateUrl);
  console.log(JSON.stringify({ok:true,...next}));
}finally{db.close();}
