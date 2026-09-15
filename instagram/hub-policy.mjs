import {isVisibleRecommendation} from '../app/catalog-visibility.ts';
export function visibleInstagramFinds(records,catalogue){
  return records.filter(r=>r.mediaId&&r.publishedAt&&r.currencyVerified===true&&r.productApproved===true&&(!r.publicationStatus||r.publicationStatus==='LIVE')&&!r.deleted&&!r.test).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).flatMap(record=>{
    const product=catalogue.find(p=>p.slug===record.productSlug&&p.productId===record.productId);
    return product?.affiliateDestinationVerified&&product.ctaDisabled!==true&&isVisibleRecommendation(product.slug)?[{record,product}]:[];
  }).filter((row,index,rows)=>rows.findIndex(r=>r.product.slug===row.product.slug)===index).slice(0,20);
}
export function searchInstagramFinds(rows,query){const words=String(query||'').toLowerCase().trim().split(/\s+/).filter(Boolean);return rows.filter(({record,product})=>{const text=[product.shortName,product.summary,product.cluster,product.eyebrow,...(product.bestFor||[]),...(product.keywords||[]),record.caption,record.hook].join(' ').toLowerCase();return words.every(word=>text.includes(word));});}
