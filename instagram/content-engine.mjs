import { createHash } from 'node:crypto';

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const identity = (product) => `${product?.title || product?.name || ''} ${product?.shortName || ''} ${product?.cluster || ''} ${product?.category || ''}`.toLowerCase();
const unique = (values) => [...new Set(values.filter(Boolean))];
const titleCase = (value) => clean(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
const stableIndex = (product, size) => Number.parseInt(createHash('sha256').update(String(product?.productId || product?.title || '')).digest('hex').slice(0, 8), 16) % size;

const profiles = [
  { match: /under.?sink|sink organiser|sink organizer|sponge|soap dispenser/, category: 'Kitchen Storage', room: 'Kitchen', subject: 'sink space', hooks: ['Sink area always cluttered?', 'Make sink space work', 'Clear the sink corner'], solution: 'Keep sink essentials together', benefits: ['Uses awkward sink-side space', 'Keeps daily essentials within reach'], hashtags: ['KitchenStorage', 'SinkOrganisation', 'SmallKitchenIdeas'], layouts: ['problem-solution', 'space-use-organisation'] },
  { match: /countertop|microwave|spice|kitchen rack|kitchen storage|cutlery|drawer organis/, category: 'Kitchen Storage', room: 'Kitchen', subject: 'kitchen space', hooks: ['No counter space left?', 'Tiny kitchen? Try this', 'Stop wasting kitchen space'], solution: 'Give everyday kitchen items a clear place', benefits: ['Uses space more efficiently', 'Keeps essentials easier to reach'], hashtags: ['KitchenStorage', 'KitchenOrganisation', 'SmallKitchenIdeas'], layouts: ['problem-solution', 'feature-benefit'] },
  { match: /wardrobe|hanger|clothes|cap|hat|shoe|closet/, category: 'Wardrobe Storage', room: 'Wardrobe', subject: 'wardrobe space', hooks: ['Wardrobe running out of room?', 'Make wardrobe space work', 'A smarter wardrobe setup'], solution: 'Organise everyday wardrobe items', benefits: ['Makes better use of hanging space', 'Keeps frequently used items visible'], hashtags: ['WardrobeStorage', 'WardrobeOrganisation', 'SpaceSaving'], layouts: ['space-use-organisation', 'product-spotlight'] },
  { match: /bathroom|toilet|scale|shower/, category: 'Bathroom Storage', room: 'Bathroom', subject: 'bathroom space', hooks: ['Bathroom floor feeling crowded?', 'Use that bathroom wall', 'A tidier bathroom setup'], solution: 'Move essentials into useful storage', benefits: ['Helps free up floor space', 'Keeps daily items easy to reach'], hashtags: ['BathroomStorage', 'BathroomOrganisation', 'SmallBathroomIdeas'], layouts: ['problem-solution', 'feature-benefit'] },
  { match: /over.?door|behind.?door|door hook|wall mount|no.?drill|adhesive/, category: 'Door & Wall Storage', room: 'Home', subject: 'unused wall space', hooks: ['Use that empty door', 'Storage without floor space', 'Put unused wall space to work'], solution: 'Add storage without bulky furniture', benefits: ['Uses an overlooked surface', 'Keeps useful items within reach'], hashtags: ['DoorStorage', 'WallStorage', 'RenterFriendly'], layouts: ['space-use-organisation', 'feature-benefit'] },
  { match: /side.?table|bedside|storage table|small table|corner/, category: 'Small-Space Furniture', room: 'Living Room', subject: 'small corner', hooks: ['That empty corner can work harder', 'Need storage beside the sofa?', 'Make this small corner useful'], solution: 'Add a useful surface and storage', benefits: ['Fits into a compact corner', 'Keeps everyday items close'], hashtags: ['SmallSpaceFurniture', 'SmallLivingRoom', 'HomeStorageIdeas'], layouts: ['product-spotlight', 'space-use-organisation'] },
  { match: /laundry|vacuum bag|bedding|foldable storage/, category: 'Laundry & Storage', room: 'Laundry', subject: 'bulky storage', hooks: ['Bulky items taking over?', 'Make more room for storage', 'Stop wasting cupboard space'], solution: 'Keep bulky items organised', benefits: ['Helps use cupboard space better', 'Keeps stored items together'], hashtags: ['LaundryStorage', 'CupboardOrganisation', 'SpaceSaving'], layouts: ['problem-solution', 'product-spotlight'] },
  { match: /desk|desktop|workspace|office|bin|trash can/, category: 'Desk & Workspace', room: 'Workspace', subject: 'desk space', hooks: ['Desk clutter building up?', 'Keep the desktop clear', 'A small fix for desk clutter'], solution: 'Give small desk items a clear place', benefits: ['Keeps the work surface tidier', 'Designed for compact workspaces'], hashtags: ['DeskOrganisation', 'WorkspaceIdeas', 'SmallSpaceLiving'], layouts: ['problem-solution', 'feature-benefit'] },
  { match: /narrow|slim|gap|rolling cart/, category: 'Narrow-Space Storage', room: 'Home', subject: 'narrow gap', hooks: ['Use that empty gap', 'Turn a narrow gap into storage', 'Do not waste that slim space'], solution: 'Use storage space that usually gets missed', benefits: ['Designed for narrow areas', 'Adds storage without a wide footprint'], hashtags: ['NarrowStorage', 'SpaceSaving', 'SmallHomeIdeas'], layouts: ['space-use-organisation', 'product-spotlight'] },
];

export const forbiddenGenericCopy = [
  'a space-aware storage idea',
  'a practical find for smaller homes',
  'one small-home find',
  'a clever find for compact homes',
  'practical home organisation',
];

export function productContentProfile(product) {
  const text = identity(product);
  const profile = profiles.find((entry) => entry.match.test(text));
  if (profile) return profile;
  const title = clean(product?.shortName || product?.title || product?.name || 'Storage organiser').split(/[,|–—-]/)[0].split(/\s+/).slice(0, 5).join(' ');
  return {
    category: titleCase(product?.category || product?.cluster?.replaceAll('-', ' ') || 'Home Organisation'),
    room: clean(product?.room || 'Home'),
    subject: title.toLowerCase(),
    hooks: [`Need a better place for ${title.toLowerCase()}?`, `${title} in less space`, `Make room for ${title.toLowerCase()}`],
    solution: `Organise ${title.toLowerCase()} more clearly`,
    benefits: ['Keeps related items together', 'Designed for more organised storage'],
    hashtags: ['HomeOrganisation', 'StorageIdeas', 'SmallSpaceLiving'],
    layouts: ['product-spotlight', 'feature-benefit'],
  };
}

export function generateInstagramHashtags(product) {
  const profile = productContentProfile(product);
  const text = identity(product);
  const tags = [
    ...profile.hashtags,
    'HomeOrganisation',
    'SmallSpaceLiving',
    text.match(/renter|removable|adhesive|no.?drill/) ? 'RenterFriendly' : null,
    text.match(/no.?drill/) ? 'NoDrillStorage' : null,
    profile.room !== 'Home' ? `${profile.room.replace(/[^a-z0-9]/gi, '')}Ideas` : 'UKHomes',
  ];
  return unique(tags).slice(0, 9).map((tag) => `#${tag.replace(/^#/, '')}`);
}

export function generateInstagramCreativePlan(product, recent = {}) {
  const profile = productContentProfile(product);
  const recentHooks = Array.isArray(recent) ? recent : Array.isArray(recent.hooks) ? recent.hooks : [];
  const usedHooks = new Set(recentHooks.map((value) => clean(value).toLowerCase()));
  const hookStart = stableIndex(product, profile.hooks.length);
  const orderedHooks = profile.hooks.map((_, index) => profile.hooks[(hookStart + index) % profile.hooks.length]);
  const hook = orderedHooks.find((value) => !usedHooks.has(value.toLowerCase())) || orderedHooks[0];
  const latestLayout = (Array.isArray(recent.layouts) ? recent.layouts : [])[0];
  const layoutFamily = profile.layouts.find((value) => value !== latestLayout) || profile.layouts[stableIndex(product, profile.layouts.length)];
  const benefits = profile.benefits.slice(0, 2);
  const hashtags = generateInstagramHashtags(product);
  const reminder = /\b(?:pcs?|pack|set|size|adjustable|expandable|variant|colour|color)\b/i.test(identity(product))
    ? 'Check the selected size, quantity and option before ordering.'
    : 'Check the dimensions and selected option before ordering.';
  const caption = [
    'Ad / affiliate.',
    '',
    hook,
    `${profile.solution}. ${benefits.join('. ')}.`,
    reminder,
    '',
    'See today’s find via the link in our bio.',
    '',
    hashtags.join(' '),
  ].join('\n');
  return {
    hook,
    coverHook: hook.split(/\s+/).slice(0, 6).join(' '),
    solution: profile.solution,
    benefits,
    cta: 'See today’s find — link in bio',
    layoutFamily,
    category: profile.category,
    room: profile.room,
    cluster: product?.cluster || null,
    hashtags,
    keywords: unique([profile.subject, profile.category.toLowerCase(), profile.room.toLowerCase(), 'small-space organisation']),
    caption,
    claimsSource: 'Verified product title, category and selected variant evidence; no price, delivery, performance or before/after claims.',
  };
}
