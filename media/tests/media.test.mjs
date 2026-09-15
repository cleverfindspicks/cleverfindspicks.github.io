/* oxlint-disable typescript/no-floating-promises -- node:test awaits registered tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {validateImageResponse,imageGate,fetchVerifiedImage} from '../image-validation.mjs';
import {prepareProductImage} from '../prepare-product-image.mjs';
import {matchesDiscovery,discoveryMetadata,discoveryEligible} from '../../lib/catalog-discovery.ts';
import {products} from '../../app/products.ts';
const id='1005000000000001',url='https://ae-pic-a1.aliexpress-media.com/kf/source.jpg';
const bytes=await sharp(Buffer.from('<svg width="200" height="200"><rect width="100" height="200" fill="red"/><rect x="100" width="100" height="200" fill="blue"/></svg>')).jpeg().toBuffer();
const image=()=>new Response(bytes,{status:200,headers:{'content-type':'image/jpeg'}});
test('image validation requires real decoded raster, HTTP 200, safe MIME and non-placeholder',async()=>{
 assert.ok((await validateImageResponse(image())).sha256);
 for(const response of [new Response('<html>Error</html>',{headers:{'content-type':'image/jpeg'}}),new Response(bytes,{status:404,headers:{'content-type':'image/jpeg'}}),new Response(bytes,{headers:{'content-type':'text/html'}})])await assert.rejects(()=>validateImageResponse(response));
 const blank=await sharp({create:{width:200,height:200,channels:3,background:'#fff'}}).jpeg().toBuffer();await assert.rejects(()=>validateImageResponse(new Response(blank,{headers:{'content-type':'image/jpeg'}})));
 await assert.rejects(()=>fetchVerifiedImage('https://example.com/placeholder.jpg'));
});
test('exact official image identity creates gate evidence, wrong product/source never qualifies',async()=>{
 const options={fetcher:async()=>image(),officialLookup:async()=>({product_id:id,product_main_image_url:url}),writeCache:false};
 const result=await prepareProductImage({productId:id,image:url},options);assert.equal(imageGate(result),true);
 for(const patch of [{productImageVerified:false},{productId:'wrong'},{image:url+'?different'}])assert.equal(imageGate({...result,...patch}),false);
 assert.equal((await prepareProductImage({productId:id,image:url+'?wrong'},options)).productImageVerified,false);
 assert.equal((await prepareProductImage({productId:id,image:url},{...options,officialLookup:async()=>null})).imageRejectionReason,'SKIPPED_IMAGE_NOT_VERIFIED');
});
test('search is case-insensitive across full title, tags, room, category, problem and captions',()=>{
 const p={slug:'test',name:'Tall rack',shortName:'Narrow shelf',cluster:'tiny-kitchen',primaryCategory:'kitchen',room:'Kitchen',tags:['vertical'],keywords:['cupboard'],problemSolved:'Countertop clutter',renterFriendly:true,noDrill:true,verifiedPriceGbp:20,currencyVerified:true};
 for(const query of ['TALL','narrow','tiny-kitchen','vertical','cupboard','countertop','Kitchen','sponge'])assert.equal(matchesDiscovery(p,{query},'Sponge holder'),true);
 assert.equal(matchesDiscovery(p,{category:'bathroom'}),false);assert.equal(matchesDiscovery(p,{category:'kitchen',room:'Kitchen',noDrill:true,renterFriendly:true,maxPrice:25}),true);assert.equal(matchesDiscovery(p,{maxPrice:10}),false);assert.equal(matchesDiscovery({...p,currencyVerified:false},{maxPrice:25}),false);
});
test('all existing products have categories and verified local media; disabled discoveries never pass',()=>{
 assert.ok(products.length>=21);for(const p of products){assert.ok(discoveryMetadata(p).primaryCategory);assert.equal(p.productImageVerified,true);assert.match(p.displayImage,/^\/products\/verified\//);}
 assert.equal(discoveryEligible({...products[0],affiliateDestinationVerified:false}),false);assert.equal(discoveryEligible({...products[0],ctaDisabled:true}),false);assert.equal(discoveryEligible({...products[0],productImageVerified:false}),false);
});
