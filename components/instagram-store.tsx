'use client';
/* oxlint-disable nextjs/no-img-element, nextjs/no-html-link-for-pages */
import {useState} from 'react';
import {instagramDestination} from '@/lib/tracking';
import {matchesDiscovery,categories,categoryLabel,discoveryMetadata} from '@/lib/catalog-discovery';
import type {Product} from '@/app/products';

type Publication={instagramPublicationId:string;trackingId:string;thumbnail?:string|null;caption?:string;hook?:string};
type Find={record:Publication;product:Product};
type Row={record?:Publication;product:Product};

export function InstagramStore({finds,catalogue}:{finds:Find[];catalogue:Product[]}){
 const [query,setQuery]=useState('');
 const [category,setCategory]=useState('');
 const hasLive=finds.length>0;
 const rows:Row[]=hasLive?finds:catalogue.map(product=>({product}));
 const match=(row:Row,filters:{query?:string;category?:string})=>matchesDiscovery(row.product,filters,row.record?[row.record.caption,row.record.hook].join(' '):'');
 const searchResults=query?rows.filter(row=>match(row,{query})):[];
 const categoryResults=category?rows.filter(row=>match(row,{category})):[];
 const activeCategories=categories.filter(item=>rows.some(row=>match(row,{category:item.id})));
 const destination=(row:Row)=>row.record?instagramDestination('https://cleverfindspicks.github.io',row.product.slug,row.record.trackingId):`/finds/${row.product.slug}/`;
 const card=(row:Row,featured=false)=>{
  const {record,product}=row;
  return <article className={`product-card ${featured?'ig-featured':''} ${record?'':'catalogue-find'}`} key={record?.instagramPublicationId||product.slug}><a className="ig-image" href={destination(row)}><img src={record?.thumbnail||product.displayImage} alt={product.shortName} width="1080" height="1920" loading={featured?'eager':'lazy'} onError={event=>{if(product.displayImage&&event.currentTarget.getAttribute('src')!==product.displayImage)event.currentTarget.src=product.displayImage;}}/></a><div className="product-body"><p className="eyebrow">{categoryLabel(discoveryMetadata(product).primaryCategory)}</p><h3>{product.shortName}</h3><p className="card-benefit">{product.summary}</p><a className="primary-link" href={destination(row)}>{featured?'View this find':'View find'} →</a></div></article>;
 };
 return <>
  {hasLive?<>
   <section className="ig-latest"><h2>Latest Instagram Find</h2>{card(rows[0],true)}</section>
   <section className="ig-more"><h2>Recent Instagram Finds</h2><div className="ig-grid">{rows.slice(1).map(row=>card(row))}</div></section>
  </>:<section className="ig-latest ig-catalogue-fallback"><h1>Latest Clever Finds</h1><p className="ig-status-note">Instagram finds will appear here as they&apos;re published.</p><div className="ig-grid">{rows.map((row,index)=>card(row,index===0))}</div></section>}
  <section className="ig-search"><label htmlFor="ig-search">Search the find you saw...</label><input id="ig-search" type="search" placeholder="Search the find you saw..." value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<><div className="ig-grid">{searchResults.map(row=>card(row))}</div>{!searchResults.length&&<output>No matching find.</output>}</>}</section>
  <section className="ig-categories"><h2>Browse by category</h2><div className="category-chips">{activeCategories.map(item=><button key={item.id} type="button" aria-pressed={category===item.id} onClick={()=>setCategory(category===item.id?'':item.id)}>{item.label}</button>)}</div>{category&&<><div className="ig-grid ig-category-results">{categoryResults.map(row=>card(row))}</div>{!categoryResults.length&&<output>No matching find.</output>}</>}</section>
 </>;
}
