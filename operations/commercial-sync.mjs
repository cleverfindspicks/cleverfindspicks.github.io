import {spawnSync} from 'node:child_process';
import {appendFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const projectPath=fileURLToPath(new URL('../',import.meta.url));

const scripts=[
  'product-intelligence/import-current-catalogue.mjs',
  'product-intelligence/sync-pinterest-performance.mjs',
  'product-intelligence/sync-site-performance.mjs',
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
const record={checkedAt:new Date().toISOString(),ok,status:ok?'COMMERCIAL_SYNC_COMPLETE':'COMMERCIAL_SYNC_PARTIAL',results};
const local=resolve(projectPath,'product-intelligence/.local');await mkdir(local,{recursive:true});
await appendFile(resolve(local,'commercial-sync.jsonl'),`${JSON.stringify(record)}\n`);
console.log(JSON.stringify(record));
