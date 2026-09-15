import {isVisibleRecommendation} from '../app/catalog-visibility.ts';
export function visibleInstagramFinds(records,catalogue){
  return records.filter(r=>r.mediaId&&r.publishedAt&&r.currencyVerified===true&&r.productApproved===true).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).flatMap(record=>{
    const product=catalogue.find(p=>p.slug===record.productSlug&&p.productId===record.productId);
    return product?.affiliateDestinationVerified&&isVisibleRecommendation(product.slug)?[{record,product}]:[];
  }).filter((row,index,rows)=>rows.findIndex(r=>r.product.slug===row.product.slug)===index).slice(0,20);
}
