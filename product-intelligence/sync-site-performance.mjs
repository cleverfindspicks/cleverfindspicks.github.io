import { localEnvironment } from './local-env.mjs';
const env = await localEnvironment();
const configured = Boolean(env.GA4_PROPERTY_ID && env.GOOGLE_APPLICATION_CREDENTIALS);
console.log(JSON.stringify({
  ok: true,
  status: configured ? 'READY_FOR_DATA_API_CLIENT' : 'NOT_CONFIGURED',
  note: configured
    ? 'Use the GA4 Data API runReport adapter after granting the service account Viewer access to the property.'
    : 'Frontend events remain active when NEXT_PUBLIC_GA_MEASUREMENT_ID is set; local reporting can use performance:import:site meanwhile.',
}));
