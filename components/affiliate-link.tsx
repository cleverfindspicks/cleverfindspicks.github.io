'use client';

import { useEffect, useRef } from 'react';
import { sendAnalyticsEvent } from '@/lib/analytics-events';
import { captureAttribution, trackingPayload, type TrackingIdentity } from '@/lib/tracking';

export function ProductView({ identity }: { identity: TrackingIdentity }) {
  useEffect(() => {
    captureAttribution(window.location.search, window.sessionStorage);
    sendAnalyticsEvent('product_view', { ...trackingPayload(identity), event_timestamp: new Date().toISOString() });
  }, [identity]);
  return null;
}

export function AffiliateLink({ href, identity, children, className = 'buy-link' }: { href: string; identity: TrackingIdentity; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const visibleSent = useRef(false);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !visibleSent.current) {
        visibleSent.current = true;
        sendAnalyticsEvent('affiliate_cta_visible', trackingPayload(identity));
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [identity]);
  return <a ref={ref} className={className} href={href} target="_blank" rel="sponsored nofollow noopener" onClick={() => {
    const payload = { ...trackingPayload(identity), event_timestamp: new Date().toISOString() };
    sendAnalyticsEvent('affiliate_cta_click', payload);
    sendAnalyticsEvent('aliexpress_outbound_click', payload);
  }}>{children}</a>;
}
