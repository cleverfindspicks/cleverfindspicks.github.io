import {openInstagramStore,setHealth} from './store.mjs';
import {hiddenQuestion} from './secret-input.mjs';
import {loadCredentials} from './credentials.mjs';
import {InstagramApi} from './api.mjs';
import {refreshProductEvidence} from './product-evidence.mjs';
import {resolveAffiliateDestination} from '../product-intelligence/affiliate-destination.mjs';
const db=openInstagramStore();
try{
  const row=db.prepare("SELECT * FROM instagram_queue WHERE state='PUBLISHED' AND dry_run=0 ORDER BY published_at DESC LIMIT 1").get();
  if(!row?.media_id||!row.permalink)throw new Error('A successful trial Reel with saved media ID and permalink is required.');
  const api=new InstagramApi(await loadCredentials());const media=await api.media(row.media_id);
  if(String(media.id)!==row.media_id||media.caption!==row.caption||!media.permalink)throw new Error('Official media evidence does not match the trial.');
  const {product,candidate}=JSON.parse(row.evidence_json);const [fresh]=await refreshProductEvidence([{product,candidate}]);
  if(!fresh?.currencyPassed||fresh.candidate.decision!=='keep')throw new Error('Trial product no longer passes verification.');
  const destination=await resolveAffiliateDestination(product.affiliateUrl,row.product_id);
  if(!destination.pass)throw new Error('Affiliate destination failed.');
  console.log('Review the actual Reel, product appearance, disclosure and bio link: '+media.permalink);
  if(await hiddenQuestion('After visual review, type APPROVE to allow one Reel/day: ')!=='APPROVE')throw new Error('Daily publishing was not approved.');
  setHealth(db,'INSTAGRAM_DAILY_APPROVAL','APPROVED');
  console.log(JSON.stringify({status:'APPROVED',schedule:'19:30 Europe/London',maximumPerDay:1,scheduler:'A separate registered Instagram worker is still required; Pinterest schedule unchanged.'}));
}catch(error){console.error(String(error.message));process.exitCode=1;}
finally{db.close();}
