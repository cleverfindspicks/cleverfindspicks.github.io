import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hydrateOfficialPinIds,listOwnedPins,pinIdentity} from '../pinterest-analytics.mjs';
import {openPerformanceStore} from '../performance-store.mjs';

test('Pinterest identity is recovered from the production destination',()=>{
  assert.deepEqual(pinIdentity({id:'77',link:'https://cleverfindspicks.github.io/finds/drawer/?utm_source=pinterest&cf_pin=pin-77'}),{officialPinId:'77',pinTrackingId:'pin-77',productSlug:'drawer'});
});

test('Pinterest pin listing is bounded and follows bookmarks',async()=>{
  let calls=0;
  const items=await listOwnedPins('token',{request:async()=>{calls++;return new Response(JSON.stringify(calls===1?{items:[{id:'1'}],bookmark:'next'}:{items:[{id:'2'}],bookmark:null}),{status:200,headers:{'content-type':'application/json'}});}});
  assert.equal(calls,2);assert.deepEqual(items.map(item=>item.id),['1','2']);
});

test('official Pinterest IDs hydrate by stable tracking identity',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'cf-pin-id-'));const db=openPerformanceStore(join(directory,'pins.sqlite'));const now=new Date().toISOString();
  db.prepare('INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('1001','drawer','Drawer','drawer',now,null,now,now);
  db.prepare('INSERT INTO publications VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('pub1','1001','drawer','drawer',null,null,now,'test');
  db.prepare('INSERT INTO pins VALUES (?, ?, ?, ?, ?, ?, ?)').run('pin-77','pub1','1001',null,'https://example.test',now,'test');
  assert.equal(hydrateOfficialPinIds(db,[{id:'77',link:'https://cleverfindspicks.github.io/finds/drawer/?cf_pin=pin-77'}]),1);
  assert.equal(db.prepare('SELECT official_pin_id id FROM pins WHERE pin_tracking_id=?').get('pin-77').id,'77');db.close();
});
