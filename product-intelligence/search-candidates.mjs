import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import config from './config.json' with { type: 'json' };
import { scoreCandidates } from './scoring.mjs';
import { maximumSimilarity } from './similarity.mjs';
import { products as publishedProducts } from '../app/products.ts';
import { classifyEvidence, enrichCandidate, priceBenchmarks } from './enrichment.mjs';
import {verifyCurrency,commissionMetrics,currencyFields} from './currency.mjs';

const env = parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));
const key = env.ALIEXPRESS_APP_KEY?.trim();
const secret = env.ALIEXPRESS_APP_SECRET?.trim();
const trackingId = env.ALIEXPRESS_TRACKING_ID?.trim();
if (!key || !secret || !trackingId) throw new Error('Missing required AliExpress credentials in .env.local');
const clusterPerformance = JSON.parse(await readFile(new URL('./data/cluster-performance.json', import.meta.url), 'utf8'));
const priorityByCluster = new Map((clusterPerformance.clusters || []).map((cluster) => [cluster.cluster, cluster.searchPriorityMultiplier]));
const runId = `cf-run-${new Date().toISOString().replaceAll(/[-:.]/g, '').slice(0, 15)}-${randomUUID().slice(0, 8)}`;
const searchPlan = config.queries.map((query) => {
  const cluster = config.queryClusters[query] || 'unclassified';
  const priorityMultiplier = priorityByCluster.get(cluster) || 1;
  return { query, cluster, priorityMultiplier, pages: priorityMultiplier >= 1.15 ? 2 : 1, sortModes: ['LAST_VOLUME_DESC', 'RELEVANCE'] };
}).sort((a, b) => b.priorityMultiplier - a.priorityMultiplier);

async function search(query, pageNo, sortMode) {
  const params = {
    app_key: key,
    method: 'aliexpress.affiliate.product.query',
    timestamp: String(Date.now()),
    sign_method: 'sha256',
    format: 'json',
    v: '2.0',
    keywords: query,
    page_no: String(pageNo),
    page_size: '40',
    ship_to_country: config.market.country,
    target_currency: config.market.currency,
    target_language: config.market.language,
    fields: 'product_id,product_title,product_main_image_url,product_detail_url,promotion_link,evaluate_rate,lastest_volume,shop_url,ship_to_days,'+currencyFields,
  };
  if (sortMode === 'LAST_VOLUME_DESC') params.sort = sortMode;
  const canonical = Object.keys(params).sort().map((name) => name + params[name]).join('');
  const sign = createHmac('sha256', secret).update(canonical, 'utf8').digest('hex').toUpperCase();
  const response = await fetch('https://api-sg.aliexpress.com/sync', {
    method: 'POST',
    body: new URLSearchParams({ ...params, sign }),
    signal: AbortSignal.timeout(25000),
  });
  const data = await response.json();
  const result = data.aliexpress_affiliate_product_query_response?.resp_result;
  const products = result?.result?.products?.product;
  if (!response.ok || Number(result?.resp_code) !== 200 || !Array.isArray(products)) return [];
  return products.map((item) => {
    const priceVerification=verifyCurrency(item,{source:'AliExpress Affiliate Product Query'});
    const priceMetrics=commissionMetrics(item,priceVerification);
    const title = String(item.product_title || '');
    const trackingId = `cfp-${createHash('sha256').update(String(item.product_id)).digest('hex').slice(0, 12)}`;
    const commercialTerms = /(organiser|organizer|storage|rack|shelf|drawer|hanger|basket|hook|foldable|space saving)/i;
    const intent = commercialTerms.test(`${query} ${title}`) ? 0.75 : 0.45;
    return ({
    productId: String(item.product_id),
    ...priceVerification,
    currencyVerification:priceVerification,
    trackingId,
    pinId: `pin-${trackingId}-${new Date().toISOString().slice(0, 10)}`,
    runId,
    evaluatedAt: new Date().toISOString(),
    searchQuery: query,
    searchPage: pageNo,
    searchSortMode: sortMode,
    title,
    image: item.product_main_image_url || null,
    productUrl: item.product_detail_url || null,
    affiliateUrl: item.promotion_link || null,
    cluster: config.queryClusters[query] || 'unclassified',
    metrics: {
      ...priceMetrics,
      feedbackPct: Number.parseFloat(item.evaluate_rate) || null,
      recentVolume: Number(item.lastest_volume) || 0,
    },
    expectedPriceBandGbp: null,
    shipping: {
      available: null,
      costGbp: null,
      daysMax: Number(item.ship_to_days) || null,
      verified: false,
      note: 'The query targeted GB, but delivery availability, cost and time were not independently verified.'
    },
    seller: {
      reliabilityScore: null,
      verified: false,
      source: item.shop_url ? 'Shop URL returned; reliability metrics unavailable.' : 'Unavailable from response.'
    },
    listing: { variantClarity: null, priceVerifiedForShownVariant: false },
    factors: {
      valueForMoney: null,
      ukSuitability: null,
      smallSpaceRelevance: null,
      visualAppeal: null,
      impulsePurchase: null,
      obviousProblem: null,
      buyerIntent: intent,
      competitionSaturation: null
    },
    duplicateSimilarity: maximumSimilarity(title, publishedProducts),
    pinCreative: null,
    selectionReason: null
  });
  });
}

async function detail(products) {
  const params = {
    app_key: key,
    method: 'aliexpress.affiliate.productdetail.get',
    timestamp: String(Date.now()),
    sign_method: 'sha256',
    format: 'json',
    v: '2.0',
    product_ids: products.map((product) => product.productId).join(','),
    country: config.market.country,
    target_currency: config.market.currency,
    target_language: config.market.language,
    tracking_id: trackingId,
    fields: 'product_id,product_title,product_main_image_url,product_detail_url,promotion_link,evaluate_rate,lastest_volume,ship_to_days,'+currencyFields,
  };
  const canonical = Object.keys(params).sort().map((name) => name + params[name]).join('');
  const sign = createHmac('sha256', secret).update(canonical, 'utf8').digest('hex').toUpperCase();
  const response = await fetch('https://api-sg.aliexpress.com/sync', { method: 'POST', body: new URLSearchParams({ ...params, sign }), signal: AbortSignal.timeout(25000) });
  const data = await response.json();
  const result = data.aliexpress_affiliate_productdetail_get_response?.resp_result;
  const rows = result?.result?.products?.product;
  if (!response.ok || Number(result?.resp_code) !== 200 || !Array.isArray(rows)) return [];
  return rows;
}

const batches = [];
for (const item of searchPlan) {
  for (let page = 1; page <= item.pages; page += 1) {
    for (const sortMode of item.sortModes) batches.push(...await search(item.query, page, sortMode));
  }
}
const deduped = [...Map.groupBy(batches, (item) => item.productId).values()].map((rows) => ({
  ...rows[0],
  searchQuery: rows.map((row) => row.searchQuery),
  searchPages: [...new Set(rows.map((row) => row.searchPage))],
  searchSortModes: [...new Set(rows.map((row) => row.searchSortMode))],
  matchedClusters: [...new Set(rows.map((row) => row.cluster))],
}));
const details = [];
for (let index = 0; index < deduped.length; index += 20) {
  try { details.push(...await detail(deduped.slice(index, index + 20))); } catch { /* Missing detail evidence safely blocks that batch. */ }
}
const detailById = new Map(details.map((item) => [String(item.product_id), item]));
const detailed = deduped.map((candidate) => {
  const item = detailById.get(candidate.productId);
  if (!item) return { ...candidate, detailVerification: { productIdMatched: false, checkedAt: new Date().toISOString(), source: 'AliExpress Affiliate Product Detail API (GB)' } };
  const priceVerification=verifyCurrency(item,{source:'AliExpress Affiliate Product Detail'});
  const priceMetrics=commissionMetrics(item,priceVerification);
  const detailPrice = priceMetrics.priceGbp;
  const queryPrice = Number(candidate.metrics.priceGbp) || null;
  const priceMatched = Boolean(detailPrice && queryPrice && Math.abs(detailPrice - queryPrice) / Math.max(detailPrice, queryPrice) <= 0.08);
  return {
    ...candidate,
    ...priceVerification,
    currencyVerification:priceVerification,
    queryCurrencyVerification:candidate.currencyVerification,
    affiliateUrl: item.promotion_link || candidate.affiliateUrl,
    productUrl: item.product_detail_url || candidate.productUrl,
    metrics: {
      ...candidate.metrics,
      ...priceMetrics,
      feedbackPct: Number.parseFloat(item.evaluate_rate) || candidate.metrics.feedbackPct,
      recentVolume: Number(item.lastest_volume) || candidate.metrics.recentVolume,
    },
    shipping: {
      available: true,
      marketAvailabilityVerified: true,
      costGbp: null,
      daysMax: Number(item.ship_to_days) || null,
      method: null,
      verified: true,
      checkedAt: new Date().toISOString(),
      source: 'AliExpress Affiliate Product Detail API queried with country=GB',
      note: 'GB market availability is verified by the returned exact product. Cost, method and exact estimate remain unknown when absent.',
    },
    detailVerification: {
      productIdMatched: String(item.product_id) === candidate.productId,
      priceMatched,
      queryPriceGbp: queryPrice,
      detailPriceGbp: detailPrice,
      checkedAt: new Date().toISOString(),
      source: 'AliExpress Affiliate Product Detail API (GB)',
    },
  };
});
const benchmarks = priceBenchmarks(detailed);
const enriched = detailed.map((candidate) => enrichCandidate(candidate, benchmarks.get(candidate.cluster)));
const evaluated = scoreCandidates(enriched, { stage: 'qualification' }).map((candidate) => ({ ...candidate, evidence: classifyEvidence(candidate) }));
await writeFile(new URL('./data/candidate-pool.json', import.meta.url), JSON.stringify({
  generatedAt: new Date().toISOString(),
  runId,
  market: config.market,
  queryCount: config.queries.length,
  searchPlan,
  candidateCount: evaluated.length,
  note: 'Objective API metrics are stored. Editorial, shipping, seller, variant and creative fields remain unknown until verified; unknowns never receive invented points.',
  candidates: evaluated,
}, null, 2));
const runLogUrl = new URL('./data/run-log.json', import.meta.url);
const runLog = await readFile(runLogUrl, 'utf8').then(JSON.parse).catch(() => ({ runs: [] }));
runLog.runs = [...(runLog.runs || []), { runId, generatedAt: new Date().toISOString(), queryCount: config.queries.length, candidateCount: evaluated.length, publishableCount: evaluated.filter((item) => item.decision === 'keep').length }].slice(-config.retention.maximumRunSummaries);
await writeFile(runLogUrl, JSON.stringify(runLog, null, 2));
console.log(JSON.stringify({ ok: true, queries: config.queries.length, candidates: evaluated.length, publishable: evaluated.filter((item) => item.decision === 'keep').length }));
