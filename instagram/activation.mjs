export function activationDecision({publishedCount,approved,force=false,uncertain=false}){
  if(uncertain)return 'RECONCILE_ONLY';
  if(approved)return 'DAILY_ENABLED';
  return publishedCount>0?'TRIAL_REVIEW_REQUIRED':force?'ONE_TRIAL_ALLOWED':'TRIAL_PENDING';
}
