'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {fixture,payload,read} = require('./apps-script-fixture.cjs');
const summary = require('../../contact-report-summary.js');

test('authenticated lead retry preserves Lead ID, row, leading zero and unrelated legacy cells', () => {
  const f=fixture(), old=JSON.stringify(f.tables.lead.slice(0,2)), body=payload();
  const first=f.save(body), next=f.save(body);
  assert.equal(first.success,true); assert.equal(first.verified,true);
  assert.equal(next.leadId,first.leadId); assert.equal(next.rowNumber,first.rowNumber);
  assert.match(first.leadId,/^L-\d{6}-[0-9A-F]{3}$/);
  assert.equal(f.tables.lead.length,3); assert.equal(f.tables.lead[2][5],'0000000000');
  assert.equal(JSON.stringify(f.tables.lead.slice(0,2)),old);
  assert.equal(f.state.releases,2);
});
test('interrupted save retries its reserved row instead of adding a lead', () => {
  const f=fixture(); f.state.failWrite=true;
  assert.equal(f.save(payload()).success,false);
  const reserved=f.tables.lead[2][16], retried=f.save(payload());
  assert.equal(retried.success,true); assert.equal(retried.leadId,reserved); assert.equal(f.tables.lead.length,3);
});
for (const [label,change] of [
  ['missing writer token',b => delete b.token], ['invalid writer token',b => b.token='invalid'],
  ['missing lead key',b => delete b.leadKey], ['invalid date',b => b.data['วันที่']='2026-02-30'],
  ['wrong table',b => b.sheetName='Customer'], ['missing customer name',b => b.data['ชื่อลูกค้า']='']
]) test(label+' is rejected without mutating any table', () => {
  const f=fixture(), body=payload(), before=JSON.stringify(f.tables); change(body);
  assert.equal(f.save(body).success,false); assert.equal(f.writes.length,0); assert.equal(JSON.stringify(f.tables),before);
});
test('schema drift is rejected before row reservation', () => {
  const f=fixture(); f.tables.lead[0][0]='renamed';
  assert.equal(f.save(payload()).success,false); assert.equal(f.writes.length,0);
});
test('busy lock prevents writes and a held lock is released on validation error', () => {
  const f=fixture(); f.state.lockAvailable=false;
  assert.equal(f.save(payload()).success,false); assert.equal(f.writes.length,0); assert.equal(f.state.opens,0);
  f.state.lockAvailable=true; const bad=payload(); bad.leadKey='';
  assert.equal(f.save(bad).success,false); assert.equal(f.state.releases,1);
});
test('a stale edit cannot overwrite a concurrent lead update', () => {
  const f=fixture(), body=payload(); assert.equal(f.save(body).success,true);
  f.tables.lead[2][4]='synthetic concurrent edit'; const count=f.writes.length;
  const result=f.save({...body,action:'updateLeadSheet',previous:{...body.data},data:{...body.data,'ชื่อลูกค้า':'synthetic overwritten'}});
  assert.equal(result.success,false); assert.equal(f.writes.length,count); assert.equal(f.tables.lead[2][4],'synthetic concurrent edit');
});
test('readback corruption never produces verified success', () => {
  const f=fixture(); f.state.corruptReadback=true;
  assert.equal(f.save(payload()).success,false); assert.equal(f.state.releases,1);
});
test('formula-like input is stored as literal text', () => {
  const f=fixture(), body=payload(); body.data['*หมายเหตุ']='=SYNTHETIC()';
  assert.equal(f.save(body).verified,true); assert.equal(f.tables.lead[2][15],'=SYNTHETIC()');
});
test('contact report validates Thai Buddhist dates and does not accept an impossible calendar date', () => {
  const table={cols:[{label:'วันที่'},{label:'ช่องทางติดต่อ'}],rows:[{c:[{f:'27/10/2569',v:'27/10/2569'},{v:'FB'}]}]};
  const rows=summary.summarize(summary.fromGoogleTable(table));
  assert.equal(rows[0].dateRaw,'2026-10-27'); assert.equal(rows[0].fb,1);
  assert.throws(() => summary.summarize([{sheetData:{date:'2026-02-30',channel:'FB'}}]),/วันที่/);
  assert.throws(() => summary.fromGoogleTable({cols:[],rows:[]}),/หัวคอลัมน์/);
});
test('contact report counts contact rows; it does not claim unique people or installed cars', () => {
  const rows=summary.summarize(Array.from({length:3},() => ({leadId:'synthetic-repeat',sheetData:{date:'2026-10-27',channel:'FB'}})));
  assert.equal(rows[0].total,3); assert.equal(rows[0].fb,3);
});
test('legacy daily contact totals replace overlapping generated days instead of adding them twice', () => {
  const generated=summary.summarize([{sheetData:{date:'2026-10-27',channel:'FB'}}]);
  const rows=summary.mergeDailyRows(generated,[{date:generated[0].date,dateRaw:'2026-10-27',fb:4}]);
  assert.equal(rows.length,1); assert.equal(rows[0].total,4); assert.equal(rows[0].source,'legacy');
});

const customer={CustID:'C-SYN-1','เบอร์โทรศัพท์':'0000000000','ช่องทางติดต่อ':'Line','ชื่อช่องทางติดต่อ':'synthetic-person'};
const lead=id => ({'Lead ID':id,'เบอร์โทร':'0000000000','ช่องทางติดต่อ':'Line','ชื่อช่องทางติดต่อ':'synthetic-person'});
const booking=(id,date,status='คิวใหม่',leadId='') => ({JobID:id,CustID:'C-SYN-1','วันที่ติดตั้ง':date,'เวลานัด':'13:00',Status:status,'Lead ID':leadId});
test('legacy booking plan rejects missing Lead ID and ambiguous phone ownership', () => {
  const f=fixture();
  assert.equal(f.plan([lead('')],[customer],[booking('J-SYN-1','27/10/2569')]).skipped.missingLeadId,1);
  const result=f.plan([lead('L-SYN-1')],[customer,{...customer,CustID:'C-SYN-2'}],[booking('J-SYN-1','27/10/2569')]);
  assert.equal(result.plan.length,0); assert.equal(result.skipped.ambiguous,1);
});
test('legacy booking plan never matches by a customer name alone', () => {
  const result=fixture().plan([{'Lead ID':'L-SYN-1','ชื่อลูกค้า':'สมมติ'}],[{CustID:'C-SYN-1','ชื่อลูกค้า':'สมมติ'}],[booking('J-SYN-1','27/10/2569')]);
  assert.equal(result.plan.length,0); assert.equal(result.skipped.unmatched,1);
});
test('legacy booking plan leaves cancelled bookings alone and blocks customers with missing appointment dates', () => {
  const f=fixture();
  assert.equal(f.plan([lead('L-SYN-1')],[customer],[booking('J-SYN-1','27/10/2569','ยกเลิก')]).plan.length,0);
  assert.equal(f.plan([lead('L-SYN-1')],[customer],[booking('J-SYN-1','')]).skipped.missingDate,1);
});
test('P0-02 fixed: explicit Lead ID keeps separate bookings for the same customer', () => {
  const result=fixture().plan([lead('L-SYN-1'),lead('L-SYN-2')],[customer],[booking('J-SYN-1','01/10/2569','เสร็จสิ้น','L-SYN-1'),booking('J-SYN-2','27/10/2569','คิวใหม่','L-SYN-2')]);
  assert.deepEqual(result.plan.map(p => [p.leadId,p.jobId]),[['L-SYN-1','J-SYN-1'],['L-SYN-2','J-SYN-2']]);
});

function extract(file, start, end) {
  const source=read(file), a=source.indexOf(start), b=source.indexOf(end,a+start.length);
  assert(a>=0 && b>a, 'source extraction markers must exist: '+file);
  return source.slice(a,b);
}
for (const page of ['contact-stats.html','sales-summary.html','overview.html']) {
  test(page+' rejects HTTP failures and GViz permission/error envelopes without reporting zero contacts', async () => {
    const context=vm.createContext({SHEET_ID:'synthetic',URL,AbortSignal,CarContactReportSummary:summary,
      fetch:async () => ({ok:false,status:403})});
    const end=page==='contact-stats.html'?'async function fetchContactSheet()':page==='sales-summary.html'?'function parseContactStatsCsv':'function parseCsv';
    vm.runInContext(extract(page,'async function fetchContactReport()',end),context);
    await assert.rejects(context.fetchContactReport(),/HTTP 403/);
    context.fetch=async () => ({ok:true,text:async () => '<html>synthetic login</html>'});
    await assert.rejects(context.fetchContactReport(),/สิทธิ์อ่าน/);
    context.fetch=async () => ({ok:true,text:async () => 'google.visualization.Query.setResponse({"status":"error","errors":[{"detailed_message":"synthetic missing sheet"}]});'});
    await assert.rejects(context.fetchContactReport(),/synthetic missing sheet/);
  });
}
test('P0-03 reproduction: one nonempty lead row with an invalid date blocks the entire contact report', () => {
  assert.throws(() => summary.summarize([{sheetData:{date:'2026-10-27',channel:'FB'}},{sheetData:{date:'',channel:'Line'}}]),/วันที่/);
});
test('P0-04 fixed: contact CSV reader rejects an HTML login response without a doctype', async () => {
  const c=vm.createContext({sheetCsvUrl:() => 'https://synthetic.invalid',fetch:async () => ({ok:true,text:async () => '<html>synthetic login</html>'})});
  vm.runInContext(extract('contact-stats.html','async function fetchCsvText(name)','async function fetchContactReport()'),c);
  await assert.rejects(c.fetchCsvText('synthetic'),/Cannot parse/);
});
test('cloud Lead read sends the shared session to crmLead and preserves a backend 401 even on HTTP 200', async () => {
  let sent;
  const c=vm.createContext({URL,AbortSignal,cloud:true,endpoint:'https://script.invalid/exec?crmAuth=1',
    window:{location:{protocol:'https:',href:'https://synthetic.invalid/car/'}},
    TOKEN_KEY:'synthetic-key',memoryToken:'',stored:() => 'synthetic-session',clientId:() => 'synthetic-client',
    fetch:async (url,options) => {sent={url,options};return {ok:true,status:200,json:async () => ({ok:false,code:401,error:'synthetic session expired'})};}});
  vm.runInContext(extract('crm-auth.js','async function request(','async function refreshSession()'),c);
  await assert.rejects(c.request('sheet-leads',{},true),error => error.status===401);
  assert.equal(sent.url,'https://script.invalid/exec?crmLead=1');assert.equal(sent.options.method,'POST');
  assert.equal(JSON.parse(sent.options.body).sessionToken,'synthetic-session');assert.equal(sent.options.credentials,'omit');
});
test('local Lead read uses the local authenticated route and preserves HTTP 403', async () => {
  let sent;
  const c=vm.createContext({cloudLead:false,service:'http://127.0.0.1:3093',accessKey:'synthetic-access',AbortSignal,
    fetch:async (url,options) => {sent={url,options};return {ok:false,status:403,json:async () => ({error:'synthetic forbidden'})};}});
  vm.runInContext(extract('lead-data-app.js','async function api(','function guard('),c);
  await assert.rejects(c.api('sheet-leads'),error => error.status===403);
  assert.equal(sent.url,'http://127.0.0.1:3093/api/lead-data/sheet-leads');assert.equal(sent.options.headers['X-Car-Lead-Key'],'synthetic-access');
});
test('P0-01 reproduction: repository-only Apps Script bundle lacks the cloud auth and Lead service handlers',() => {
  const f=fixture();
  assert.throws(() => f.context.doPost({parameter:{crmLead:'1'}}),/carLeadServicePost_/);
  assert.throws(() => f.context.doPost({parameter:{crmAuth:'1'}}),/carCrmAuthPost_/);
});
test('dashboard sales inclusion and completed-installation inclusion are separate rules',() => {
  const c=vm.createContext({normalizeText:value => String(value||'').trim()});
  vm.runInContext(extract('overview.html','function isCompletedBooking(','function isClaimBooking('),c);
  const future={status:'คิวใหม่',customerGroup:'ลูกค้าใหม่',date:new Date('2026-11-01T00:00:00+07:00')};
  assert.equal(c.isOverviewSalesBooking(future),true);assert.equal(c.isCompletedBooking(future),false);
});
test('P0-08 fixed: experimental report rejects one JobID attributed to two Lead IDs',() => {
  const L=require('../lead-intelligence.js');
  assert.throws(() => L.report(['L-SYN-1','L-SYN-2'].map(leadId => ({leadId,jobId:'J-SYN-1',status:'completed',installedAt:'2026-10-27',revenueExVat:100}))),/ซ้ำและขัดแย้ง/);
});
