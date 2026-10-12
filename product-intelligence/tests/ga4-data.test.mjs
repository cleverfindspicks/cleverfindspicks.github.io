import test from 'node:test';
import assert from 'node:assert/strict';
import {attributionFromPath,ga4Rows,productSlugFromPath,runGa4ProductReport} from '../ga4-data.mjs';

test('GA4 product paths resolve without relying on custom dimensions',()=>{
  assert.equal(productSlugFromPath('/finds/drawer-organiser/?utm_source=pinterest&cf_pin=pin-1'),'drawer-organiser');
  assert.equal(productSlugFromPath('/category/kitchen/'),null);
  assert.deepEqual(attributionFromPath('/finds/drawer/?cf_pin=pin-1'),{pinTrackingId:'pin-1',instagramTrackingId:null});
});

test('GA4 report rows retain event, path and numeric metrics',()=>{
  const rows=ga4Rows({dimensionHeaders:[{name:'date'},{name:'eventName'},{name:'pagePathPlusQueryString'}],metricHeaders:[{name:'eventCount'},{name:'sessions'}],rows:[{dimensionValues:[{value:'20261012'},{value:'product_view'},{value:'/finds/drawer/'}],metricValues:[{value:'4'},{value:'3'}]}]});
  assert.deepEqual(rows,[{date:'20261012',eventName:'product_view',pagePathPlusQueryString:'/finds/drawer/',eventCount:4,sessions:3}]);
});

test('GA4 report request is constrained to conversion-funnel events',async()=>{
  let body;
  const report=await runGa4ProductReport({propertyId:'12345',accessToken:'token',request:async(_url,options)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({rows:[]}),{status:200,headers:{'content-type':'application/json'}});}});
  assert.deepEqual(report,{rows:[]});
  assert.deepEqual(body.dimensionFilter.filter.inListFilter.values,['product_view','aliexpress_outbound_click']);
});
