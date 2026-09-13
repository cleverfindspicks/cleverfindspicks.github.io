import { createHmac } from 'node:crypto';

const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-GB,en;q=0.9',
};

export function canonicalProductUrl(productId) {
  if (!/^\d{8,}$/.test(String(productId || ''))) throw new Error('A numeric AliExpress product ID is required.');
  return `https://www.aliexpress.com/item/${productId}.html`;
}

export function extractProductId(value) {
  try {
    const url = new URL(value);
    const pathMatch = url.pathname.match(/\/item\/(\d{8,})(?:\.html)?/i);
    if (pathMatch) return pathMatch[1];
    for (const key of ['productId', 'product_id', 'itemId', 'item_id']) {
      const candidate = url.searchParams.get(key);
      if (/^\d{8,}$/.test(candidate || '')) return candidate;
    }
  } catch { /* Invalid URLs have no product ID. */ }
  return null;
}

export function classifyDestination(value, status = 0, body = '') {
  if (!value || status >= 400) return status >= 400 ? 'ERROR' : 'UNKNOWN';
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (/unavailable|not[ -]?found|does not exist|no longer available/i.test(body)) return 'UNAVAILABLE';
  if (extractProductId(value)) return 'PRODUCT';
  if (/\/wholesale|\/w\/wholesale|\/search/i.test(path) || url.searchParams.has('SearchText')) return 'SEARCH';
  if ((host === 'www.aliexpress.com' || host === 'aliexpress.com' || host === 'best.aliexpress.com' || /^[a-z]{2}\.aliexpress\.com$/.test(host)) && path === '/') return 'HOMEPAGE';
  return 'OTHER';
}

export async function resolveAffiliateDestination(affiliateUrl, expectedProductId, { timeoutMs = 30000, maximumRedirects = 12 } = {}) {
  const chain = [];
  let current = affiliateUrl;
  try {
    for (let hop = 0; hop <= maximumRedirects; hop += 1) {
      const response = await fetch(current, { redirect: 'manual', headers: BROWSER_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
      const location = response.headers.get('location');
      chain.push({ url: current, status: response.status, location: location ? new URL(location, current).href : null });
      if (response.status >= 300 && response.status < 400 && location) {
        current = new URL(location, current).href;
        continue;
      }
      const body = (response.headers.get('content-type') || '').includes('text/html') ? (await response.text()).slice(0, 500000) : '';
      const finalProductId = extractProductId(current);
      const destinationType = classifyDestination(current, response.status, body);
      const matchesExpectedProduct = destinationType === 'PRODUCT' && Boolean(expectedProductId) && finalProductId === String(expectedProductId);
      const reason = matchesExpectedProduct
        ? 'PASS_EXACT_PRODUCT_ID'
        : destinationType === 'HOMEPAGE'
          ? 'BROKEN_AFFILIATE_DESTINATION_HOMEPAGE'
          : !expectedProductId
            ? 'EXPECTED_PRODUCT_ID_UNAVAILABLE'
            : destinationType === 'PRODUCT'
              ? `WRONG_PRODUCT_ID_EXPECTED_${expectedProductId}_GOT_${finalProductId}`
              : `BROKEN_AFFILIATE_DESTINATION_${destinationType}`;
      return { checkedAt: new Date().toISOString(), affiliateUrl, expectedProductId: expectedProductId ? String(expectedProductId) : null, finalDestination: current, finalProductId, destinationType, matchesExpectedProduct, pass: matchesExpectedProduct, reason, redirectChain: chain };
    }
    return { checkedAt: new Date().toISOString(), affiliateUrl, expectedProductId: expectedProductId ? String(expectedProductId) : null, finalDestination: current, finalProductId: null, destinationType: 'REDIRECT_LOOP', matchesExpectedProduct: false, pass: false, reason: 'BROKEN_AFFILIATE_DESTINATION_REDIRECT_LOOP', redirectChain: chain };
  } catch (error) {
    return { checkedAt: new Date().toISOString(), affiliateUrl, expectedProductId: expectedProductId ? String(expectedProductId) : null, finalDestination: current, finalProductId: null, destinationType: 'ERROR', matchesExpectedProduct: false, pass: false, reason: `BROKEN_AFFILIATE_DESTINATION_ERROR:${error.name}`, redirectChain: chain };
  }
}

export async function generateAffiliateLink({ productId, appKey, appSecret, trackingId }) {
  const source = canonicalProductUrl(productId);
  const params = {
    app_key: appKey,
    method: 'aliexpress.affiliate.link.generate',
    timestamp: String(Date.now()),
    sign_method: 'sha256',
    format: 'json',
    v: '2.0',
    promotion_link_type: '0',
    source_values: source,
    tracking_id: trackingId,
  };
  const canonical = Object.keys(params).sort().map((name) => name + params[name]).join('');
  const sign = createHmac('sha256', appSecret).update(canonical, 'utf8').digest('hex').toUpperCase();
  const response = await fetch('https://api-sg.aliexpress.com/sync', { method: 'POST', body: new URLSearchParams({ ...params, sign }), signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  const result = data.aliexpress_affiliate_link_generate_response?.resp_result;
  const links = result?.result?.promotion_links?.promotion_link;
  const link = Array.isArray(links) ? links[0]?.promotion_link : null;
  if (!response.ok || Number(result?.resp_code) !== 200 || !link) throw new Error(`AliExpress link generation failed: ${result?.resp_msg || response.status}`);
  return { canonicalProductUrl: source, affiliateUrl: link };
}
