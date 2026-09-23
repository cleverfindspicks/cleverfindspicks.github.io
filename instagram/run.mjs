import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {assertAliExpressReady,isAliExpressDeferred,DEFERRED} from '../product-intelligence/aliexpress-recovery.mjs';
import {spawnSync} from 'node:child_process';
import {openInstagramStore,setHealth,livePublicationSql} from './store.mjs';
import {qualifiedCatalogue} from './catalogue.mjs';
import {enqueue,transition,scheduleSlot,londonClock} from './queue.mjs';
import config from './config.json' with {type:'json'};
import {generateReel} from './creative.mjs';
import {InstagramApi,tokenHealth} from './api.mjs';
import {loadCredentials,refreshIfNeeded} from './credentials.mjs';
import {publishQueued} from './publish.mjs';
import {resolveAffiliateDestination} from '../product-intelligence/affiliate-destination.mjs';
import {exportHub} from './export-hub.mjs';
import {deployInstagramChanges} from './deployment.mjs';
import {activationDecision} from './activation.mjs';
import {refreshProductEvidence} from './product-evidence.mjs';

export async function runInstagram({force=false,productionNow=false,productId=null,deploy=deployInstagramChanges}={}) {
  const db=openInstagramStore();
  const lock=new URL('../product-intelligence/.local/instagram-worker.lock',import.meta.url);
  await mkdir(new URL('../product-intelligence/.local/',import.meta.url),{recursive:true});
  try{await writeFile(lock,String(process.pid),{flag:'wx'});}catch{
    const pid=Number(await readFile(lock,'utf8').catch(()=>0));let alive=false;
    try{if(pid){process.kill(pid,0);alive=true;}}catch{/* crashed worker */}
    if(alive){db.close();return {status:'WORKER_ALREADY_RUNNING'};}
    await unlink(lock).catch(()=>{});await writeFile(lock,String(process.pid),{flag:'wx'});
  }
  try{
    assertAliExpressReady();
    const pending=db.prepare("SELECT 1 FROM instagram_queue WHERE dry_run=0 AND state IN ('PENDING','CREATIVE_GENERATING','READY','PUBLISHING','FAILED_RETRYABLE') LIMIT 1").get();
    if(!force&&!pending&&!scheduleSlot())return {status:'OUTSIDE_LONDON_SLOT',pinterestUnaffected:true};
    let credentials=await loadCredentials();
    const initial=tokenHealth(credentials);setHealth(db,'INSTAGRAM',initial);
    if(['NOT_CONFIGURED','TOKEN_EXPIRED'].includes(initial))return {status:initial,pinterestUnaffected:true};
    try{credentials=await refreshIfNeeded(credentials);}catch{setHealth(db,'INSTAGRAM','TOKEN_EXPIRING','REFRESH_FAILED');}
    const api=new InstagramApi(credentials);
    const profile=await api.profile();
    if(String(profile.user_id||profile.id)!==String(credentials.userId))throw new Error('Instagram authorized user ID mismatch');
    setHealth(db,'INSTAGRAM',tokenHealth(credentials));
    await exportHub(db);
    const hubRepair=spawnSync('git',['diff','--quiet','--','app/instagram-publications.json']);
    if(hubRepair.status!==0)await deploy();
    // Complete/reconcile an earlier job independently of today's schedule.
    let row=db.prepare("SELECT * FROM instagram_queue WHERE dry_run=0 AND state IN ('PENDING','CREATIVE_GENERATING','READY','PUBLISHING','FAILED_RETRYABLE') ORDER BY scheduled_day LIMIT 1").get();
    const publishedCount=db.prepare("SELECT COUNT(*) n FROM instagram_queue WHERE dry_run=0 AND state='PUBLISHED'").get().n;
    const approved=db.prepare("SELECT status FROM instagram_health WHERE name='INSTAGRAM_DAILY_APPROVAL'").get()?.status==='APPROVED';
    const activation=activationDecision({publishedCount,approved,force:force&&!productionNow,uncertain:!!row?.publish_uncertain,scheduled:productionNow||(!force&&config.production.mode==='FULL_AUTO'&&!config.production.manualCreativeApprovalScheduled)});
    if(['TRIAL_PENDING','TRIAL_REVIEW_REQUIRED'].includes(activation))return {status:activation,pinterestUnaffected:true};
    const slot=scheduleSlot();
    if(!row && !force && !slot)return {status:'OUTSIDE_LONDON_SLOT',pinterestUnaffected:true};
    const day=londonClock().day;
    const alreadyPublishedToday=db.prepare(`SELECT instagram_publication_id,published_at FROM instagram_queue WHERE dry_run=0 AND state='PUBLISHED' AND ${livePublicationSql}`).all().filter(p=>londonClock(new Date(p.published_at)).day===day);
    if(alreadyPublishedToday.length>=config.schedule.maximumPostsPerDay && !row?.publish_uncertain)return {status:'DAILY_LIMIT_REACHED',pinterestUnaffected:true};
    const scheduledTime=slot||(row&&db.prepare('SELECT scheduled_time FROM instagram_schedule_slots WHERE publication_id=?').get(row.instagram_publication_id)?.scheduled_time)||'trial';
    const claimed=db.prepare('SELECT publication_id,status FROM instagram_schedule_slots WHERE scheduled_day=? AND scheduled_time=?').get(day,scheduledTime);
    const claimedState=claimed?.publication_id&&db.prepare('SELECT state FROM instagram_queue WHERE instagram_publication_id=?').get(claimed.publication_id)?.state;
    if(!row&&claimed&&!['FAILED_PERMANENT','SKIPPED'].includes(claimedState))return {status:'SLOT_ALREADY_PROCESSED',pinterestUnaffected:true};
    let choices=null;let creativeFailures=0;
    const nextChoice=async()=>{
      choices||=await qualifiedCatalogue(db);
      if(productId)choices=choices.filter(choice=>String(choice.product.productId)===String(productId));
      const used=db.prepare(`SELECT product_id FROM instagram_queue WHERE scheduled_day=? AND dry_run=0 AND ${livePublicationSql}`).all(day).map(r=>r.product_id);
      const todayClusters=db.prepare(`SELECT cluster FROM instagram_queue WHERE scheduled_day=? AND dry_run=0 AND state='PUBLISHED' AND ${livePublicationSql}`).all(day).map(r=>r.cluster);
      const eligible=choices.filter(c=>!used.includes(c.product.productId));
      return eligible.find(c=>!todayClusters.includes(c.product.cluster))||eligible[0]||null;
    };
    if(!row){const choice=await nextChoice();if(choice)row=enqueue(db,choice,day,false,scheduledTime);}
    if(!row){const status='SKIPPED_NO_QUALIFIED_INSTAGRAM_PRODUCT';db.prepare('INSERT INTO instagram_schedule_slots VALUES(?,?,?,?,?) ON CONFLICT(scheduled_day,scheduled_time) DO UPDATE SET publication_id=NULL,status=excluded.status,updated_at=excluded.updated_at').run(day,scheduledTime,null,status,new Date().toISOString());setHealth(db,'INSTAGRAM_LAST_SLOT',status,day+' '+scheduledTime);return {status,pinterestUnaffected:true};}
    if(row.next_attempt_at&&new Date(row.next_attempt_at)>new Date())return {status:'WAITING_BACKOFF'};
    if(row.state==='CREATIVE_GENERATING')row=transition(db,row.instagram_publication_id,'FAILED_RETRYABLE',{last_error:'RECOVERED_CRASHED_CREATIVE_WORKER'});
    while(row&&(row.state==='PENDING'||(row.state==='FAILED_RETRYABLE'&&!row.asset_path))){
      row=transition(db,row.instagram_publication_id,'CREATIVE_GENERATING');
      let creative=null,lastError=null;
      for(let attempt=0;attempt<config.production.creativeGenerationAttempts&&!creative;attempt++)try{
        const recent=db.prepare("SELECT hook,creative_json FROM instagram_queue WHERE state='PUBLISHED' ORDER BY published_at DESC LIMIT 10").all();
        row.recentCreative={hooks:recent.map(r=>r.hook).filter(Boolean),layouts:recent.map(r=>{try{return JSON.parse(r.creative_json||'{}').layoutFamily;}catch{return null;}}).filter(Boolean)};
        creative=await generateReel(row);
      }catch(error){if(isAliExpressDeferred(error)){transition(db,row.instagram_publication_id,'FAILED_RETRYABLE',{last_error:DEFERRED,next_attempt_at:error.nextAttemptAt});throw error;}lastError=error;}
      if(creative){row=transition(db,row.instagram_publication_id,'READY',{creative_id:creative.creativeId,creative_json:JSON.stringify(creative),hook:creative.hook,caption:creative.caption,asset_path:creative.assetPath,public_asset_url:creative.publicAssetUrl,hashtags_json:JSON.stringify(creative.hashtags||[]),keywords_json:JSON.stringify(creative.keywords||[]),layout_family:creative.layoutFamily,category:creative.category});break;}
      const failureMessage=String(lastError?.message||'');
      const creativeFailure=['BLOCKED_LOW_EFFORT_REEL','BLOCKED_GENERIC_CREATIVE_COPY','BLOCKED_VISUAL_AFFILIATE_LABEL'].find(code=>failureMessage.includes(code))||(failureMessage.includes('SKIPPED_CREATIVE_VISUAL_QA_FAILED')?'SKIPPED_CREATIVE_VISUAL_QA_FAILED':'SKIPPED_CREATIVE_GENERATION_FAILED');
      transition(db,row.instagram_publication_id,'FAILED_PERMANENT',{last_error:creativeFailure});creativeFailures++;
      const choice=await nextChoice();row=choice?enqueue(db,choice,day,false,scheduledTime):null;
      if(!row){const status='SKIPPED_NO_QUALIFIED_INSTAGRAM_PRODUCT';db.prepare('UPDATE instagram_schedule_slots SET publication_id=NULL,status=?,updated_at=? WHERE scheduled_day=? AND scheduled_time=?').run(status,new Date().toISOString(),day,scheduledTime);setHealth(db,'INSTAGRAM_LAST_SLOT',status,`creative failures ${creativeFailures}; ${String(lastError?.message||'').slice(0,80)}`);return {status,creativeFailures,pinterestUnaffected:true};}
    }
    // Deploy the real MP4 first. API consumes only an HTTPS URL whose bytes are
    // checked against the local validated hash. Propagation simply retries.
    if(!row.container_id&&!row.publish_uncertain)await deploy();
    const publicationOptions={verifyDestination:async r=>{
      const {product,candidate}=JSON.parse(r.evidence_json);
      const [fresh]=await refreshProductEvidence([{product,candidate}]);
      if(!fresh?.currencyPassed||fresh.candidate.decision!=='keep'||Math.abs(fresh.candidate.metrics.priceGbp-candidate.metrics.priceGbp)/candidate.metrics.priceGbp>0.08||fresh.candidate.image!==candidate.image)return {pass:false,reason:'CURRENT_PRODUCT_CURRENCY_PRICE_OR_IMAGE_GATE_FAILED'};
      return resolveAffiliateDestination(product.affiliateUrl,r.product_id);
    }};
    let result=await publishQueued(db,row,api,publicationOptions);
    for(let attempt=0;result.status==='CONTAINER_PROCESSING' && attempt<3;attempt++){
      await new Promise(resolve=>setTimeout(resolve,15000));
      row=db.prepare('SELECT * FROM instagram_queue WHERE instagram_publication_id=?').get(row.instagram_publication_id);
      result=await publishQueued(db,row,api,publicationOptions);
    }
    if(['PUBLISHED','RECOVERED_PUBLISHED'].includes(result.status)){await exportHub(db);await deploy();}
    // If media publication succeeded but deployment failed, repair the hub on
    // the next run without submitting media again.
    await exportHub(db);
    const dirty=spawnSync('git',['diff','--quiet','--','app/instagram-publications.json']);
    if(dirty.status!==0)await deploy();
    return {...result,pinterestUnaffected:true};
  }catch(error){if(isAliExpressDeferred(error)){setHealth(db,'INSTAGRAM_LAST_SLOT',DEFERRED,error.nextAttemptAt);return {status:DEFERRED,nextAttemptAt:error.nextAttemptAt,pinterestUnaffected:true};}setHealth(db,'INSTAGRAM',error.tokenExpired?'TOKEN_EXPIRED':'ERROR',String(error.message).slice(0,180));return {status:'ERROR',detail:String(error.message).slice(0,180),pinterestUnaffected:true};}
  finally{db.close();await unlink(lock).catch(()=>{});}
}
if(process.argv[1]?.endsWith('run.mjs')){const idIndex=process.argv.indexOf('--product-id');console.log(JSON.stringify(await runInstagram({force:process.argv.includes('--force')||process.argv.includes('--production-now'),productionNow:process.argv.includes('--production-now'),productId:idIndex>=0?process.argv[idIndex+1]:null})));}
