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
    cta: 'See today’s find — link in bio',
    caption: `Ad / affiliate.\n\n${hook} ${sink ? 'Keep everyday sink essentials together. Check dimensions and the selected option for your kitchen.' : vacuum ? 'Organise clothes and bedding with vacuum storage bags. Check the selected sizes and quantity.' : 'A practical home organisation find. Check the exact option and fit for your space.'}\n\nSee today’s find via the link in bio.\n\nWe may earn a commission from qualifying purchases at no extra cost to you.\n\n${sink ? '#SmallKitchen #HomeOrganisation #UKHomes' : '#HomeOrganisation #SmallSpaceLiving #UKHomes'}`,
    disclosure: 'Ad / affiliate', claimsSource: 'Existing qualified product title; no price, delivery-time, pack-count or unverified performance claims.',
  };
}
