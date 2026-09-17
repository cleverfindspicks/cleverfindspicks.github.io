import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildContentCandidate } from './content.mjs';
import { prepareProductImage } from '../media/prepare-product-image.mjs';
import { generatePinterestCreative } from './pinterest-creative.mjs';
import { validatePublicationBundle } from './publication-gate.mjs';
import { deployPinterestChanges } from './deploy-pinterest.mjs';

const root = new URL('..', import.meta.url);
function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error(`${script} failed with exit ${result.status}`);
}

export async function runPinterestProduction() {
  const lock = new URL('./.local/pinterest-production-worker.lock', import.meta.url);
  await mkdir(new URL('./.local/', import.meta.url), { recursive: true });
  try { await writeFile(lock, String(process.pid), { flag: 'wx' }); }
  catch {
    const pid = Number(await readFile(lock, 'utf8').catch(() => 0));
    try { if (pid) process.kill(pid, 0); return { status: 'WORKER_ALREADY_RUNNING' }; } catch { await unlink(lock).catch(() => {}); await writeFile(lock, String(process.pid), { flag: 'wx' }); }
  }
  try {
  run('product-intelligence/automation-run.mjs');
  const report = JSON.parse(await readFile(new URL('./data/dry-run-report.json', import.meta.url), 'utf8'));
  if (!report.winner) return { status: 'SKIPPED_NO_QUALIFIED_PINTEREST_PRODUCT' };
  let candidate = await prepareProductImage(report.winner);
  if (candidate.productImageVerified !== true) return { status: 'SKIPPED_IMAGE_NOT_VERIFIED', productId: candidate.productId };
  candidate = { ...candidate, pinCreative: await generatePinterestCreative(candidate) };
  const content = buildContentCandidate(candidate);
  const bundle = {
    candidate,
    verification: { productId: candidate.productId, source: candidate.detailVerification?.source, checkedAt: candidate.detailVerification?.checkedAt },
    ...content,
    publishedAt: new Date().toISOString(),
    publicationPerformed: false,
  };
  const gate = validatePublicationBundle(bundle);
  if (!gate.ok) return { status: 'BLOCKED_BY_PUBLICATION_GATE', productId: candidate.productId, errors: gate.errors };
  await mkdir(new URL('./.local/', import.meta.url), { recursive: true });
  const bundlePath = new URL('./.local/scheduled-pinterest-bundle.json', import.meta.url);
  await writeFile(bundlePath, JSON.stringify(bundle, null, 2));
  run('product-intelligence/publish-approved.mjs', [fileURLToPath(bundlePath)]);
  await deployPinterestChanges();
  return { status: 'PUBLISHED_TO_RSS', productId: candidate.productId, slug: content.landingPage.slug };
  } finally { await unlink(lock).catch(() => {}); }
}

if (process.argv[1]?.endsWith('production-run.mjs')) {
  try { console.log(JSON.stringify(await runPinterestProduction())); }
  catch (error) { console.error(JSON.stringify({ status: 'ERROR', detail: String(error.message).slice(0, 240) })); process.exitCode = 1; }
}
