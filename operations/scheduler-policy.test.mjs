/* oxlint-disable typescript/no-floating-promises -- node:test awaits registered tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {deferredRetry,dueSlot} from './scheduler-policy.mjs';

const configuration={timeZone:'Europe/London',slots:['09:00','14:00','19:30']};

test('normal due window never catches up an old slot',()=>{
  assert.equal(dueSlot(new Date('2026-10-12T18:50:00Z'),configuration.timeZone,configuration.slots),null);
});

test('rate-limited slot retries only after backoff and inside bounded window',()=>{
  const key='instagram:2026-10-12:19:30';
  const state={[key]:{status:'DEFERRED_ALIEXPRESS_API_LIMIT',nextAttemptAt:'2026-10-12T18:42:00Z'}};
  assert.equal(deferredRetry(new Date('2026-10-12T18:40:00Z'),configuration,state,'instagram'),null);
  assert.equal(deferredRetry(new Date('2026-10-12T18:49:00Z'),configuration,state,'instagram')?.slot,'19:30');
  assert.equal(deferredRetry(new Date('2026-10-12T19:20:00Z'),configuration,state,'instagram'),null);
});

test('only AliExpress deferrals are retryable',()=>{
  const state={'instagram:2026-10-12:19:30':{status:'ERROR',nextAttemptAt:'2026-10-12T18:32:00Z'}};
  assert.equal(deferredRetry(new Date('2026-10-12T18:49:00Z'),configuration,state,'instagram'),null);
});

test('Pinterest Riyadh slot can be detected while London has no normal slot',()=>{
  const now=new Date('2026-10-12T19:09:00Z');
  assert.equal(dueSlot(now,'Europe/London',configuration.slots),null);
  assert.equal(dueSlot(now,'Asia/Riyadh',['15:00','19:00','22:00'])?.slot,'22:00');
});
