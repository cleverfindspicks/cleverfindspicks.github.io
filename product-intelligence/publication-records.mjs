export function affiliateAuditRecord(bundle) {
  const candidate = bundle?.candidate || {};
  const destination = candidate.affiliateDestination || {};
  if (!destination.pass || !destination.matchesExpectedProduct) {
    throw new Error('Cannot record an unverified affiliate destination.');
  }

  return {
    slug: bundle.landingPage.slug,
    productId: String(candidate.productId),
    canonicalProductUrl: candidate.canonicalProductUrl,
    originalAffiliateUrl: candidate.affiliateUrl,
    affiliateUrl: candidate.affiliateUrl,
    finalResolvedDestination: destination.finalDestination,
    destinationProductId: destination.finalProductId,
    destinationType: destination.destinationType,
    validationTimestamp: destination.checkedAt,
    affiliateDestinationVerified: true,
    status: 'PASS',
    reason: destination.reason,
    action: 'NONE_REQUIRED',
  };
}

export function upsertAffiliateAudit(runtime, record) {
  const records = (runtime.records || []).filter((item) => item.slug !== record.slug);
  records.push(record);
  return {
    ...runtime,
    schemaVersion: runtime.schemaVersion || 1,
    updatedAt: record.validationTimestamp || new Date().toISOString(),
    records,
  };
}
