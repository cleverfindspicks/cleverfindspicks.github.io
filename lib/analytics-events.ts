import { sourceAttribution } from './tracking';

declare global { interface Window { gtag?: (...args: unknown[]) => void } }

export function sendAnalyticsEvent(name: string, payload: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.gtag?.('event', name, { ...sourceAttribution(window.location.search), ...payload });
}
