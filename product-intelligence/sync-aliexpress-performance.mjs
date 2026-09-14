import { localEnvironment } from './local-env.mjs';
const env = await localEnvironment();
console.log(JSON.stringify({ ok: true, status: env.ALIEXPRESS_ORDERS_API_ENABLED ? 'CONNECTED' : 'IMPORT_ONLY', note: 'No order-report endpoint was assumed from product Affiliate API credentials. Official Affiliate report CSV/JSON import is available.' }));
