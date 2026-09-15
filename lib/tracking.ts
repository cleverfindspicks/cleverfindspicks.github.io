export type TrackingIdentity = {
  productId: string;
  productSlug: string;
  cluster: string;
  pinTrackingId: string;
  publicationId: string;
  automationRunId?: string | null;
  searchQuery?: string | null;
};

export const attributionStorageKey = 'cf_attribution_v1';

export function readAttribution(search = '', stored: string | null = null) {
  const params = new URLSearchParams(search);
  let previous: Record<string, string | null> = {};
  try { previous = stored ? JSON.parse(stored) : {}; } catch { previous = {}; }
  const currentPin = params.get('cf_pin') || params.get('pin_id');
  const currentSource = params.get('utm_source');
  const changedSource = Boolean(currentSource && currentSource !== previous.utm_source);
  const currentInstagram = params.get('cf_ig');
  const result = {
    utm_source: params.get('utm_source') || previous.utm_source || null,
    utm_medium: params.get('utm_medium') || previous.utm_medium || null,
    utm_campaign: params.get('utm_campaign') || previous.utm_campaign || null,
    pin_tracking_id: currentSource === 'instagram' ? null : currentPin || (!changedSource && (previous.cf_pin || previous.pin_tracking_id)) || null,
    ...(currentInstagram || (!changedSource && previous.cf_ig) || currentSource === 'instagram' ? { instagram_tracking_id: currentInstagram || (!changedSource && previous.cf_ig) || null } : {}),
  };
  return result;
}

export function captureAttribution(search = '', storage?: Pick<Storage, 'getItem' | 'setItem'> | null) {
  const stored = storage?.getItem(attributionStorageKey) || null;
  const attribution = readAttribution(search, stored);
  if (storage && (attribution.utm_source || attribution.pin_tracking_id)) {
    storage.setItem(attributionStorageKey, JSON.stringify({
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      cf_pin: attribution.pin_tracking_id,
      cf_ig: 'instagram_tracking_id' in attribution ? attribution.instagram_tracking_id : null,
    }));
  }
  return attribution;
}

export function instagramDestination(origin: string, slug: string, trackingId: string) {
  const url = new URL(`/finds/${slug}/`, origin);
  url.searchParams.set('utm_source', 'instagram');
  url.searchParams.set('utm_medium', 'organic');
  url.searchParams.set('utm_campaign', 'clever_finds');
  url.searchParams.set('cf_ig', trackingId);
  return url.toString();
}

export const sourceAttribution = (search = '') => typeof window === 'undefined'
  ? readAttribution(search)
  : captureAttribution(search, window.sessionStorage);

export function trackingPayload(identity: TrackingIdentity) {
  return {
    product_id: identity.productId,
    product_slug: identity.productSlug,
    cluster: identity.cluster,
    pin_tracking_id: identity.pinTrackingId,
    publication_id: identity.publicationId,
    automation_run_id: identity.automationRunId || null,
    search_query: identity.searchQuery || null,
  };
}

export function pinterestDestination(origin: string, slug: string, pinTrackingId: string) {
  const url = new URL(`/finds/${slug}`, origin);
  url.searchParams.set('utm_source', 'pinterest');
  url.searchParams.set('utm_medium', 'organic');
  url.searchParams.set('utm_campaign', 'clever_finds');
  url.searchParams.set('cf_pin', pinTrackingId);
  return url.toString();
}
