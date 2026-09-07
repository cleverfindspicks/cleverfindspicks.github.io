export type Product = {
  slug: string;
  eyebrow: string;
  name: string;
  shortName: string;
  summary: string;
  price: string;
  positiveFeedback: string;
  recentVolume: string;
  image: string;
  affiliateUrl: string;
  bestFor: string[];
  checks: string[];
};

export const checkedAt = '7 September 2026';

export const products: Product[] = [
  {
    slug: 'pull-out-under-sink-organiser',
    eyebrow: 'KITCHEN & BATHROOM',
    name: '2-tier pull-out under-sink organiser',
    shortName: 'Pull-out under-sink organiser',
    summary: 'A sliding two-level rack that turns an awkward cupboard into storage you can actually reach.',
    price: '£41.99',
    positiveFeedback: '98%',
    recentVolume: '2,265',
    image: 'https://ae-pic-a1.aliexpress-media.com/kf/S07aed87e6ff54942b4692194a323b151F.jpg',
    affiliateUrl: 'https://s.click.aliexpress.com/e/_c3jFcknT',
    bestFor: ['Narrow kitchen cupboards', 'Cleaning-product storage', 'Renters who want a removable setup'],
    checks: ['Measure around your pipework before ordering.', 'Check the selected size and delivery estimate at checkout.', 'Compare the delivered price, not the headline item price.'],
  },
  {
    slug: 'wardrobe-clothes-organiser',
    eyebrow: 'WARDROBE',
    name: 'Foldable wardrobe clothes organiser',
    shortName: 'Wardrobe clothes organiser',
    summary: 'A lightweight divider for keeping jeans, jumpers and T-shirts visible instead of stacked into one pile.',
    price: '£1.65',
    positiveFeedback: '98%',
    recentVolume: '15,485',
    image: 'https://ae-pic-a1.aliexpress-media.com/kf/S0e6fcd4bb0a4440aaa1239968ba80416U.jpg',
    affiliateUrl: 'https://s.click.aliexpress.com/e/_c4pY9FdF',
    bestFor: ['Small wardrobes', 'Separating everyday clothes', 'Low-cost organisation experiments'],
    checks: ['The displayed price may apply to one size or quantity.', 'Measure your shelf or drawer first.', 'Check material and buyer photos before choosing a variant.'],
  },
];

export function getProduct(slug: string) {
  return products.find((product) => product.slug === slug);
}
