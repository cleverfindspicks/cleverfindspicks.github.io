/* oxlint-disable typescript/no-floating-promises -- node:test awaits registered tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openInstagramStore,livePublicationSql} from '../store.mjs';
import {enqueue,scheduleSlot} from '../queue.mjs';
import {instagramReport} from '../analytics.mjs';
test('three configurable London slots preserve DST and do not catch up old slots',()=>{
  for(const [utc,slot] of [['08:00','09:00'],['13:00','14:00'],['18:30','19:30']])assert.equal(scheduleSlot(new Date('2026-07-01T'+utc+':00Z')),slot);
  for(const slot of ['09:00','14:00','19:30'])assert.equal(scheduleSlot(new Date('2026-12-01T'+slot+':00Z')),slot);
  assert.equal(scheduleSlot(new Date('2026-07-01T10:00:00Z')),null);
  assert.equal(scheduleSlot(new Date('2026-07-01T11:00:00Z'),{times:['12:00'],catchUpMinutes:10}),'12:00');
});
test('three distinct products; each slot claimed once; deleted test excluded from live report',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ig-slots-'));const db=openInstagramStore(join(dir,'performance.sqlite'));
  try{const rows=[];for(let i=0;i<3;i++){const id='p'+i;db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?)').run(id,id,id,'cluster'+i,'2026-09-15',null,'now','now');const choice={product:{productId:id,slug:id,cluster:'cluster'+i},candidate:{totalScore:80},suitability:{totalScore:80}};rows.push(enqueue(db,choice,'2026-09-15',false,['09:00','14:00','19:30'][i]));}
    assert.equal(db.prepare('SELECT COUNT(*) n FROM instagram_queue').get().n,3);
    assert.throws(()=>enqueue(db,{product:{productId:'p2',slug:'p2',cluster:'c'},candidate:{totalScore:80},suitability:{totalScore:80}},'2026-09-15',false,'09:00'));
    db.prepare("UPDATE instagram_queue SET state='PUBLISHED',media_id='test',published_at=? WHERE product_id='p0'").run(new Date().toISOString());
    db.prepare('INSERT INTO instagram_publication_lifecycle VALUES(?,?,?,?,?)').run(rows[0].instagram_publication_id,'TEST','DELETED','now','User confirmed manual deletion');
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM instagram_queue WHERE state='PUBLISHED' AND ${livePublicationSql}`).get().n,0);
    assert.equal(instagramReport(db).publishedPosts,0);
  }finally{db.close();}
});
