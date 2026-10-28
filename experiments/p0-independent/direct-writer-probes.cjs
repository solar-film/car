'use strict';
// Strict, memory-only gates for an explicitly supplied private candidate.
// Saves call doPost directly; staging-model mutation guards are never used.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),crypto=require('node:crypto');
const {fixture}=require('../p0/apps-script-fixture.cjs');
const {createModel}=require('../p0/staging-model.cjs');
const file=process.env.CAR_P0_SOURCE_SNAPSHOT;
if(!file)throw Error('Set CAR_P0_SOURCE_SNAPSHOT to an authorized local candidate code.gs; no default or production connection');
const source=fs.readFileSync(file,'utf8');
console.log('Candidate SHA-256: '+crypto.createHash('sha256').update(source).digest('hex'));
const setup=()=>fixture({tables:createModel().snapshot().tables,bundleSource:source});
const body=()=>({token:'synthetic-write-token',sheetName:'Bookings',action:'insert',CustID:'C-SYN-1',
  'Lead ID':'L-261027-002',mutationId:'direct_writer_synthetic_0001','วันที่ติดตั้ง':'2026-10-28',Status:'คิวใหม่'});

test('direct writer: valid booking succeeds with a verified readback',()=>{
  const f=setup(),r=f.save(body());assert.equal(r.success,true);assert.equal(r.verified,true);
  const h=f.tables.Bookings[0],row=f.tables.Bookings.find((row,i)=>i>0&&row[h.indexOf('JobID')]===r.id);
  assert(row);assert.equal(row[h.indexOf('CustID')],'C-SYN-1');assert.equal(row[h.indexOf('Lead ID')],'L-261027-002');
});

for(const [label,patch]of [['missing CustID',{CustID:''}],['orphan CustID',{CustID:'C-SYN-MISSING'}]])test('direct writer: '+label+' must stop before booking append',()=>{
  const f=setup(),before=JSON.stringify(f.tables.Bookings),r=f.save({...body(),...patch});
  assert.equal(r.success,false);assert.equal(JSON.stringify(f.tables.Bookings),before);
});

test('direct writer: an identical retry must keep one new JobID',()=>{
  const f=setup(),before=f.tables.Bookings.length,p=body(),first=f.save(p),second=f.save(p);
  assert.equal(first.success,true);assert.equal(second.success,true);assert.equal(second.id,first.id);
  assert.equal(f.tables.Bookings.length,before+1);
});

test('direct writer: evicting the cache must not turn a retry into another job',()=>{
  const f=setup(),before=f.tables.Bookings.length,p=body(),first=f.save(p);assert.equal(first.success,true);
  f.cache.clear();const second=f.save(p);assert.equal(second.success,true);assert.equal(second.id,first.id);
  assert.equal(f.tables.Bookings.length,before+1);
});

test('direct writer: a changed payload with the same mutation ID must be rejected',()=>{
  const f=setup(),p=body();assert.equal(f.save(p).success,true);
  const before=JSON.stringify(f.tables),r=f.save({...p,Status:'ยกเลิก'});
  assert.equal(r.success,false);assert.equal(JSON.stringify(f.tables),before);
});

test('direct writer: retry after an unverified append must recover the same stored job',()=>{
  const f=setup(),before=f.tables.Bookings.length,p=body();f.state.corruptReadback=true;
  assert.equal(f.save(p).success,false);assert.equal(f.tables.Bookings.length,before+1);
  const idIndex=f.tables.Bookings[0].indexOf('JobID'),storedId=f.tables.Bookings.at(-1)[idIndex];
  f.state.corruptReadback=false;const retry=f.save(p);assert.equal(retry.success,true);
  assert.equal(retry.id,storedId);assert.equal(f.tables.Bookings.length,before+1);
});

test('direct writer: invalid token leaves every table unchanged',()=>{
  const f=setup(),before=JSON.stringify(f.tables),r=f.save({...body(),token:'wrong'});
  assert.equal(r.success,false);assert.equal(JSON.stringify(f.tables),before);
});

test('direct writer: an unavailable script lock leaves every table unchanged',()=>{
  const f=setup(),before=JSON.stringify(f.tables);f.state.lockAvailable=false;
  assert.equal(f.save(body()).success,false);assert.equal(JSON.stringify(f.tables),before);
});
