/* oxlint-disable typescript/no-floating-promises -- node:test awaits registered tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeDiscoveryRows,selectDetailCandidates,selectDiscoveryPlan} from '../discovery-budget.mjs';

test('discovery can rotate one quota-safe query and one sort mode per run',()=>{
  const plan=['a','b','c'].map(query=>({query,pages:2,sortModes:['LAST_VOLUME_DESC','RELEVANCE']}));
  const first=selectDiscoveryPlan(plan,{cursor:0,cycle:0},{queriesPerRun:1});
  assert.deepEqual(first.selected.map(row=>row.query),['a']);
  assert.ok(first.selected.every(row=>row.pages===1&&row.sortModes.length===1));
  const second=selectDiscoveryPlan(plan,first.nextState,{queriesPerRun:1});
  assert.deepEqual(second.selected.map(row=>row.query),['b']);
});

test('merged deferred search metadata is flat and bounded',()=>{
  const [merged]=mergeDiscoveryRows([
    {productId:'1',searchQuery:[['under sink storage']],searchPage:1,searchSortMode:'RELEVANCE',cluster:'under-sink'},
    {productId:'1',searchQuery:'storage for renters',searchPages:[2],searchSortModes:['LAST_VOLUME_DESC'],matchedClusters:['renter']},
  ]);
  assert.equal(merged.searchQuery,'under sink storage');
  assert.deepEqual(merged.searchQueries,['under sink storage','storage for renters']);
  assert.deepEqual(merged.searchPages,[1,2]);
});

test('detail budget removes known weak rows without lowering hard gates',()=>{
  const candidates=[
    {productId:'good',currencyVerified:true,cluster:'k',metrics:{priceGbp:20,feedbackPct:98,recentVolume:500,commissionAmountGbp:1}},
    {productId:'bad-currency',currencyVerified:false,cluster:'k',metrics:{priceGbp:20,feedbackPct:99}},
    {productId:'bad-feedback',currencyVerified:true,cluster:'k',metrics:{priceGbp:20,feedbackPct:90}},
  ];
  assert.deepEqual(selectDetailCandidates(candidates).map(row=>row.productId),['good']);
});
