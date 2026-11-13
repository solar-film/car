'use strict';
// These are strict acceptance gates, not TODO/skip tests. Current failures block release.
// Run separately from regression. Never reinterpret their expected failures as a pass.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {backend,syncPlan,customer,lead,booking}=require('./runtime.cjs');
test('P0-G1: explicit Lead ID keeps two leads tied to their own bookings',()=>{
  const r=syncPlan([lead('L-A'),lead('L-B')],[customer],[
    booking('J-A','1/10/2569','เสร็จสิ้น','L-A'),booking('J-B','27/10/2569','คิวใหม่','L-B')]);
  assert.deepEqual(r.plan.map(p=>[p.leadId,p.jobId]),[['L-A','J-A'],['L-B','J-B']]);
});
test('P0-G2: an unrelated new queue must never reopen an already closed lead',()=>{
  const r=syncPlan([{...lead('L-A'),'สถานะการติดตาม':'✅ ปิดการขายสำเร็จ'}],[customer],[booking('J-B','27/10/2569','คิวใหม่')]);
  assert.equal(r.plan.length,0);
});
test('P0-G3: impossible booking dates cannot trigger a lead status update',()=>{
  const r=syncPlan([lead('L-A')],[customer],[booking('J-A','31/2/2569','เสร็จสิ้น')]);
  assert.equal(r.plan.length,0);
});
test('P0-G4: a booking missing CustID is refused before append',()=>{
  const f=backend();f.stubBookingStorage();
  f.post({token:'fixture-write-only',sheetName:'Bookings',action:'insert','วันที่ติดตั้ง':'2026-10-27',Status:'คิวใหม่'});
  assert.equal(f.calls.rows.length,0);
});
test('P0-G5: retrying the same booking mutation cannot append another JobID',()=>{
  const f=backend();f.stubBookingStorage();
  const body={token:'fixture-write-only',sheetName:'Bookings',action:'insert',CustID:'C-FIXTURE',mutationId:'fixture-request-001',
    'วันที่ติดตั้ง':'2026-10-27',Status:'คิวใหม่'};
  f.post(body);f.post(body);assert.equal(f.calls.rows.length,1);
});
test('P0-G6: deployable source must include the auth and lead service handlers invoked by Code.gs',()=>{
  // An owner-approved private source bundle may be supplied; never publish it just to satisfy this gate.
  const sourceRoot=process.env.CAR_CRM_PRIVATE_BUNDLE || path.join(__dirname,'../..');
  const missing=['CarCrmAuth.gs','CarLeadService.gs'].filter(p=>!fs.existsSync(path.join(sourceRoot,p)));
  assert.deepEqual(missing,[]);
});
test('P0-G7: conflicting JobID across leads is rejected rather than counted twice',()=>{
  const L=require('../lead-intelligence.js');
  const rows=['L-A','L-B'].map(leadId=>({leadId,jobId:'J-SAME',status:'completed',installedAt:'2026-10-27',revenueExVat:5000,source:'google',medium:'cpc'}));
  assert.throws(()=>L.report(rows),/JobID/);
});
