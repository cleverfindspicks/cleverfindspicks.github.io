export const categories=[{id:'kitchen',label:'Kitchen'},{id:'bathroom',label:'Bathroom'},{id:'wardrobe',label:'Wardrobe'},{id:'bedroom',label:'Bedroom'},{id:'laundry',label:'Laundry'},{id:'under-sink',label:'Under-sink'},{id:'door-wall-storage',label:'Door & wall storage'},{id:'small-space-furniture',label:'Small-space furniture'},{id:'renter-friendly-no-drill',label:'Renter-friendly / No-drill'},{id:'desk-workspace',label:'Desk & workspace'},{id:'home-organisation',label:'Home organisation'}];
const explicit:Record<string,string[]>={
 'pull-out-under-sink-organiser':['under-sink','kitchen','bathroom'],
 'wardrobe-clothes-organiser':['wardrobe','bedroom'],
 'expandable-spice-drawer-organiser':['kitchen'],
 'folding-wall-hanging-laundry-basket':['laundry','bathroom'],
 'non-slip-slim-clothes-hangers-set':['wardrobe','bedroom'],
 'adjustable-cutlery-drawer-organiser':['kitchen'],
 'adjustable-double-layer-shoe-slots':['wardrobe'],
 'five-shelf-over-door-organiser':['door-wall-storage','bedroom'],
 'five-tier-plastic-shelving-unit':['small-space-furniture'],
 'twelve-piece-vacuum-storage-bag-set':['wardrobe','bedroom'],
 'no-drill-bathroom-scale-storage-rack':['bathroom','renter-friendly-no-drill'],
 'over-cabinet-door-multipurpose-hooks':['door-wall-storage','kitchen','renter-friendly-no-drill'],
 'expandable-microwave-oven-storage-rack':['kitchen'],
 'wooden-cap-accessories-organiser-hanger':['wardrobe','door-wall-storage'],
 'two-tier-storage-side-table':['small-space-furniture','bedroom'],
 'magnetic-aerosol-can-holder-spray-can-rack-wall-mount-tool-free-inst':['door-wall-storage','desk-workspace','renter-friendly-no-drill'],
 '3-in-1-kitchen-stainless-steel-tableware-soap-dispenser-sponge-hold':['kitchen'],
 'mini-desktop-bin-small-trash-can-tube-with-cover-bedroom-trash-can-g':['desk-workspace','bedroom'],
 'waterproof-bathroom-wall-mounted-mobile-phone-box-protective-cover-t':['bathroom','door-wall-storage'],
 'large-capacity-vacuum-storage-bags-for-clothes-bedding-space-saving':['wardrobe','bedroom'],
 'kitchen-countertop-storage-rack':['kitchen'],
};
export type DiscoveryProduct={slug:string;name?:string;shortName?:string;summary?:string;cluster?:string;eyebrow?:string;bestFor?:string[];tags?:string[];keywords?:string[];primaryCategory?:string;secondaryCategories?:string[];room?:string;renterFriendly?:boolean;noDrill?:boolean;smallSpace?:boolean;problemSolved?:string;verifiedPriceGbp?:number|null;currencyVerified?:boolean;displayImage?:string;productImageVerified?:boolean;affiliateDestinationVerified?:boolean;ctaDisabled?:boolean};
export function categoryLabel(id:string){return categories.find(c=>c.id===id)?.label||'Home organisation';}
export function discoveryMetadata(p:DiscoveryProduct){
 const text=[p.name,p.shortName,p.slug].join(' ').toLowerCase();
 const inferred=/sink|kitchen|cutlery|spice|microwave/.test(text)?['kitchen']:/bathroom|shower/.test(text)?['bathroom']:/vacuum|wardrobe|clothes|shoe|cap.*organis/.test(text)?['wardrobe']:/laundry|hamper/.test(text)?['laundry']:/desktop|desk|workspace/.test(text)?['desk-workspace']:/table|shelv|furniture/.test(text)?['small-space-furniture']:['home-organisation'];
 const ids=explicit[p.slug]||inferred;const primaryCategory=p.primaryCategory||ids[0];
 const secondaryCategories=p.secondaryCategories||ids.slice(1);const noDrill=p.noDrill===true||/no[- ]drill|over-cabinet-door|magnetic-aerosol/.test(text);
 const renterFriendly=p.renterFriendly===true||noDrill;
 const room=p.room||(['kitchen','under-sink'].includes(primaryCategory)?'Kitchen':primaryCategory==='bathroom'?'Bathroom':primaryCategory==='laundry'?'Laundry':primaryCategory==='desk-workspace'?'Workspace':['wardrobe','bedroom'].includes(primaryCategory)?'Bedroom':primaryCategory==='small-space-furniture'?'Living room':'Multiple rooms');
 return {primaryCategory,secondaryCategories,room,noDrill,renterFriendly,smallSpace:p.smallSpace!==false,problemSolved:p.problemSolved||p.summary||'',tags:p.tags||[],keywords:p.keywords||[]};
}
export function productSearchText(p:DiscoveryProduct,caption=''){
 const m=discoveryMetadata(p);return [p.name,p.shortName,p.cluster,p.eyebrow,p.summary,m.problemSolved,m.room,categoryLabel(m.primaryCategory),...m.secondaryCategories.map(categoryLabel),...m.tags,...m.keywords,...(p.bestFor||[]),caption].join(' ').toLowerCase();
}
export type DiscoveryFilters={query?:string;category?:string;room?:string;renterFriendly?:boolean;noDrill?:boolean;smallSpace?:boolean;maxPrice?:number|null};
export function matchesDiscovery(p:DiscoveryProduct,filters:DiscoveryFilters={},caption=''){
 const m=discoveryMetadata(p);const words=(filters.query||'').trim().toLowerCase().split(/\s+/).filter(Boolean);const text=productSearchText(p,caption);
 return words.every(w=>text.includes(w))&&(!filters.category||[m.primaryCategory,...m.secondaryCategories].includes(filters.category))&&(!filters.room||m.room===filters.room)&&(!filters.renterFriendly||m.renterFriendly)&&(!filters.noDrill||m.noDrill)&&(!filters.smallSpace||m.smallSpace)&&(!filters.maxPrice||(p.currencyVerified===true&&typeof p.verifiedPriceGbp==='number'&&p.verifiedPriceGbp<=filters.maxPrice));
}
export function discoveryEligible(p:DiscoveryProduct){return p.affiliateDestinationVerified===true&&p.ctaDisabled!==true&&p.productImageVerified===true&&!!p.displayImage;}
