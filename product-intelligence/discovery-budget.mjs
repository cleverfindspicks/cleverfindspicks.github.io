const uniqueStrings = (values) => [...new Set(values.flat(6).filter((value) => typeof value === 'string' && value.trim()))];

export function selectDiscoveryPlan(searchPlan, state = {}, { queriesPerRun = 2 } = {}) {
  if (!searchPlan.length) return { selected: [], nextState: { cursor: 0, cycle: 0 } };
  const cursor = Math.max(0, Number(state.cursor) || 0) % searchPlan.length;
  const cycle = Math.max(0, Number(state.cycle) || 0);
  const count = Math.min(Math.max(1, queriesPerRun), searchPlan.length);
  const selected = Array.from({ length: count }, (_, offset) => {
    const item = searchPlan[(cursor + offset) % searchPlan.length];
    return { ...item, pages: 1, sortModes: [cycle % 2 === 0 ? 'LAST_VOLUME_DESC' : 'RELEVANCE'] };
  });
  const nextCursor = (cursor + count) % searchPlan.length;
  return { selected, nextState: { cursor: nextCursor, cycle: nextCursor === 0 ? cycle + 1 : cycle, updatedAt: new Date().toISOString() } };
}

export function mergeDiscoveryRows(rows) {
  return [...Map.groupBy(rows.filter((row) => row?.productId), (row) => String(row.productId)).values()].map((matches) => ({
    ...matches[0],
    searchQuery: uniqueStrings(matches.map((row) => [row.searchQuery, row.searchQueries])).at(0) || null,
    searchQueries: uniqueStrings(matches.map((row) => [row.searchQuery, row.searchQueries])).slice(0, 12),
    searchPages: [...new Set(matches.flatMap((row) => [row.searchPage, row.searchPages]).flat().filter(Number.isFinite))],
    searchSortModes: uniqueStrings(matches.map((row) => [row.searchSortMode, row.searchSortModes])),
    matchedClusters: uniqueStrings(matches.map((row) => [row.cluster, row.matchedClusters])),
  }));
}

export function selectDetailCandidates(candidates, { limit = 24 } = {}) {
  const score = (candidate) => {
    const metrics = candidate.metrics || {};
    const price = Number(metrics.priceGbp);
    const commission = Number(metrics.commissionAmountGbp);
    const feedback = Number(metrics.feedbackPct);
    const demand = Number(metrics.recentVolume);
    if (candidate.currencyVerified !== true || !(price > 0)) return -Infinity;
    if (Number.isFinite(feedback) && feedback > 0 && feedback < 95) return -Infinity;
    if (Number.isFinite(commission) && commission > 0 && commission < 0.5) return -Infinity;
    return (Number.isFinite(demand) ? Math.log10(demand + 1) * 10 : 0)
      + (Number.isFinite(feedback) ? feedback / 10 : 5)
      + (Number.isFinite(commission) ? Math.min(commission, 5) * 4 : 2)
      + (Number(candidate.factors?.buyerIntent) || 0) * 5;
  };
  const ranked = candidates.map((candidate) => ({ candidate, score: score(candidate) })).filter((row) => Number.isFinite(row.score)).sort((a, b) => b.score - a.score);
  const chosen = [];
  const perCluster = new Map();
  for (const row of ranked) {
    const cluster = row.candidate.cluster || 'unclassified';
    if ((perCluster.get(cluster) || 0) >= 8) continue;
    chosen.push(row.candidate);
    perCluster.set(cluster, (perCluster.get(cluster) || 0) + 1);
    if (chosen.length >= limit) break;
  }
  return chosen;
}
