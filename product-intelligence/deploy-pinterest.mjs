import { mkdtemp, mkdir, readdir, readFile, symlink, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { localEnvironment } from './local-env.mjs';

const root = resolve('.');
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error(`Pinterest deployment failed: ${command} ${args.join(' ')}`);
};
const git = (args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Pinterest git check failed: ${args.join(' ')}`);
  return result.stdout.trim();
};

export async function deployPinterestChanges() {
  if (git(['diff', '--cached', '--name-only'])) throw new Error('Existing staged work; refusing unattended commit');
  run(process.execPath, ['product-intelligence/self-test.mjs']);
  run(process.execPath, ['--test', 'product-intelligence/tests/publication-records.test.mjs']);
  run(process.execPath, ['--test', 'product-intelligence/tests/creative-platform-separation.test.mjs']);
  run(process.execPath, ['product-intelligence/validate-production.mjs']);
  run('git', ['add', '--', 'app/generated-products.json', 'app/product-media.json', 'app/affiliate-destinations.json', 'public/products/verified', 'public/pinterest']);
  if (git(['diff', '--cached', '--name-only'])) run('git', ['commit', '-m', 'Publish scheduled Pinterest find']);

  const local = resolve('product-intelligence/.local');
  await mkdir(local, { recursive: true });
  const stage = await mkdtemp(join(local, 'pinterest-deploy-'));
  const archive = join(stage, 'source.tar');
  run('git', ['archive', '--format=tar', `--output=${archive}`, 'HEAD']);
  run('tar', ['-xf', archive, '-C', stage]);
  await unlink(archive);
  await symlink(join(root, 'node_modules'), join(stage, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  run(process.execPath, [join(root, 'node_modules/vinext/dist/cli.js'), 'build'], stage);
  run(process.execPath, ['scripts/prepare-github-pages.mjs'], stage);
  const output = join(stage, 'dist/client');
  for (const file of await readdir(join(output, 'pinterest'))) if (file.endsWith('-source.jpg')) await unlink(join(output, 'pinterest', file));
  const rss = await readFile(join(output, 'rss.xml'), 'utf8');
  const currentProducts = (await import(`../app/products.ts?scheduled=${Date.now()}`)).products;
  if ((rss.match(/<item>/g) || []).length !== currentProducts.length) throw new Error('Pinterest deployment RSS item count mismatch');

  const env = await localEnvironment();
  const secrets = Object.entries(env).filter(([key]) => /SECRET|TOKEN|PASSWORD|API_KEY|APP_KEY/.test(key)).map(([, value]) => value).filter((value) => typeof value === 'string' && value.length >= 12);
  async function scan(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await scan(path);
      else if (!/\.(mp4|png|jpe?g|ico|woff2?)$/i.test(path)) {
        const body = await readFile(path, 'utf8');
        if (secrets.some((secret) => body.includes(secret))) throw new Error('Secret found in Pinterest deployment artifact');
      }
    }
  }
  await scan(output);
  run('git', ['push', 'github', 'codex/product-intelligence-production']);
  const gd = resolve('.publish-git');
  run('git', [`--git-dir=${gd}`, `--work-tree=${output}`, 'add', '-A']);
  if (git([`--git-dir=${gd}`, 'diff', '--cached', '--name-only'])) run('git', [`--git-dir=${gd}`, `--work-tree=${output}`, 'commit', '-m', 'Deploy scheduled Pinterest find']);
  run('git', [`--git-dir=${gd}`, `--work-tree=${output}`, 'push', 'origin', 'publish:main']);
}
