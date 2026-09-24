import { generateInstagramCreativePlan } from './content-engine.mjs';

export const concepts = ['problem-solution', 'product-spotlight', 'space-use-organisation', 'feature-benefit'];

export function creativeCopy(candidate, history = []) {
  const recent = Array.isArray(history) ? { hooks: history } : history;
  const plan = generateInstagramCreativePlan(candidate, recent);
  return {
    concept: plan.layoutFamily,
    hook: plan.hook,
    benefits: plan.benefits,
    solution: plan.solution,
    cta: plan.cta,
    caption: plan.caption,
    disclosure: 'Ad / affiliate',
    claimsSource: plan.claimsSource,
    hashtags: plan.hashtags,
    hashtagValidation: plan.hashtagValidation,
    keywords: plan.keywords,
    category: plan.category,
    cluster: plan.cluster,
    room: plan.room,
    coverHook: plan.coverHook,
  };
}

export { generateInstagramHashtags } from './content-engine.mjs';
