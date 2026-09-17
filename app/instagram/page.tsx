/* oxlint-disable nextjs/no-html-link-for-pages, nextjs/no-img-element */
import type { Metadata } from 'next';
import { visibleCatalogueFinds, visibleInstagramFinds } from '../instagram-hub';
import { InstagramHubAttribution } from '@/components/instagram-attribution';
import './style.css';
import {InstagramStore} from '@/components/instagram-store';
export const metadata: Metadata = {title:'Clever Finds on Instagram',description:'Verified small-space organisation finds, including products featured on Clever Finds Instagram.',alternates:{canonical:'/instagram/'}};
export default function InstagramHub(){
  const finds=visibleInstagramFinds();
  const catalogue=finds.length?[]:visibleCatalogueFinds();
  return <main className="site-shell ig-hub"><InstagramHubAttribution/><header className="site-header"><a className="brand-lockup" href="/"><img src="/clever-finds.png" width="42" height="42" alt=""/><span>Clever Finds</span></a></header><p className="affiliate-note">Ad / affiliate. We may earn a commission at no extra cost to you.</p><InstagramStore finds={finds} catalogue={catalogue}/><footer><a href="/affiliate-disclosure">Affiliate disclosure</a></footer></main>;
}
