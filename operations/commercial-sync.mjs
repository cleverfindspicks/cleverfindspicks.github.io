import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const projectPath=fileURLToPath(new URL('../',import.meta.url));

const scripts=[
  'product-intelligence/sync-aliexpress-performance.mjs',
  'instagram/sync.mjs',
  'product-intelligence/recalculate-performance.mjs',
  'product-intelligence/generate-performance-report.mjs',
  'product-intelligence/analytics-health.mjs',
];
const results=[];
for(const script of scripts){
  const result=spawnSync(process.execPath,[script],{cwd:projectPath,encoding:'utf8',windowsHide:true});
  results.push({script,ok:result.status===0,output:(result.stdout||result.stderr||'').trim().split(/\r?\n/).at(-1)||null});
}
const ok=results.every(result=>result.ok);
console.log(JSON.stringify({ok,status:ok?'COMMERCIAL_SYNC_COMPLETE':'COMMERCIAL_SYNC_PARTIAL',results}));
if(!ok)process.exitCode=1;
