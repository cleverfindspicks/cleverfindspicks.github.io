/* oxlint-disable nextjs/no-html-link-for-pages, nextjs/no-img-element */
import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {products} from '../../products';
import {categories,categoryLabel,discoveryEligible,matchesDiscovery} from '../../../lib/catalog-discovery';
import {isVisibleRecommendation} from '../../catalog-visibility';
import {ProductDiscovery} from '@/components/product-discovery';
export function generateStaticParams(){return categories.map(c=>({category:c.id}));}
export async function generateMetadata({params}:{params:Promise<{category:string}>}):Promise<Metadata>{const {category}=await params;return {title:`${categoryLabel(category)} finds`,description:`Browse useful ${categoryLabel(category).toLowerCase()} finds for smaller homes.`,alternates:{canonical:`/category/${category}/`}};}
export default async function CategoryPage({params}:{params:Promise<{category:string}>}){
 const {category}=await params;if(!categories.some(c=>c.id===category))notFound();
 const visible=products.filter(p=>discoveryEligible(p)&&isVisibleRecommendation(p.slug)&&matchesDiscovery(p,{category})).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
 return <main className="site-shell"><header className="site-header"><a className="brand-lockup" href="/"><img src="/clever-finds.png" width="42" height="42" alt=""/><span>Clever Finds</span></a><a href="/">← All finds</a></header><nav className="category-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span>{categoryLabel(category)}</span></nav><section className="discovery-intro"><h1>{categoryLabel(category)}</h1><p>Practical finds for better-organised small homes. Ad / affiliate.</p></section><ProductDiscovery products={visible} initialCategory={category}/><footer><a href="/affiliate-disclosure">Affiliate disclosure</a></footer></main>;
}
