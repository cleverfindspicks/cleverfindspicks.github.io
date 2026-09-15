import {spawnSync} from 'node:child_process';
import {readdir,unlink,mkdir,mkdtemp,readFile,symlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {loadCredentials} from './credentials.mjs';
import {localEnvironment} from '../product-intelligence/local-env.mjs';
const root=resolve('.');
const run=(command,args,cwd=root)=>{const r=spawnSync(command,args,{cwd,stdio:'inherit',windowsHide:true});if(r.status!==0)throw new Error('Instagram deployment failed: '+command);};
const git=args=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error('Instagram git check failed');return r.stdout.trim();};
export async function deployInstagramChanges(){
  // Only Instagram assets are staged. An isolated committed snapshot preserves
  // unrelated in-progress Pinterest work without deploying it.
  if(git(['diff','--cached','--name-only']))throw new Error('Existing staged work; refusing unattended commit');
  run(process.execPath,['--test','instagram/tests/instagram.test.mjs','instagram/tests/oauth.test.mjs','instagram/tests/store-experience.test.mjs','instagram/tests/schedule.test.mjs']);
  run(process.execPath,['--test','--test-skip-pattern=missing external credentials','product-intelligence/tests/performance.test.mjs']);
  run(process.execPath,['product-intelligence/self-test.mjs']);
  run('git',['add','--','app/instagram-publications.json','public/instagram']);
  if(git(['diff','--cached','--name-only']))run('git',['commit','-m','Update Instagram creative and hub']);
  const local=resolve('product-intelligence/.local');await mkdir(local,{recursive:true});
  const stage=await mkdtemp(join(local,'instagram-deploy-'));
  const archive=join(stage,'source.tar');
  run('git',['archive','--format=tar','--output='+archive,'HEAD']);run('tar',['-xf',archive,'-C',stage]);await unlink(archive);
  await symlink(join(root,'node_modules'),join(stage,'node_modules'),process.platform==='win32'?'junction':'dir');
  run(process.execPath,[join(root,'node_modules/vinext/dist/cli.js'),'build'],stage);
  run(process.execPath,['scripts/prepare-github-pages.mjs'],stage);
  const output=join(stage,'dist/client');
  for(const file of await readdir(join(output,'pinterest')))if(file.endsWith('-source.jpg'))await unlink(join(output,'pinterest',file));
  run(process.execPath,['product-intelligence/validate-production.mjs'],stage);
  const c=await loadCredentials(),env=await localEnvironment();
  const secrets=[c.token,c.appSecret,...Object.entries(env).filter(([k])=>/SECRET|TOKEN|PASSWORD|API_KEY|APP_KEY/.test(k)).map(([,v])=>v)].filter(v=>typeof v==='string'&&v.length>=12);
  async function scan(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await scan(p);else if(!/\.(mp4|png|jpe?g|ico|woff2?)$/i.test(p)){const body=await readFile(p,'utf8');if(secrets.some(s=>body.includes(s)))throw new Error('Secret found in deployment artifact');}}}
  await scan(output);
  run('git',['push','github','codex/product-intelligence-production']);
  const gd=resolve('.publish-git');
  run('git',['--git-dir='+gd,'--work-tree='+output,'add','-A']);
  if(git(['--git-dir='+gd,'diff','--cached','--name-only']))run('git',['--git-dir='+gd,'--work-tree='+output,'commit','-m','Deploy Instagram module']);
  run('git',['--git-dir='+gd,'--work-tree='+output,'push','origin','publish:main']);
}
