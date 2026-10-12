import { readFile, writeFile } from 'node:fs/promises';
import { localEnvironment } from './local-env.mjs';

const env = await localEnvironment();
const has = (name) => Boolean(env[name]);
const orderSync=JSON.parse(await readFile(new URL('./.local/aliexpress-order-sync.json',import.meta.url),'utf8').catch(()=>'{}'));
const health = {
  checkedAt: new Date().toISOString(),
  pinterest: has('PINTEREST_ACCESS_TOKEN') ? 'CONNECTED' : 'NOT_CONFIGURED',
  ga4: has('NEXT_PUBLIC_GA_MEASUREMENT_ID') ? 'CONNECTED' : 'NOT_CONFIGURED',
  ga4Reporting: has('GA4_PROPERTY_ID') && has('GOOGLE_APPLICATION_CREDENTIALS') ? 'CONNECTED' : 'NOT_CONFIGURED',
  aliexpressOrders: orderSync.status==='CONNECTED' ? 'CONNECTED' : has('ALIEXPRESS_APP_KEY')&&has('ALIEXPRESS_APP_SECRET')&&has('ALIEXPRESS_TRACKING_ID') ? 'READY' : 'NOT_CONFIGURED',
  websiteOutboundTracking: has('NEXT_PUBLIC_GA_MEASUREMENT_ID') ? 'CONNECTED' : 'NOT_CONFIGURED',
  productionPublishing: 'INDEPENDENT',
};
await writeFile(new URL('./data/analytics-health.json', import.meta.url), JSON.stringify(health, null, 2));
console.log(JSON.stringify({ ok: true, ...health }));
