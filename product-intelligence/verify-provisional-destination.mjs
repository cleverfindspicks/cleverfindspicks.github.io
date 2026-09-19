import { readFile, writeFile } from 'node:fs/promises';
import {isAliExpressDeferred} from './aliexpress-recovery.mjs';
import { parseEnv } from 'node:util';
import { canonicalProductUrl, generateAffiliateLink, resolveAffiliateDestination } from './affiliate-destination.mjs';
import {priceConflict,currencyGate} from './currency.mjs';

const report = JSON.parse(await readFile(new URL('./data/dry-run-report.json', import.meta.url), 'utf8'));
const winner = report.winner;
if (!winner?.productId) throw new Error('No provisional winner is available for affiliate destination verification.');
if(!currencyGate(winner))throw new Error('Currency Verification Gate blocks unverified GBP price.');
const env = parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));
if (!env.ALIEXPRESS_APP_KEY || !env.ALIEXPRESS_APP_SECRET || !env.ALIEXPRESS_TRACKING_ID) throw new Error('Missing AliExpress Affiliate credentials.');

let affiliateUrl = null;
let validation;
try {
  const generated = await generateAffiliateLink({
    productId: winner.productId,
    appKey: env.ALIEXPRESS_APP_KEY.trim(),
    appSecret: env.ALIEXPRESS_APP_SECRET.trim(),
    trackingId: env.ALIEXPRESS_TRACKING_ID.trim(),
  });
  affiliateUrl = generated.affiliateUrl;
  validation = await resolveAffiliateDestination(affiliateUrl, winner.productId);
} catch (error) {
  if(isAliExpressDeferred(error))throw error;
  validation = {
    checkedAt: new Date().toISOString(),
    expectedProductId: String(winner.productId),
    finalDestination: null,
    finalProductId: null,
    destinationType: 'ERROR',
    matchesExpectedProduct: false,
    pass: false,
    reason: `BROKEN_AFFILIATE_DESTINATION_GENERATION_ERROR:${error.name}`,
    redirectChain: [],
  };
}

const evidenceUrl = new URL('./data/verification-evidence.json', import.meta.url);
const evidence = JSON.parse(await readFile(evidenceUrl, 'utf8').catch(() => '{"schemaVersion":1,"records":[]}'));
const records = evidence.records || [];
const index = records.findIndex((item) => String(item.productId) === String(winner.productId));
const existing = index >= 0 ? records[index] : {};
const record = {
  ...existing,
  productId: String(winner.productId),
  source: 'Official AliExpress Affiliate link.generate followed by end-to-end redirect validation',
  checkedAt: validation.checkedAt,
  exactProductIdMatched: validation.matchesExpectedProduct,
  canonicalProductUrl: canonicalProductUrl(winner.productId),
  affiliateUrl,
  affiliateDestinationVerified: validation.pass,
  affiliateDestination: validation,
  currencyDestinationComparison:priceConflict(winner.metrics.priceGbp,validation.finalDestination),
};
if (index >= 0) records[index] = record; else records.push(record);
await writeFile(evidenceUrl, JSON.stringify({ ...evidence, schemaVersion: 1, records, note: 'Only verified, timestamped evidence belongs here. Unknown values must remain null.' }, null, 2));
console.log(JSON.stringify({ ok: validation.pass, productId: winner.productId, reason: validation.reason }));
if (!validation.pass) process.exitCode = 2;
