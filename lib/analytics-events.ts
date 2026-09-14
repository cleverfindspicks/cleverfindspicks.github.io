import { sourceAttribution } from './tracking';

declare global { interface Window { gtag?: (...args: unknown[]) => void } }

export function sendAnalyticsEvent(name: string, payload: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const attribution = sourceAttribution(window.location.search);
  window.gtag?.('event', name, {
    ...payload,
    ...attribution,
    pin_tracking_id: attribution.pin_tracking_id || payload.pin_tracking_id || null,
    transport_type: 'beacon',
  });
}
