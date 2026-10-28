'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createModel}=require('./staging-model.cjs'),{dateOnly,reconcile}=require('./reconciliation.cjs');
test('reconciliation separates Lead/customer/booking/contact events and includes the whole synthetic snapshot',()=>{
  const m=createModel(),snapshot=m.snapshot(),before=JSON.stringify(snapshot),r=reconcile(snapshot,m.today());
  assert.equal(r.ok,true);assert.equal(r.counts.leads,2);assert.equal(r.counts.customers,1);assert.equal(r.counts.bookings,1);assert.equal(r.counts.completed,1);assert.equal(r.counts.contactEvents,0);assert.equal(r.revenueVerified,false);assert.equal(JSON.stringify(snapshot),before);
});
test('Bangkok typed dates and Buddhist-era dates normalize without adopting a different business timestamp',()=>{
  assert.equal(dateOnly({$date:'2026-10-26T18:00:00.000Z'}),'2026-10-27');assert.equal(dateOnly('27/10/2569 13:00'),'2026-10-27');assert.equal(dateOnly('27/10/69'),'2026-10-27');assert.equal(dateOnly('2026-02-30'),'');
});
test('an unlinked or cancelled job is validated rather than disappearing from reconciliation',()=>{
  const m=createModel(),s=m.snapshot(),h=s.tables.Bookings[0],row=s.tables.Bookings[1];row[h.indexOf('Lead ID')]='';row[h.indexOf('Status')]='ยกเลิก';
  const r=reconcile(s,m.today());assert.equal(r.ok,false);assert.equal(r.counts,null);assert(r.issues.some(i=>i.code==='LEGACY_LINK_REVIEW_REQUIRED'));
});
test('duplicate contact IDs block publication instead of overstating contacts',()=>{
  const m=createModel(),s=m.snapshot(),h=s.tables['ประวัติการติดต่อ'][0],row=h.map(name=>({'Contact ID':'H-SYN-1','Lead ID':'L-261027-001','วันเวลาติดต่อ':'2026-10-27T13:00:00'})[name]||'');s.tables['ประวัติการติดต่อ'].push(row,[...row]);
  const r=reconcile(s,m.today());assert.equal(r.ok,false);assert.equal(r.counts,null);assert(r.issues.some(i=>i.code==='HISTORY_ID_OR_LINK_INVALID'));
});

test('offset timestamps use the Bangkok calendar day at both month boundaries',()=>{
  assert.equal(dateOnly('2026-10-31T18:00:00Z'),'2026-11-01');
  assert.equal(dateOnly('2026-11-01T01:00:00+09:00'),'2026-10-31');
  assert.equal(dateOnly('2026-10-27T13:00:00'),'2026-10-27');
});

for(const name of ['lead','Customer','Bookings','PayIn','ประวัติการติดต่อ']){
  for(const shape of ['truncated','extra','null','object'])test(name+' rejects '+shape+' rows without changing the snapshot or throwing',()=>{
    const m=createModel(),s=m.snapshot(),table=s.tables[name];
    if(table.length===1)table.push(table[0].map(()=>''));
    const row=table[1];
    table[1]=shape==='truncated'?row.slice(0,-1):shape==='extra'?[...row,'UNMAPPED']:shape==='null'?null:{};
    const before=JSON.stringify(s),r=reconcile(s,m.today());
    assert.equal(r.ok,false);assert.equal(r.counts,null);assert(r.issues.some(i=>i.code==='ROW_SHAPE_INVALID'&&i.table===name));
    assert.equal(JSON.stringify(s),before);
  });
}

for(const shape of ['duplicate','non-string','missing'])test('history rejects '+shape+' headers before mapping',()=>{
  const m=createModel(),s=m.snapshot(),table=s.tables['ประวัติการติดต่อ'];
  if(shape==='duplicate')table[0].push('Lead ID');
  if(shape==='non-string')table[0][4]=null;
  if(shape==='missing')table[0].splice(table[0].indexOf('วันเวลาติดต่อ'),1);
  const r=reconcile(s,m.today());assert.equal(r.ok,false);assert.equal(r.counts,null);
  assert(r.issues.some(i=>i.code==='HISTORY_SCHEMA_INVALID'));
});

for(const value of ['2026-02-30T12:00:00','2026-10-27T25:00:00','not-a-date',{$date:'invalid'}])test('invalid contact time blocks totals: '+JSON.stringify(value),()=>{
  const m=createModel(),s=m.snapshot(),table=s.tables['ประวัติการติดต่อ'];
  table.push(table[0].map(h=>({'Contact ID':'H-SYN-1','Lead ID':'L-261027-001','วันเวลาติดต่อ':value})[h]??''));
  const r=reconcile(s,m.today());assert.equal(r.ok,false);assert.equal(r.counts,null);
  assert(r.issues.some(i=>i.code==='HISTORY_DATE_INVALID'));
});

test('malformed typed dates fail closed instead of throwing or accepting calendar rollover',()=>{
  for(const value of [new Date(NaN),{$date:'invalid'},{$date:'2026-02-30T12:00:00Z'},'2026-10-27T25:00:00Z']){
    const m=createModel(),s=m.snapshot(),h=s.tables.Bookings[0];s.tables.Bookings[1][h.indexOf('วันที่ติดตั้ง')]=value;
    const r=reconcile(s,m.today());assert.equal(r.ok,false);assert.equal(r.counts,null);
    assert(r.issues.some(i=>i.code==='INSTALL_DATE_INVALID'));
  }
});

test('reconciliation issues expose only codes, table names and row numbers',()=>{
  const m=createModel(),s=m.snapshot();s.tables.Bookings[1]=['PRIVATE-CUSTOMER-DATA'];
  const r=reconcile(s,m.today());assert.equal(r.ok,false);assert(!JSON.stringify(r).includes('PRIVATE-CUSTOMER-DATA'));
});

test('a sparse header or sparse row is not a complete snapshot',()=>{
  for(const target of ['header','row']){
    const m=createModel(),s=m.snapshot();delete s.tables.Bookings[target==='header'?0:1][4];
    const r=reconcile(s,m.today());assert.equal(r.ok,false);assert.equal(r.counts,null);
  }
  const m=createModel(),s=m.snapshot();delete s.tables.Bookings[1];
  assert.equal(reconcile(s,m.today()).counts,null);
});

test('valid history timestamps remain separate contact events across Bangkok month boundaries',()=>{
  const m=createModel(),s=m.snapshot(),t=s.tables['ประวัติการติดต่อ'];
  for(const [i,at]of ['2026-10-31T18:00:00Z',{$date:'2026-11-01T01:00:00+09:00'},'27/10/2569 13:00'].entries()){
    t.push(t[0].map(h=>({'Contact ID':'H-SYN-'+i,'Lead ID':'L-261027-001','วันเวลาติดต่อ':at})[h]??''));
  }
  const r=reconcile(s,m.today());assert.equal(r.ok,true);assert.equal(r.counts.contactEvents,3);assert.equal(r.counts.leads,2);
});
