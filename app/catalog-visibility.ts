export const hiddenLegacyRecommendationSlugs = [
  'expandable-microwave-oven-storage-rack',
  'wardrobe-clothes-organiser',
  'twelve-piece-vacuum-storage-bag-set',
  'non-slip-slim-clothes-hangers-set',
  'adjustable-cutlery-drawer-organiser',
  'five-shelf-over-door-organiser',
  'adjustable-double-layer-shoe-slots',
] as const;

const hiddenLegacyRecommendationSet = new Set<string>(hiddenLegacyRecommendationSlugs);

export function isVisibleRecommendation(slug: string) {
  return !hiddenLegacyRecommendationSet.has(slug);
}
