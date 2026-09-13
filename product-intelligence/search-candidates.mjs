import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import config from './config.json' with { type: 'json' };
import { scoreCandidates } from './scoring.mjs';
import { maximumSimilarity } from './similarity.mjs';
import { products as publishedProducts } from '../app/products.ts';

const env = parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));
const key = env.ALIEXPRESS_APP_KEY?.trim();
const secret = env.ALIEXPRESS_APP_SECRET?.trim();
if (!key || !secret) throw new Error('Missing ALIEXPRESS_APP_KEY or ALIEXPRESS_APP_SECRET in .env.local');
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
    fields: 'product_id,product_title,product_main_image_url,product_detail_url,promotion_link,sale_price,original_price,commission_rate,commission_amount,evaluate_rate,lastest_volume,shop_url,ship_to_days',
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
    const priceGbp = Number(item.sale_price) || null;
    const commissionRatePct = Number.parseFloat(item.commission_rate) || null;
    const apiCommissionAmount = Number(item.commission_amount) || null;
    const commissionAmountGbp = apiCommissionAmount ?? (priceGbp && commissionRatePct ? Number((priceGbp * commissionRatePct / 100).toFixed(2)) : null);
    const title = String(item.product_title || '');
    const trackingId = `cfp-${createHash('sha256').update(String(item.product_id)).digest('hex').slice(0, 12)}`;
    const commercialTerms = /(organiser|organizer|storage|rack|shelf|drawer|hanger|basket|hook|foldable|space saving)/i;
    const intent = commercialTerms.test(`${query} ${title}`) ? 0.75 : 0.45;
    return ({
    productId: String(item.product_id),
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
      priceGbp,
      feedbackPct: Number.parseFloat(item.evaluate_rate) || null,
      recentVolume: Number(item.lastest_volume) || 0,
      commissionRatePct,
      commissionAmountGbp,
      commissionAmountSource: apiCommissionAmount ? 'api' : commissionAmountGbp ? 'calculated-from-price-and-rate' : 'unknown'
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
const evaluated = scoreCandidates(deduped);
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
