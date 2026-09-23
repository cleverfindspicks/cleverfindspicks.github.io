import {readFile,rename,writeFile} from 'node:fs/promises';
import {scoreCandidate} from '../product-intelligence/scoring.mjs';
import {buildContentCandidate} from '../product-intelligence/content.mjs';
import {resolveAffiliateDestination} from '../product-intelligence/affiliate-destination.mjs';
import {instagramSuitability} from './suitability.mjs';
import {canAutoPromote} from './catalogue-promotion.mjs';
import {recordProductMedia} from '../media/prepare-product-image.mjs';
import {affiliateAuditRecord,upsertAffiliateAudit} from '../product-intelligence/publication-records.mjs';

const productId=String(process.argv[2]||'');
if(!/^\d{8,}$/.test(productId))throw new Error('PRODUCT_ID_REQUIRED');
const poolUrl=new URL('../product-intelligence/data/candidate-pool.json',import.meta.url);
const pool=JSON.parse(await readFile(poolUrl,'utf8'));
const index=pool.candidates.findIndex(row=>String(row.productId)===productId);
if(index<0)throw new Error('CANDIDATE_NOT_FOUND');
let candidate=scoreCandidate(pool.candidates[index],{stage:'qualification'});
const destination=await resolveAffiliateDestination(candidate.affiliateUrl,productId);
if(!destination.pass)throw new Error(`AFFILIATE_DESTINATION_${destination.reason}`);
candidate={...candidate,affiliateDestinationVerified:true,affiliateDestination:destination,canonicalProductUrl:`https://www.aliexpress.com/item/${productId}.html`};
const suitability=instagramSuitability(candidate,{recentProductIds:[]});
if(!canAutoPromote(candidate,suitability))throw new Error('AUTO_PROMOTION_GATE_FAILED');
pool.candidates[index]=candidate;
const poolTemp=new URL(`../product-intelligence/data/candidate-pool.${process.pid}.tmp`,import.meta.url);
await writeFile(poolTemp,JSON.stringify(pool,null,2));await rename(poolTemp,poolUrl);
const {landingPage}=buildContentCandidate(candidate);
const productsUrl=new URL('../app/generated-products.json',import.meta.url);
const products=JSON.parse(await readFile(productsUrl,'utf8'));
const existing=products.find(row=>String(row.productId)===productId);
if(!existing){
  products.push({...landingPage,pinImage:null,publicationId:`catalogue:${landingPage.slug}:${new Date().toISOString().slice(0,10)}`,pinTrackingId:candidate.pinId,automationRunId:candidate.runId,searchQuery:Array.isArray(candidate.searchQuery)?candidate.searchQuery.join(' | '):candidate.searchQuery,cluster:candidate.cluster,publishedAt:new Date().toISOString(),activeCatalogue:true,cataloguePromotionSource:'INSTAGRAM_AUTO_PROMOTION'});
  const temp=new URL(`../app/generated-products.${process.pid}.tmp`,import.meta.url);await writeFile(temp,JSON.stringify(products,null,2));await rename(temp,productsUrl);
}
await recordProductMedia(landingPage.slug,candidate);
const affiliateUrl=new URL('../app/affiliate-destinations.json',import.meta.url);
const affiliate=JSON.parse(await readFile(affiliateUrl,'utf8'));
const updated=upsertAffiliateAudit(affiliate,affiliateAuditRecord({candidate,landingPage}));
const affiliateTemp=new URL(`../app/affiliate-destinations.${process.pid}.tmp`,import.meta.url);
await writeFile(affiliateTemp,JSON.stringify(updated,null,2));await rename(affiliateTemp,affiliateUrl);
console.log(JSON.stringify({status:'ACTIVE_CATALOGUE_PROMOTED',productId,slug:landingPage.slug,score:candidate.totalScore,confidence:candidate.confidence,suitability:suitability.totalScore}));
