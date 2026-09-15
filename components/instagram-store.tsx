'use client';
/* oxlint-disable nextjs/no-img-element, nextjs/no-html-link-for-pages */
import {useState} from 'react';
import {instagramDestination} from '@/lib/tracking';
import {searchInstagramFinds} from '../instagram/hub-policy.mjs';
type Find={record:{instagramPublicationId:string;trackingId:string;thumbnail?:string|null;caption?:string;hook?:string};product:{slug:string;shortName:string;summary:string;image:string;cluster?:string;bestFor?:string[]}};
export function InstagramStore({finds}:{finds:Find[]}){
 const [query,setQuery]=useState('');const visible=searchInstagramFinds(finds,query) as Find[];const latest=finds[0];
 const card=({record,product}:Find,featured=false)=><article className={`product-card ${featured?'ig-featured':''}`} key={record.instagramPublicationId}><a className="ig-image" href={instagramDestination('https://cleverfindspicks.github.io',product.slug,record.trackingId)}><img src={record.thumbnail||product.image} alt={product.shortName} width="1080" height="1920" loading={featured?'eager':'lazy'}/></a><div className="product-body"><h3>{product.shortName}</h3><p>{product.summary}</p><a className="primary-link" href={instagramDestination('https://cleverfindspicks.github.io',product.slug,record.trackingId)}>{featured?'View this find':'View find'} →</a></div></article>;
 return <><section className="ig-latest"><h2>Latest Instagram Find</h2>{latest?card(latest,true):<p>No live Instagram finds yet. Test or deleted Reels do not appear here.</p>}</section><section className="ig-more"><h2>More Instagram Finds</h2><label htmlFor="ig-search">Search the find you saw...</label><input id="ig-search" type="search" placeholder="Search the find you saw..." value={query} onChange={e=>setQuery(e.target.value)}/><div className="ig-grid">{(query?visible:finds.slice(1)).map(row=>card(row))}</div>{query&&!visible.length&&<output>No matching Instagram find.</output>}</section></>;
}
