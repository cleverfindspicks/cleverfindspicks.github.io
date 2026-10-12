import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {commissionEvidenceGbp,fetchAffiliateOrders,importAffiliateOrders,orderLifecycle} from '../aliexpress-orders.mjs';
import {openPerformanceStore} from '../performance-store.mjs';

test('AliExpress order lifecycle never treats paid orders as settled commission',()=>{
  assert.equal(orderLifecycle({order_status:'Payment Completed'}),'pending');
  assert.equal(orderLifecycle({order_status:'Buyer Confirmed Receipt'}),'pending');
  assert.equal(orderLifecycle({order_status:'Settlement Completed'}),'completed');
  assert.equal(orderLifecycle({effect_detail_status:'FullRefund'}),'refunded');
});

test('commission is only accepted when AliExpress explicitly reports GBP',()=>{
  assert.equal(commissionEvidenceGbp({order_status:'Payment Completed',settled_currency:'USD',estimated_paid_commission:'2.50'}),null);
  assert.equal(commissionEvidenceGbp({order_status:'Payment Completed',settled_currency:'GBP',estimated_paid_commission:'2.50'}),2.5);
});

test('an official empty-order response is a successful empty report',async()=>{
  const rows=await fetchAffiliateOrders({
    credentials:{appKey:'key',appSecret:'secret',trackingId:'tracking'},statuses:['Payment Completed'],
    request:async()=>new Response(JSON.stringify({aliexpress_affiliate_order_list_response:{resp_result:{resp_code:405,resp_msg:'The result is empty'}}}),{status:200,headers:{'content-type':'application/json'}}),
  });
  assert.deepEqual(rows,[]);
});

test('order import is idempotent and only attributes exact product and pin identities',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'cf-order-api-'));
  const db=openPerformanceStore(join(directory,'orders.sqlite'));
  const now=new Date().toISOString();
  db.prepare('INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('1001','drawer','Drawer','drawer',now,null,now,now);
  db.prepare('INSERT INTO publications VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('pub1','1001','drawer','drawer',null,null,now,'test');
  db.prepare('INSERT INTO pins VALUES (?, ?, ?, ?, ?, ?, ?)').run('pin1','pub1','1001','999','https://example.test/finds/drawer',now,'test');
  const rows=[{sub_order_id:'order-1',product_id:'1001',tracking_id:'pin1',paid_time:now,order_status:'Payment Completed',settled_currency:'GBP',estimated_paid_commission:'1.25'}];
  assert.equal(importAffiliateOrders(db,rows).imported,1);
  assert.equal(importAffiliateOrders(db,rows).imported,1);
  const stored=db.prepare('SELECT * FROM aliexpress_orders').all();
  assert.equal(stored.length,1);
  assert.equal(stored[0].product_id,'1001');
  assert.equal(stored[0].pin_tracking_id,'pin1');
  assert.equal(stored[0].status,'pending');
  assert.equal(stored[0].pending_commission_gbp,1.25);
  db.close();
});
