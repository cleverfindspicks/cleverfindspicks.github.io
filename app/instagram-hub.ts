import publications from './instagram-publications.json' with { type: 'json' };
import { products } from './products';
import { visibleCatalogueFinds as selectCatalogueFinds, visibleInstagramFinds as selectHubFinds } from '../instagram/hub-policy.mjs';
export type InstagramPublication = { instagramPublicationId: string; trackingId: string; productId: string; productSlug: string; creativeId: string; publishedAt: string; mediaId: string; permalink?: string | null; hook: string };
export function visibleInstagramFinds(records: InstagramPublication[] = publications, catalogue = products): Array<{record: InstagramPublication; product: (typeof products)[number]}> {
  return selectHubFinds(records,catalogue);
}
export function visibleCatalogueFinds(catalogue = products): Array<(typeof products)[number]> {
  return selectCatalogueFinds(catalogue);
}
