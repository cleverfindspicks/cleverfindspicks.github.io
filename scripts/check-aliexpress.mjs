import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHmac } from 'node:crypto';

// Connectivity or link-generation check. Never print credentials or raw responses.
const env = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
const key = env.ALIEXPRESS_APP_KEY?.trim();
const secret = env.ALIEXPRESS_APP_SECRET?.trim();
if (!key || !secret) {
  console.log(JSON.stringify({ok: false, reason: 'Missing local credentials'}));
  process.exit(1);
}
const linkMode = process.argv.includes('--link');
const searchMode = process.argv.includes('--search');
if (linkMode && !env.ALIEXPRESS_TRACKING_ID?.trim()) {
  console.log(JSON.stringify({ok:false, reason:'Missing tracking ID'}));
  process.exit(1);
}
const params = {
  app_key: key,
  method: searchMode ? 'aliexpress.affiliate.product.query' : linkMode ? 'aliexpress.affiliate.link.generate' : 'aliexpress.affiliate.category.get',
  timestamp: String(Date.now()),
  sign_method: 'sha256',
  format: 'json',
  v: '2.0',
};
if (linkMode) Object.assign(params, {
  tracking_id: env.ALIEXPRESS_TRACKING_ID.trim(),
  promotion_link_type: '0',
  source_values: 'https://www.aliexpress.com/',
});
if (searchMode) Object.assign(params, {
  keywords: process.argv[process.argv.indexOf('--search') + 1] || 'home storage organizer',
  page_no: '1',
  page_size: '40',
  ship_to_country: 'GB',
  target_currency: 'GBP',
  target_language: 'EN',
  sort: 'LAST_VOLUME_DESC',
  fields: 'product_id,product_title,product_main_image_url,promotion_link,sale_price,original_price,commission_rate,commission_amount,evaluate_rate,lastest_volume,shop_url',
});
const canonical = Object.keys(params).sort().map(k => k + params[k]).join('');
const sign = createHmac('sha256', secret).update(canonical, 'utf8').digest('hex').toUpperCase();
const clean = value => String(value ?? '').replaceAll(secret, '[REDACTED]').replaceAll(sign, '[REDACTED]').slice(0, 400);
try {
  const response = await fetch('https://api-sg.aliexpress.com/sync', {
    method: 'POST',
    body: new URLSearchParams({...params, sign}),
    redirect: 'error',
    signal: AbortSignal.timeout(25000),
  });
  const data = await response.json();
  const error = data.error_response;
  const result = data[params.method.replaceAll('.', '_') + '_response']?.resp_result;
  const categories = result?.result?.categories?.category;
  const links = result?.result?.promotion_links?.promotion_link;
  const productList = result?.result?.products?.product;
  const validLink = Array.isArray(links) && links.some(item => {
    try { const url = new URL(item.promotion_link); return url.protocol === 'https:' && url.hostname === 's.click.aliexpress.com'; } catch { return false; }
  });
  const ok = response.ok && !error && Number(result?.resp_code) === 200 && (!linkMode || validLink);
  console.log(JSON.stringify({
    ok, httpStatus: response.status, method: params.method,
    code: clean(error?.code ?? result?.resp_code ?? data.code),
    message: clean(error?.sub_msg ?? error?.msg ?? result?.resp_msg ?? data.message ?? data.msg),
    subCode: clean(error?.sub_code),
    categoryCount: Array.isArray(categories) ? categories.length : 0,
    ...(linkMode ? {trackingId:params.tracking_id, linkCount:Array.isArray(links) ? links.length : 0, validAffiliateLink:validLink} : {}),
    ...(searchMode ? {products:Array.isArray(productList) ? productList.slice(0, 20).map(item => ({
      id: clean(item.product_id), title: clean(item.product_title), price: clean(item.sale_price),
      commissionRate: clean(item.commission_rate), commissionAmount: clean(item.commission_amount),
      feedback: clean(item.evaluate_rate), volume: clean(item.lastest_volume), image: clean(item.product_main_image_url),
      promotionLink: clean(item.promotion_link),
    })) : []} : {}),
  }));
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  console.log(JSON.stringify({ok:false, reason:'Request failed', errorType:clean(error.name), code:clean(error.cause?.code)}));
  process.exitCode = 1;
}
