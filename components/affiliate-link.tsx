'use client';

import { useEffect } from 'react';
import { sendAnalyticsEvent } from '@/lib/analytics-events';
import { trackingPayload } from '@/lib/tracking';

export function ProductView({ slug, cluster }: { slug: string; cluster?: string }) {
  useEffect(() => {
    const pinId = new URLSearchParams(window.location.search).get('pin_id');
    sendAnalyticsEvent('product_view', trackingPayload(slug, pinId, cluster));
  }, [slug, cluster]);
  return null;
}

export function AffiliateLink({ href, slug, cluster, children, className = 'buy-link' }: { href: string; slug: string; cluster?: string; children: React.ReactNode; className?: string }) {
  return <a className={className} href={href} target="_blank" rel="sponsored nofollow noopener" onClick={() => {
    const pinId = new URLSearchParams(window.location.search).get('pin_id');
    sendAnalyticsEvent('aliexpress_outbound_click', { ...trackingPayload(slug, pinId, cluster), event_timestamp: new Date().toISOString() });
  }}>{children}</a>;
}
