const stopWords = new Set(['a', 'an', 'and', 'for', 'home', 'with', 'the', 'of', 'to', 'organiser', 'organizer', 'storage']);

function tokens(value) {
  return new Set(String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((token) => token && !stopWords.has(token)));
}

export function titleSimilarity(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return Number((intersection / union).toFixed(3));
}

export function maximumSimilarity(title, publishedProducts) {
  return publishedProducts.reduce((maximum, product) => Math.max(maximum, titleSimilarity(title, `${product.name || ''} ${product.shortName || ''}`)), 0);
}
