'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validDate,validateStagingConfig,auditSnapshot}=require('./staging-audit.cjs');
const {sample}=require('./synthetic-fixture.cjs');
const production={spreadsheetIds:['synthetic-prod-sheet'],deploymentIds:['synthetic-prod-script'],origins:['https://production.invalid/car/']};
const config=() => ({environment:'staging',syntheticOnly:true,spreadsheetId:'synthetic-stage-sheet',deploymentId:'synthetic-stage-script',origin:'https://staging.invalid',adsEnabled:false,webhooksEnabled:false,triggersEnabled:false,productionFallback:false});
test('staging preflight accepts explicitly separate targets with all external automation disabled',() => assert.equal(validateStagingConfig(config(),production).ok,true));
for (const [label,patch,code] of [
  ['same spreadsheet',{spreadsheetId:'synthetic-prod-sheet'},'PRODUCTION_SPREADSHEET_FORBIDDEN'],
  ['same Apps Script deployment',{deploymentId:'synthetic-prod-script'},'PRODUCTION_DEPLOYMENT_FORBIDDEN'],
  ['same host with another path',{origin:'https://production.invalid/staging/'},'PRODUCTION_ORIGIN_FORBIDDEN'],
  ['missing target',{deploymentId:''},'STAGING_TARGET_REQUIRED'],
  ['fallback',{productionFallback:true},'PRODUCTION_FALLBACK_FORBIDDEN'],
  ['Ads',{adsEnabled:true},'EXTERNAL_AUTOMATION_MUST_BE_DISABLED'],
  ['webhooks',{webhooksEnabled:true},'EXTERNAL_AUTOMATION_MUST_BE_DISABLED'],
  ['triggers',{triggersEnabled:true},'EXTERNAL_AUTOMATION_MUST_BE_DISABLED'],
  ['real customer fixture',{syntheticOnly:false},'SYNTHETIC_STAGING_REQUIRED'],
  ['invalid URL',{origin:'file:///tmp/staging'},'INVALID_ORIGIN']
]) test('staging preflight rejects '+label,() => {
  const result=validateStagingConfig({...config(),...patch},production);
  assert.equal(result.ok,false);assert(result.errors.includes(code));
});
test('missing production inventory fails closed',() => assert.equal(validateStagingConfig(config(),{}).ok,false));

const run=({snapshot,expected}) => auditSnapshot(snapshot,expected,'2026-10-27');
test('one customer, two leads and two bookings retain distinct counts and future appointments are not completed',() => {
  const input=sample(),before=JSON.stringify(input),result=run(input);
  assert.equal(result.ok,true);assert.deepEqual(result.counts,{leads:2,customers:1,bookings:2,payments:1,scheduled:1,completed:1,cancelled:0,unknownStatus:0,legacyBookingsWithoutLead:0,customersWithMultipleBookings:1,customersWithMultipleLeads:1,leadsWithMultipleBookings:0});
  assert.equal(JSON.stringify(input),before);
});
for (const [name,id] of [['lead','Lead ID'],['Customer','CustID'],['Bookings','JobID'],['PayIn','Pay_ID']]) {
  test(name+' duplicate primary key blocks calculations without leaking its value',() => {
    const input=sample(),t=input.snapshot.tables[name];t.rows.push({...t.rows[0]});
    const result=run(input);assert.equal(result.ok,false);assert.equal(result.counts,null);
    assert(result.issues.some(i => i.code==='DUPLICATE_ID'));assert(!JSON.stringify(result.issues).includes(t.rows[0][id]));
  });
  test(name+' missing primary key blocks calculations',() => {
    const input=sample();input.snapshot.tables[name].rows[0][id]='';assert.equal(run(input).counts,null);
  });
}
for (const [label,change,code] of [
  ['wrong spreadsheet',s => s.spreadsheetId='wrong','SPREADSHEET_MISMATCH'],
  ['wrong gid',s => s.tables.lead.gid=999,'TABLE_IDENTITY_MISMATCH'],
  ['missing table',s => delete s.tables.Customer,'TABLE_IDENTITY_MISMATCH'],
  ['renamed header',s => s.tables.lead.headers[0]='renamed','SCHEMA_MISMATCH'],
  ['duplicate header',s => s.tables.lead.headers.push('Lead ID'),'SCHEMA_MISMATCH'],
  ['partial read',s => s.complete=false,'INCOMPLETE_SNAPSHOT'],
  ['missing cell',s => delete s.tables.lead.rows[0]['เบอร์โทร'],'ROW_SHAPE_INVALID']
]) test('audit rejects '+label+' before calculating partial totals',() => {
  const input=sample();change(input.snapshot);const r=run(input);assert.equal(r.ok,false);assert.equal(r.counts,null);assert(r.issues.some(i => i.code===code));
});
for (const [label,change,code] of [
  ['orphan customer',s => s.tables.Bookings.rows[0].CustID='orphan','ORPHAN_CUSTOMER'],
  ['orphan lead',s => s.tables.Bookings.rows[0]['Lead ID']='orphan','ORPHAN_LEAD'],
  ['orphan payment',s => s.tables.PayIn.rows[0].JobID='orphan','ORPHAN_PAYMENT'],
  ['legacy unlinked booking',s => s.tables.Bookings.rows[0]['Lead ID']='','LEGACY_LINK_REVIEW_REQUIRED'],
  ['future completion',s => s.tables.Bookings.rows[1].Status='เสร็จสิ้น','COMPLETED_IN_FUTURE'],
  ['unknown status',s => s.tables.Bookings.rows[1].Status='unknown','STATUS_REVIEW_REQUIRED'],
  ['bad appointment date',s => s.tables.Bookings.rows[0]['วันที่ติดตั้ง']='2026-02-30','INSTALL_DATE_INVALID'],
  ['bad lead date',s => s.tables.lead.rows[0]['วันที่']='2026-02-30','LEAD_DATE_INVALID']
]) test('audit flags '+label+' for review without guessing a repair',() => {
  const input=sample();change(input.snapshot);const before=JSON.stringify(input),r=run(input);
  assert.equal(r.ok,false);assert(r.issues.some(i => i.code===code));assert.equal(JSON.stringify(input),before);
});
test('cancelled and repeat jobs stay in the audit universe',() => {
  const input=sample();input.snapshot.tables.Bookings.rows[1].Status='ยกเลิก';input.snapshot.tables.Bookings.rows[1]['Lead ID']='L-SYN-1';
  const r=run(input);assert.equal(r.ok,true);assert.equal(r.counts.bookings,2);assert.equal(r.counts.cancelled,1);assert.equal(r.counts.leadsWithMultipleBookings,1);
});
test('calendar validation and missing reconciliation date fail explicitly',() => {
  assert.equal(validDate('2028-02-29'),true);assert.equal(validDate('2026-02-29'),false);
  const {snapshot,expected}=sample();assert.equal(auditSnapshot(snapshot,expected,'').counts,null);
});
test('duplicate normalized customer phones require review and never merge customers',() => {
  const input=sample(),rows=input.snapshot.tables.Customer.rows;rows[0]['เบอร์โทรศัพท์']='0000000000';rows.push({...rows[0],CustID:'C-SYN-2','เบอร์โทรศัพท์':'+66 000 000 000'});
  const result=run(input);assert.equal(result.ok,false);assert.equal(result.counts.customers,2);assert(result.issues.some(i => i.code==='AMBIGUOUS_CUSTOMER_PHONE'));
});
test('explicit links that conflict with available phones require review',() => {
  const input=sample();input.snapshot.tables.lead.rows[0]['เบอร์โทร']='0000000001';input.snapshot.tables.Customer.rows[0]['เบอร์โทรศัพท์']='0000000002';
  assert(run(input).issues.some(i => i.code==='LINK_PHONE_CONFLICT_REVIEW_REQUIRED'));
});
test('a Lead ID linked to multiple customers is reported without assigning a winning customer',() => {
  const input=sample(),rows=input.snapshot.tables.Customer.rows;rows.push({...rows[0],CustID:'C-SYN-2'});
  Object.assign(input.snapshot.tables.Bookings.rows[1],{CustID:'C-SYN-2','Lead ID':'L-SYN-1'});
  assert(run(input).issues.some(i => i.code==='LEAD_LINKED_TO_MULTIPLE_CUSTOMERS'));
});
