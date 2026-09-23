import {readFile,rename,writeFile,mkdir} from 'node:fs/promises';
import {products} from '../app/products.ts';
import {refreshProductEvidence} from './product-evidence.mjs';
import {isAliExpressDeferred} from '../product-intelligence/aliexpress-recovery.mjs';

const local=new URL('../product-intelligence/.local/',import.meta.url);
const stateUrl=new URL('instagram-fresh-buffer-state.json',local);
await mkdir(local,{recursive:true});
const state=JSON.parse(await readFile(stateUrl,'utf8').catch(()=>'{"lastAttemptAt":null}'));
const now=Date.now();
if(state.nextAttemptAt&&Date.parse(state.nextAttemptAt)>now){console.log(JSON.stringify({status:'FRESH_BUFFER_BACKOFF',nextAttemptAt:state.nextAttemptAt}));process.exit(0);}
if(state.lastAttemptAt&&now-Date.parse(state.lastAttemptAt)<2*3600000){console.log(JSON.stringify({status:'FRESH_BUFFER_NOT_DUE'}));process.exit(0);}
const pool=JSON.parse(await readFile(new URL('../product-intelligence/data/candidate-pool.json',import.meta.url),'utf8'));
const cache=JSON.parse(await readFile(new URL('instagram-product-evidence-cache.json',local),'utf8').catch(()=>'{"records":{}}'));
const eligible=(pool.candidates||[]).filter(candidate=>products.some(product=>String(product.productId)===String(candidate.productId))&&candidate.totalScore>=65&&candidate.confidence>=.75).sort((a,b)=>b.totalScore-a.totalScore);
const stale=eligible.find(candidate=>{const row=cache.records?.[String(candidate.productId)];return !row||Date.now()-Date.parse(row.checkedAt)>20*3600000;});
if(!stale){console.log(JSON.stringify({status:'FRESH_BUFFER_HEALTHY',fresh:eligible.length}));process.exit(0);}
const product=products.find(row=>String(row.productId)===String(stale.productId));
state.lastAttemptAt=new Date().toISOString();
try{
  const refreshed=await refreshProductEvidence([{product,candidate:stale}]);
  state.lastSuccessAt=refreshed.length?new Date().toISOString():state.lastSuccessAt;state.nextAttemptAt=null;
  console.log(JSON.stringify({status:refreshed.length?'FRESH_BUFFER_REFRESHED':'FRESH_BUFFER_NO_RESULT',productId:stale.productId}));
}catch(error){if(isAliExpressDeferred(error)){state.nextAttemptAt=error.nextAttemptAt;console.log(JSON.stringify({status:'DEFERRED_ALIEXPRESS_API_LIMIT',nextAttemptAt:error.nextAttemptAt}));}else{state.nextAttemptAt=new Date(Date.now()+2*3600000).toISOString();console.log(JSON.stringify({status:'FRESH_BUFFER_ERROR',detail:String(error.message).slice(0,120)}));}}
const temp=new URL(`instagram-fresh-buffer-state.${process.pid}.tmp`,local);await writeFile(temp,JSON.stringify(state,null,2));await rename(temp,stateUrl);
