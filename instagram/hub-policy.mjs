import {isVisibleRecommendation} from '../app/catalog-visibility.ts';
import {matchesDiscovery,discoveryEligible} from '../lib/catalog-discovery.ts';
export function visibleInstagramFinds(records,catalogue){
  return records.filter(r=>r.mediaId&&r.publishedAt&&r.currencyVerified===true&&r.productApproved===true&&(!r.publicationStatus||r.publicationStatus==='LIVE')&&!r.deleted&&!r.test).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).flatMap(record=>{
    const product=catalogue.find(p=>p.slug===record.productSlug&&p.productId===record.productId);
    return product&&discoveryEligible(product)&&isVisibleRecommendation(product.slug)?[{record,product}]:[];
  }).filter((row,index,rows)=>rows.findIndex(r=>r.product.slug===row.product.slug)===index).slice(0,20);
}
export function visibleCatalogueFinds(catalogue){
  return catalogue.filter(product=>discoveryEligible(product)&&product.catalogueCurrencyVerified===true&&product.rejected!==true&&product.deleted!==true&&isVisibleRecommendation(product.slug)).sort((a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||'')));
}
export function searchInstagramFinds(rows,query){return rows.filter(({record,product})=>matchesDiscovery(product,{query},[record.caption,record.hook].join(' ')));}
