export type TrackingEventName = 'product_view' | 'affiliate_outbound_click';

export function productTrackingId(slug: string) {
  return `cfp-${slug}`;
}

export function sourceAttribution(search = '') {
  const params = new URLSearchParams(search);
  return {
    pin_id: params.get('pin_id'),
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
  };
}

export function trackingPayload(slug: string, pinId?: string | null, cluster?: string) {
  return { product_id: productTrackingId(slug), tracking_id: productTrackingId(slug), product_slug: slug, pin_id: pinId || null, cluster: cluster || 'legacy-catalogue' };
}
