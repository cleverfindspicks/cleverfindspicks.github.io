import {spawnSync} from 'node:child_process';
import {readdir,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const run=(command,args)=>{const r=spawnSync(command,args,{stdio:'inherit',windowsHide:true});if(r.status!==0)throw new Error(`Instagram deployment failed: ${command} ${args.join(' ')}`);};
const pnpm=(script)=>process.platform==='win32'?run(process.env.ComSpec||'cmd.exe',['/d','/s','/c',`pnpm ${script}`]):run('pnpm',[script]);
export async function deployInstagramChanges(){
  // Same existing GitHub Pages topology. This function never invokes Pinterest
  // search, publication, RSS refresh, affiliate generation or performance jobs.
  pnpm('instagram:test');
  // The legacy missing-credentials test writes Pinterest health.json. It was
  // verified during setup, but must not mutate Pinterest health on IG runs.
  run(process.execPath,['--test','--test-skip-pattern=missing external credentials','product-intelligence/tests/performance.test.mjs']);
  pnpm('intelligence:test');pnpm('build');pnpm('intelligence:validate');
  const root=resolve('dist/client/pinterest');
  for(const file of await readdir(root)){if(file.endsWith('-source.jpg'))await unlink(join(root,file));}
  const changed=spawnSync('git',['status','--porcelain'],{encoding:'utf8'}).stdout.split(/\r?\n/).filter(Boolean);
  const unrelated=changed.filter(line=>!['app/instagram-publications.json','public/instagram/'].some(prefix=>line.slice(3).startsWith(prefix)));
  if(unrelated.length)throw new Error('Unrelated source changes present; refusing unattended source commit');
  run('git',['add','--','app/instagram-publications.json','public/instagram']);
  const staged=spawnSync('git',['diff','--cached','--quiet']);
  if(staged.status!==0)run('git',['commit','-m','Update Instagram creative and hub']);
  run('git',['push','github','codex/product-intelligence-production']);
  run('git',['--git-dir=.publish-git','--work-tree=dist/client','add','-A']);
  const pending=spawnSync('git',['--git-dir=.publish-git','diff','--cached','--quiet']);
  if(pending.status!==0)run('git',['--git-dir=.publish-git','--work-tree=dist/client','commit','-m','Deploy Instagram creative and hub']);
  run('git',['--git-dir=.publish-git','--work-tree=dist/client','push','origin','publish:main']);
}
