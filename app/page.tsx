/* oxlint-disable nextjs/no-img-element, nextjs/no-html-link-for-pages */
import {products} from './products';
import {isVisibleRecommendation} from './catalog-visibility';
import {discoveryEligible} from '../lib/catalog-discovery';
import {ProductDiscovery} from '@/components/product-discovery';
export default function Home(){
 const visible=products.filter(p=>isVisibleRecommendation(p.slug)&&discoveryEligible(p)).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
 return <main className="site-shell"><div className="brand-rule"/><header className="site-header"><a className="brand-lockup" href="/"><img src="/clever-finds.png" alt="" width="42" height="42"/><span>Clever Finds</span></a><nav aria-label="Main navigation"><a href="#categories">Categories</a><a href="/instagram/">Instagram finds</a><a href="/affiliate-disclosure">How we choose</a></nav></header><section className="discovery-intro"><p className="eyebrow">SMALL-SPACE EDIT</p><h1>Useful finds.<br/><em>Less searching.</em></h1><p className="lead">Find practical home organisation ideas by room, problem or category.</p><p className="affiliate-note">Ad / affiliate. We may earn a commission at no extra cost to you.</p></section><ProductDiscovery products={visible}/><footer><div><span className="brand-name">Clever Finds</span><p>Independent product discovery for better-organised homes.</p></div><div className="footer-links"><a href="/affiliate-disclosure">Affiliate disclosure</a><a href="mailto:cleverfindspicks@gmail.com">Contact</a></div></footer></main>;
}
