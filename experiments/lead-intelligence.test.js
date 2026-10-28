/* Run locally: node experiments/lead-intelligence.test.js */
'use strict';
const assert = require('node:assert/strict');
const L = require('./lead-intelligence.js');
assert.deepEqual(L.qualify({}),{score:0,tier:'cold'});
assert.deepEqual(L.qualify({carModel:'Vios',filmModel:'Absolute',budgetMatched:true,canVisit:true,installWithin7Days:true,permissionToContact:true}),{score:100,tier:'hot'});
assert.equal(L.validateLostReason('', 'lost').ok,false);
assert.equal(L.validateLostReason('ราคาไม่ตรงงบ','lost').ok,true);
assert.deepEqual(L.attribution({source:'Facebook'}),{source:'Facebook',medium:'unknown',campaignId:'',adId:'',clickId:''});
assert.equal(L.validateJourney({leadId:'L1',status:'completed',jobId:'J1'}).ok,false);
assert.equal(L.validateJourney({leadId:'L1',status:'completed',jobId:'J1',installedAt:'2026-10-27',revenueExVat:5000}).ok,true);
const result=L.report([
  {leadId:'L1',jobId:'J1',status:'completed',installedAt:'2026-10-27',revenueExVat:5000,source:'google',medium:'cpc',campaignId:'X'},
  {leadId:'L1',jobId:'J1',status:'completed',installedAt:'2026-10-27',revenueExVat:5000,source:'google',medium:'cpc',campaignId:'X'},
  {leadId:'L2',jobId:'J2',status:'booked',source:'google',medium:'cpc',campaignId:'X'}
]);
assert.equal(result.length,1);
assert.equal(result[0].leads,2);
assert.equal(result[0].bookings,2);
assert.equal(result[0].completed,1);
assert.equal(result[0].revenueExVat,5000);
assert.equal(L.validateJourney({leadId:'L3',bookedAt:'2026-02-30'}).ok,false);
assert.equal(L.validateJourney({leadId:'L3',bookedAt:'2026-02-28'}).ok,true);
const repeat = L.report([
  {leadId:'L7',jobId:'J7',status:'completed',installedAt:'2026-10-21',revenueExVat:4900,source:'google',medium:'cpc'},
  {leadId:'L7',jobId:'J8',status:'completed',installedAt:'2026-10-27',revenueExVat:8900,source:'google',medium:'cpc'}
]);
assert.equal(repeat[0].leads,1);
assert.equal(repeat[0].bookings,2);
assert.equal(repeat[0].revenueExVat,13800);
console.log('Lead intelligence staging checks passed');
