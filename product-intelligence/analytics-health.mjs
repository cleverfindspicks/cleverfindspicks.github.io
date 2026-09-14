import { writeFile } from 'node:fs/promises';
import { localEnvironment } from './local-env.mjs';

const env = await localEnvironment();
const has = (name) => Boolean(env[name]);
const health = {
  checkedAt: new Date().toISOString(),
  pinterest: has('PINTEREST_ACCESS_TOKEN') ? 'CONNECTED' : 'NOT_CONFIGURED',
  ga4: has('NEXT_PUBLIC_GA_MEASUREMENT_ID') ? 'CONNECTED' : 'NOT_CONFIGURED',
  ga4Reporting: has('GA4_PROPERTY_ID') && has('GOOGLE_APPLICATION_CREDENTIALS') ? 'CONNECTED' : 'NOT_CONFIGURED',
  aliexpressOrders: has('ALIEXPRESS_ORDERS_API_ENABLED') ? 'CONNECTED' : 'IMPORT_ONLY',
  websiteOutboundTracking: 'ACTIVE',
  productionPublishing: 'INDEPENDENT',
};
await writeFile(new URL('./data/analytics-health.json', import.meta.url), JSON.stringify(health, null, 2));
console.log(JSON.stringify({ ok: true, ...health }));
