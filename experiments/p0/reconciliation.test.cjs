'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createModel}=require('./staging-model.cjs'),{dateOnly,reconcile}=require('./reconciliation.cjs');
test('reconciliation separates Lead/customer/booking/contact events and includes the whole synthetic snapshot',()=>{
  const m=createModel(),snapshot=m.snapshot(),before=JSON.stringify(snapshot),r=reconcile(snapshot,m.today());
  assert.equal(r.ok,true);assert.equal(r.counts.leads,2);assert.equal(r.counts.customers,1);assert.equal(r.counts.bookings,1);assert.equal(r.counts.completed,1);assert.equal(r.counts.contactEvents,0);assert.equal(r.revenueVerified,false);assert.equal(JSON.stringify(snapshot),before);
});
test('Bangkok typed dates and Buddhist-era dates normalize without adopting a different business timestamp',()=>{
  assert.equal(dateOnly({$date:'2026-10-26T18:00:00.000Z'}),'2026-10-27');assert.equal(dateOnly('27/10/2569 13:00'),'2026-10-27');assert.equal(dateOnly('27/10/69'),'2026-10-27');assert.equal(dateOnly('2026-02-30'),'2026-02-30');
});
test('an unlinked or cancelled job is validated rather than disappearing from reconciliation',()=>{
  const m=createModel(),s=m.snapshot(),h=s.tables.Bookings[0],row=s.tables.Bookings[1];row[h.indexOf('Lead ID')]='';row[h.indexOf('Status')]='ยกเลิก';
  const r=reconcile(s,m.today());assert.equal(r.ok,false);assert.equal(r.counts,null);assert(r.issues.some(i=>i.code==='LEGACY_LINK_REVIEW_REQUIRED'));
});
test('duplicate contact IDs block publication instead of overstating contacts',()=>{
  const m=createModel(),s=m.snapshot(),h=s.tables['ประวัติการติดต่อ'][0],row=h.map(name=>({'Contact ID':'H-SYN-1','Lead ID':'L-261027-001','วันเวลาติดต่อ':'2026-10-27T13:00:00'})[name]||'');s.tables['ประวัติการติดต่อ'].push(row,[...row]);
  const r=reconcile(s,m.today());assert.equal(r.ok,false);assert.equal(r.counts,null);assert(r.issues.some(i=>i.code==='HISTORY_ID_OR_LINK_INVALID'));
});
