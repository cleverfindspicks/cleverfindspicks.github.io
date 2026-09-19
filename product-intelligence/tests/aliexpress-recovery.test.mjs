/* oxlint-disable typescript/no-floating-promises -- node:test awaits registered tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {recoveryClient,DEFERRED,rememberDeferred,deferredCandidates,completeDeferred} from '../aliexpress-recovery.mjs';

test('HTTP 200 ApiCallLimit persists across processes, doubles backoff, recovers without stale data',async()=>{
  const path=join(await mkdtemp(join(tmpdir(),'cf-rate-')),'state.sqlite');
  let time=Date.now(),calls=0,limited=true;
  const fetcher=async()=>{calls++;return Response.json(limited?{error_response:{code:'ApiCallLimit'}}:{result_response:{resp_result:{resp_code:200}}});};
  const client=recoveryClient({path,now:()=>time,fetcher});
  await assert.rejects(client.request('https://example.com'),e=>e.code===DEFERRED&&Date.parse(e.nextAttemptAt)===time+900000);
  const restarted=recoveryClient({path,now:()=>time,fetcher});
  await assert.rejects(restarted.request('https://example.com'),e=>e.code===DEFERRED);
  assert.equal(calls,1);
  time+=900000;
  await assert.rejects(restarted.request('https://example.com'),e=>Date.parse(e.nextAttemptAt)===time+1800000);
  assert.equal(calls,2);
  time+=1800000;limited=false;
  assert.equal((await restarted.request('https://example.com')).status,200);
  limited=true;
  await assert.rejects(restarted.request('https://example.com'),e=>Date.parse(e.nextAttemptAt)===time+900000);
});

test('HTTP 429 respects Retry-After; repeated calls during cooldown do not extend it',async()=>{
  const path=join(await mkdtemp(join(tmpdir(),'cf-rate-')),'state.sqlite');const time=Date.now();
  const client=recoveryClient({path,now:()=>time,fetcher:async()=>new Response('limited',{status:429,headers:{'retry-after':'7200'}})});
  await assert.rejects(client.request('https://example.com'),e=>Date.parse(e.nextAttemptAt)===time+7200000);
  assert.throws(()=>client.check(),e=>Date.parse(e.nextAttemptAt)===time+7200000);
});

test('both production runners return deferred without publishing or consuming stale reports',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'cf-rate-run-'));const path=join(dir,'recovery.sqlite');
  await assert.rejects(recoveryClient({path,fetcher:async()=>Response.json({error_response:{code:'ApiCallLimit'}})}).request('https://example.com'));
  for(const script of ['instagram/run.mjs','product-intelligence/production-run.mjs']){
    const result=spawnSync(process.execPath,[script],{encoding:'utf8',env:{...process.env,CF_ALIEXPRESS_RECOVERY_DB:path,CF_PERFORMANCE_DB:join(dir,'performance.sqlite')},windowsHide:true});
    assert.equal(result.status,0,result.stderr);
    const output=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(output.status,DEFERRED);
    assert.ok(Date.parse(output.nextAttemptAt)>Date.now());
  }
});

test('deferred candidates remain platform-specific retry inputs until fresh details arrive',async()=>{
  const previous=process.env.CF_ALIEXPRESS_RECOVERY_DB;
  process.env.CF_ALIEXPRESS_RECOVERY_DB=join(await mkdtemp(join(tmpdir(),'cf-pending-')),'state.sqlite');
  try{
    rememberDeferred('instagram',[{productId:'123',metrics:{priceGbp:22}}]);
    assert.equal(deferredCandidates('instagram')[0].productId,'123');
    assert.deepEqual(deferredCandidates('pinterest'),[]);
    completeDeferred('instagram',['456']);
    assert.equal(deferredCandidates('instagram').length,1);
    completeDeferred('instagram',['123']);
    assert.deepEqual(deferredCandidates('instagram'),[]);
  }finally{if(previous===undefined)delete process.env.CF_ALIEXPRESS_RECOVERY_DB;else process.env.CF_ALIEXPRESS_RECOVERY_DB=previous;}
});
