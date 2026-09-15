export const concepts = ['problem-solution','small-flat-find','awkward-space','one-clever-storage-idea','space-aware-find'];
export function creativeCopy(candidate, history = []) {
  const used = new Set(history.slice(0,10));
  const vacuum = /vacuum.*(?:bag|storage)/i.test(candidate.title);
  const sink = /sink/i.test(candidate.title);
  const bin = /(?:desktop|small).*?(?:bin|trash)/i.test(candidate.title);
  const options = vacuum ? ['Bulky bedding taking over?','A small-home storage find','Make room for everyday life'] : sink ? ['A cluttered sink corner?','One clever kitchen find','Small kitchen, useful storage'] : ['One small-home find','A space-aware storage idea','A clever find for compact homes'];
  if(bin)options.splice(0,options.length,'Small desk, little clutter?','A tidy-desk find','One compact desktop find');
  const hook = options.find(h => !used.has(h)) || `Today’s ${candidate.cluster.replaceAll('-',' ')} find`;
  const benefits = vacuum ? ['Vacuum bags for clothes & bedding','Keep bulky items together','Check sizes & the selected option'] : sink ? ['Keep sink essentials together','A practical countertop organiser','Check dimensions before ordering'] : ['Designed for everyday organisation','Check the fit for your space','Confirm the exact option & quantity'];
  if(bin)benefits.splice(0,benefits.length,'A compact desktop bin','Keep small scraps in one place','Check size & the selected colour');
  return {
    concept: concepts[(history.length)%concepts.length], hook, benefits,
    solution: vacuum ? 'Vacuum storage bags' : sink ? 'Sink organisation' : bin ? 'A compact desktop bin' : 'Practical home organisation',
    cta: 'Find it at Clever Finds — link in bio',
    caption: `Ad / affiliate. ${hook}\n\n${vacuum ? 'Vacuum storage bags offer another way to organise bulky clothes and bedding in a small home.' : sink ? 'Bring sink essentials together with a compact organisation option. Check the dimensions and selected variant for your kitchen.' : 'A practical organisation find for compact homes. Check the dimensions and exact option before ordering.'}\n\nSee this find through the link in our bio. Check the current price and UK delivery on the listing.\n\nWe earn a commission from qualifying purchases at no extra cost to you.\n\n${vacuum ? '#HomeOrganisation #WardrobeStorage #SmallSpaceLiving #UKHomes' : sink ? '#SmallKitchen #HomeOrganisation #StorageIdeas #UKHomes' : '#HomeOrganisation #SpaceSaving #SmallSpaceLiving'}`,
    disclosure: 'Ad / affiliate', claimsSource: 'Existing qualified product title; no price, delivery-time, pack-count or unverified performance claims.',
  };
}
