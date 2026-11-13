'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createModel:createDefaultModel}=require('./staging-model.cjs');
const snapshot=process.env.CAR_P0_SOURCE_SNAPSHOT;
const createModel=()=>createDefaultModel(snapshot?{bundleSource:require('node:fs').readFileSync(snapshot,'utf8')}:{});
const {createStagingServer,transform,pages}=require('./staging-server.cjs');
const {fixture,payload,read}=require('./apps-script-fixture.cjs');
const token='synthetic-write-token';
const customer=mutationId=>({token,action:'insert',sheetName:'Customer',mutationId,'ชื่อลูกค้า':'ลูกค้าทดสอบครบกระบวนการ','เบอร์โทรศัพท์':'0000000002','ช่องทางติดต่อ':'FB','ชื่อช่องทางติดต่อ':'synthetic-flow'});
function leadBody(m,key='manual:synthetic-flow'){
  const body=payload();body.leadKey=key;Object.assign(body.data,{'วันที่':m.today(),'ชื่อลูกค้า':'ลูกค้าทดสอบครบกระบวนการ','เบอร์โทร':'0000000002','ช่องทางติดต่อ':'FB','ชื่อช่องทางติดต่อ':'synthetic-flow'});return body;
}
const queue=(m,custId,leadId,mutationId='queue_synthetic_0001')=>({token,action:'insert',sheetName:'Bookings',mutationId,CustID:custId,'Lead ID':leadId,'วันที่ติดตั้ง':m.today(),'เวลานัด':'13:00','ประเภทลูกค้า':'ลค.ใหม่','รุ่นรถยนต์':'Vios','ยี่ห้อฟิล์ม':'G-TEC','ตำแหน่งติดตั้ง':'เต็มคัน','ยอดขาย':'4280',Status:'คิวใหม่'});
test('full synthetic journey: Lead -> Customer -> Booking -> in progress -> completed, with readback and stable retry IDs',()=>{
  const m=createModel(),l=m.mutate(leadBody(m)),c=m.mutate(customer('customer_synthetic_0001')),body=queue(m,c.id,l.leadId),b=m.mutate(body);
  assert.equal(m.mutate(body).id,b.id);assert.equal(m.rows('Bookings').length,2);
  for(const [before,after]of [['คิวใหม่','กำลังติดตั้ง'],['กำลังติดตั้ง','เสร็จสิ้น']])m.mutate({token,action:'update',sheetName:'Bookings',recordId:b.id,expectedStatus:before,Status:after});
  const saved=m.leads().find(r=>r.leadId===l.leadId);assert.match(saved.status,/ปิดการขาย/);assert.equal(saved.customerId,c.id);
  assert.equal(m.rows('Bookings').find(r=>r.JobID===b.id)['Lead ID'],l.leadId);
  assert.equal(saved.contactHistory.length,2,'in-progress reuses the booking milestone history');
});
test('another lead/car/booking of the same customer cannot reopen or cancel the completed lead',()=>{
  const m=createModel(),l=m.mutate(leadBody(m)),c=m.mutate(customer('customer_synthetic_0001')),b=m.mutate(queue(m,c.id,l.leadId));
  m.mutate({token,action:'update',sheetName:'Bookings',recordId:b.id,Status:'เสร็จสิ้น'});
  const second=m.mutate(leadBody(m,'manual:synthetic-second-car')),b2=m.mutate(queue(m,c.id,second.leadId,'queue_synthetic_0002'));
  m.mutate({token,action:'update',sheetName:'Bookings',recordId:b2.id,Status:'ยกเลิก'});
  assert.match(m.leads().find(r=>r.leadId===l.leadId).status,/ปิดการขาย/);assert.match(m.leads().find(r=>r.leadId===second.leadId).status,/ยกเลิก/);
});
test('an interrupted booking response retries the same mutation without creating another job',()=>{
  const m=createModel(),l=m.mutate(leadBody(m)),c=m.mutate(customer('customer_synthetic_0001')),body=queue(m,c.id,l.leadId);
  m.flags.failAfterWrite=true;assert.throws(()=>m.mutate(body),/ขาดหลังบันทึก/);
  const saved=m.mutate(body);assert.equal(saved.verified,true);assert.equal(m.rows('Bookings').length,2);
  assert.equal(m.leads().find(r=>r.leadId===l.leadId).historyCount,1);
});
test('duplicate/conflicting mutation IDs and duplicate customer phones cannot create new records',()=>{
  const m=createModel(),body=customer('customer_synthetic_0001');const c=m.mutate(body);
  assert.equal(m.mutate(body).id,c.id);assert.throws(()=>m.mutate({...body,'ชื่อลูกค้า':'different'}),/mutationId/);
  assert.throws(()=>m.mutate({...body,mutationId:'customer_synthetic_0002'}),/มีลูกค้าอยู่แล้ว/);assert.equal(m.rows('Customer').length,2);
});
test('orphan customer, missing identifiers and stale booking updates fail without changing data',()=>{
  const m=createModel(),before=JSON.stringify(m.snapshot());
  assert.throws(()=>m.mutate(queue(m,'missing','L-261027-001')),/CustID/);
  assert.throws(()=>m.mutate({...customer(''),mutationId:''}),/mutationId/);
  assert.throws(()=>m.mutate({token,action:'update',sheetName:'Bookings',recordId:'J-SYN-1',expectedStatus:'คิวใหม่',Status:'ยกเลิก'}),/เปลี่ยนไปแล้ว/);
  assert.equal(JSON.stringify(m.snapshot()),before);
});
test('writer token remains required inside the staging adapter',()=>{
  const m=createModel(),before=JSON.stringify(m.snapshot());assert.throws(()=>m.mutate({...customer('customer_synthetic_0001'),token:'wrong'}),/token/i);assert.equal(JSON.stringify(m.snapshot()),before);
});
test('snapshot restore preserves IDs, typed dates, notes, number formats, history and retry state',()=>{
  const m=createModel(),body=leadBody(m),l=m.mutate(body),backup=m.snapshot();
  m.mutate(customer('customer_synthetic_0001'));m.restore(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(m.snapshot(),backup);assert.equal(m.mutate(body).leadId,l.leadId);assert.equal(m.leads().length,3);
});
test('invalid restore schema stops before replacing the current staging state',()=>{
  const m=createModel(),before=m.snapshot(),bad=structuredClone(before);bad.tables.lead[0][0]='renamed';
  assert.throws(()=>m.restore(bad),/schema/);assert.deepEqual(m.snapshot(),before);
});
test('planner refuses ambiguous legacy links and duplicate primary keys before any write',()=>{
  const f=fixture(),c={CustID:'C-SYN-1','เบอร์โทรศัพท์':'0000000001'},l=id=>({'Lead ID':id,'เบอร์โทร':'0000000001'}),b={JobID:'J-SYN-1',CustID:c.CustID,'วันที่ติดตั้ง':'27/10/2569',Status:'คิวใหม่'};
  const result=f.plan([l('L-SYN-1'),l('L-SYN-2')],[c],[b]);assert.equal(result.plan.length,0);assert.equal(result.skipped.ambiguous,2);
  assert.throws(()=>f.plan([l('L-SYN-1')],[c],[b,b]),/JobID ซ้ำ/);assert.equal(f.writes.length,0);
});
test('planner validates actual calendar dates and keeps old completed leads closed for unlinked future queues',()=>{
  const f=fixture(),c={CustID:'C-SYN-1','เบอร์โทรศัพท์':'0000000001'},l={'Lead ID':'L-SYN-1','เบอร์โทร':'0000000001','วันที่':'2026-10-01','สถานะการติดตาม':'✅ ปิดการขายสำเร็จ'},b={JobID:'J-SYN-1',CustID:c.CustID,'วันที่ติดตั้ง':'30/2/2569',Status:'คิวใหม่'};
  assert.equal(f.plan([l],[c],[b]).skipped.missingDate,1);assert.equal(f.plan([l],[c],[{...b,'วันที่ติดตั้ง':'27/10/2569'}]).skipped.keptStatus,1);
});
test('all staged pages and data-call scripts are transformed without a production data endpoint',()=>{
  for(const name of [...pages,'crm-auth.js','lead-sheet.js','lead-data-app.js'])assert(!/https:\/\/(script.google.com\/macros|docs.google.com\/spreadsheets)/.test(transform(name,read(name))),name);
});
test('loopback HTTP staging enforces auth/origin, serves real pages safely, and supports the complete saved-data route',async()=>{
  const stage=createStagingServer({model:createModel()});await stage.listen(0);const base='http://127.0.0.1:'+stage.server.address().port;
  try{
    const html=await fetch(base+'/lead-data.html');assert.equal(html.status,200);assert.match(await html.text(),/STAGING · ข้อมูลสมมติ/);
    assert.match(html.headers.get('content-security-policy'),/connect-src 'self'/);assert.equal((await fetch(base+'/api/lead-data/sheet-leads')).status,401);
    assert.equal((await fetch(base+'/lead-data.env')).status,404);assert.equal((await fetch(base+'/experiments/p0/staging-server.cjs')).status,404);
    const login=await fetch(base+'/__stage/apps-script?crmAuth=1',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action:'login',user:'staging',password:'staging-only'})});
    const auth=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];assert.equal(auth.authenticated,true);
    const headers={Origin:base,Cookie:cookie,'Content-Type':'application/json'};
    const save=async body=>{const r=await fetch(base+'/__stage/apps-script',{method:'POST',headers,body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
    const l=await save(leadBody(stage.model));assert.equal(l.body.verified,true);
    const c=await save(customer('customer_synthetic_http')),q=queue(stage.model,c.body.id,l.body.leadId,'queue_synthetic_http'),b=await save(q);assert.equal(b.body.verified,true);
    assert.equal((await save(q)).body.id,b.body.id);assert.equal((await save({...q,token:'wrong'})).status,403);
    const denied=await fetch(base+'/__stage/apps-script',{method:'POST',headers:{...headers,Origin:'https://other.invalid'},body:JSON.stringify(q)});assert.equal(denied.status,403);
    const data=await fetch(base+'/api/lead-data/sheet-leads',{headers:{Cookie:cookie}});assert.equal(data.status,200);assert.equal((await data.json()).leads.length,3);
    const csv=await fetch(base+'/__stage/gviz?sheet=Bookings&tq='+encodeURIComponent("select A,B,D,T where B = '"+c.body.id+"'"),{headers:{Cookie:cookie}});assert.match(await csv.text(),/"JobID","CustID","วันที่ติดตั้ง","Status"/);
    assert.equal(stage.stats.cspViolations,0);
  }finally{await new Promise(resolve=>stage.server.close(resolve));}
});
