'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {read}=require('./apps-script-fixture.cjs');
const L=require('../lead-intelligence.js');
const journey=extra=>({leadId:'L-SYN-1',jobId:'J-SYN-1',status:'completed',installedAt:'2026-10-27',revenueExVat:100,...extra});
test('one identical booking retry is counted once and a repeat installation remains distinct',()=>{
  const rows=L.report([journey(),journey(),journey({jobId:'J-SYN-2',revenueExVat:200})]);
  assert.equal(rows[0].bookings,2);assert.equal(rows[0].completed,2);assert.equal(rows[0].leads,1);assert.equal(rows[0].revenueExVat,300);
});
for(const [label,extra] of [['another lead',{leadId:'L-SYN-2'}],['another campaign',{leadId:'L-SYN-2',campaignId:'other'}],['different revenue',{revenueExVat:200}],['different status',{status:'booked'}]]) {
  test('a duplicate JobID with '+label+' blocks the whole report',()=>assert.throws(()=>L.report([journey(),journey(extra)]),/ขัดแย้ง/));
}
test('invalid journeys are rejected explicitly instead of silently reducing totals',()=>{
  assert.throws(()=>L.report(null),/journey/);assert.throws(()=>L.report([journey(),{leadId:''}]),/แถว 2/);
});
test('one lead with conflicting attribution is not assigned to the first arbitrary campaign',()=>assert.throws(()=>L.report([journey(),journey({jobId:'J-SYN-2',source:'google',medium:'cpc'})]),/แหล่งที่มา/));

function loader({failure='records',cached=false}={}){
  const previous=[{id:'synthetic-old',name:'ข้อมูลสมมติเดิม',customerId:''}],notices=[],counts=[],snapshots=[];
  const c=vm.createContext({session:{id:'synthetic-session'},service:'synthetic',savedLeadRevision:1,
    sheetLeads:cached?[]:previous,leadsFromSnapshot:false,leadRefreshError:'',recordsLoaded:false,
    takeEarlyIntake:()=>null,takeEarlyLeads:()=>null,loadInstallationDates:async()=>new Map(),
    readLeadsSnapshot:()=>cached?previous:null,writeLeadsSnapshot:rows=>snapshots.push(rows),
    customerFollowUp:lead=>lead.status||'ใหม่',installationDatesForLead:()=> '—',renderStatusOptions(){},renderLeads(){},renderInstallations(){},renderInbox(){},
    updateFollowUpCount:value=>counts.push(value),notice:(...args)=>notices.push(args),
    api:async action=>{if(action==='records') {if(failure==='records')throw Error('synthetic read failed');return {leads:[],installations:[]};}if(action==='sheet-leads')throw Error('synthetic read failed');}
  });
  const source=read('lead-data-app.js'),a=source.indexOf('    async function loadRecords('),b=source.indexOf('    async function showTab(',a);
  vm.runInContext(source.slice(a,b),c);
  const guardStart=source.indexOf('    function leadsSnapshotBusy('),guardEnd=source.indexOf("    $('lead-list').addEventListener('keydown'",guardStart);
  vm.runInContext(source.slice(guardStart,guardEnd),c);
  return {c,previous,notices,counts,snapshots};
}
for(const failure of ['records','sheet-leads'])for(const cached of [false,true]){
  test(`failed ${failure} keeps ${cached?'cached':'loaded'} rows visible, marks them stale, and blocks edits`,async()=>{
    const f=loader({failure,cached});await assert.rejects(f.c.loadRecords(false,{reportErrors:true}),/synthetic read failed/);
    assert.equal(f.c.sheetLeads[0].id,'synthetic-old');assert.equal(f.c.leadsFromSnapshot,true);
    assert.match(f.notices[0][0]+f.notices.at(-1)[0],/ข้อมูลเดิม/);assert.equal(f.snapshots.length,0);
    assert.equal(f.counts.at(-1),null);assert.equal(f.c.leadsSnapshotBusy(),true);assert.match(f.notices.at(-1)[0],/ยังโหลดไม่สำเร็จ/);
  });
}
test('a failed first read is an error, never a successful empty result',async()=>{
  const f=loader();f.c.sheetLeads=[];await assert.rejects(f.c.loadRecords(false),/synthetic read failed/);
  assert.equal(f.c.sheetLeads.length,0);assert.equal(f.counts.at(-1),null);assert.equal(f.notices.at(-1)[1],true);
});
test('fresh read after failure unlocks the list and replaces the old snapshot only after success',async()=>{
  const f=loader();await assert.rejects(f.c.loadRecords(false),/synthetic/);
  f.c.api=async()=>({leads:[],installations:[],sheetLeads:[{id:'synthetic-fresh',customerId:''}]});
  await f.c.loadRecords(false);assert.equal(f.c.sheetLeads[0].id,'synthetic-fresh');assert.equal(f.c.leadsFromSnapshot,false);
  assert.equal(f.c.leadRefreshError,'');assert.equal(f.snapshots.length,1);assert.equal(f.c.leadsSnapshotBusy(),false);
});
test('an abandoned read cannot mark a newer session list stale',async()=>{
  const f=loader();let reject;f.c.api=()=>new Promise((_,r)=>reject=r);
  const pending=f.c.loadRecords(false);f.c.savedLeadRevision++;reject(Error('synthetic old request'));await pending;
  assert.equal(f.c.leadsFromSnapshot,false);assert.equal(f.notices.length,0);
});
test('the outer event guard preserves the handled stale-read warning',async()=>{
  const f=loader(),source=read('lead-data-app.js'),a=source.indexOf('    function guard('),b=source.indexOf('    function requireSession(',a);
  vm.runInContext(source.slice(a,b),f.c);await f.c.guard(()=>f.c.loadRecords(false))();
  assert.match(f.notices.at(-1)[0],/แสดงข้อมูลเดิม/);assert.equal(f.notices.at(-1)[1],true);
});
test('CSV reader rejects different HTML/XML/envelope responses and accepts genuine CSV',async()=>{
  const source=read('contact-stats.html'),a=source.indexOf('async function fetchCsvText(name)'),b=source.indexOf('async function fetchContactReport()',a);
  let response='';const c=vm.createContext({sheetCsvUrl:()=>'/synthetic',fetch:async()=>({ok:true,text:async()=>response})});
  vm.runInContext(source.slice(a,b),c);
  for(response of ['<html>login</html>','\ufeff <head>login</head>','<?xml version="1.0"?>','google.visualization.Query.setResponse({})'])await assert.rejects(c.fetchCsvText('lead'),/Cannot parse/);
  response='"Lead ID","วันที่"\n"L-SYN-1","2026-10-27"';assert.equal(await c.fetchCsvText('lead'),response);
});
test('booking dates and history use the exact Lead ID and do not inherit another lead\'s queue',()=>{
  const source=read('lead-data-app.js'),a=source.indexOf('    function bookingMatchesLead('),b=source.indexOf('    function renderInstallationDates(',a);
  const leads=[{leadId:'L-SYN-1',customerId:'C-SYN-1'},{leadId:'L-SYN-2',customerId:'C-SYN-1'}],c=vm.createContext({sheetLeads:leads});vm.runInContext(source.slice(a,b),c);
  const dates=new Map([['C-SYN-1',[{jobId:'J-SYN-1',leadId:'L-SYN-1',date:'2026-10-27'}]]]);
  assert.equal(c.installationDatesForLead(dates,leads[0])[0].jobId,'J-SYN-1');assert.equal(c.installationDatesForLead(dates,leads[1]),'—');
  dates.get('C-SYN-1').push({jobId:'J-SYN-OLD',leadId:'',date:'2026-10-01'});
  assert.match(c.installationDatesForLead(dates,leads[1])[0].label,/ต้องตรวจสอบ/);assert.equal(c.bookingMatchesLead({'Lead ID':'L-SYN-1'},leads[1]),false);
  c.sheetLeads=[leads[0]];assert.equal(c.bookingMatchesLead({'Lead ID':''},leads[0]),true);
});
test('Lead customer draft carries the saved Lead ID separately from editable customer fields',()=>{
  const source=read('lead-data-app.js'),a=source.indexOf('    function startCustomerFromLead('),b=source.indexOf('    function openCustomerFromLead(',a);
  let saved;const c=vm.createContext({Date,location:{},sessionStorage:{setItem:(key,value)=>saved=JSON.parse(value)},window:{CarLeadSheet:{splitReminder:()=>({note:''}),splitHistory:()=>({note:''})}}});
  vm.runInContext(source.slice(a,b),c);c.startCustomerFromLead({leadId:'L-261027-ABC',sheetData:{name:'สมมติ'}});
  assert.equal(saved.leadId,'L-261027-ABC');assert.equal(c.location.href,'customer-data.html?fromLead=1');
});
for(const leadId of ['L-261027-ABC',''])test('new customer auto-booking preserves '+(leadId?'the exact Lead ID through form reset':'an empty legacy Lead ID without guessing'),async()=>{
  const source=read('customer-data.html'),a=source.indexOf('        async function submitForm('),b=source.indexOf('        function showAlert(',a);
  const fields=new Map(),get=id=>{if(!fields.has(id))fields.set(id,{value:id==='firstKnown'?'Facebook':id==='phone'?'0000000098':'สมมติ',classList:{add(){},remove(){}},reset(){},focus(){},reportValidity(){}});return fields.get(id);};
  let opened,body;const c=vm.createContext({customerSaveInProgress:false,currentEditingPhone:null,currentEditingId:null,customerFromLead:true,customerFromLeadId:leadId,customerEmbedded:false,customerInsertRequest:{id:'synthetic'},CUSTOMER_SHEET_NAME:'Customer',
    document:{getElementById:get,querySelector:()=>({value:'สมมติ'})},normalizePhone:value=>value,clearCustomerSaveStatus(){},showCustomerSaveError(){throw Error('Unexpected save error');},findCustomerByPhone:()=>null,setCustomerSaving(){},showCustomerSaveStatus(){},fetchExistingCustomers:async()=>true,insertMutationId:()=> 'synthetic-request',postWithWriteToken:async value=>{body=value;return {success:true,id:'C-SYN-NEW'};},closeCustomerDrawer:async()=>{},resetForm(){c.customerFromLeadId='';c.customerFromLead=false;},openBookingModal:(...args)=>opened=args});
  vm.runInContext(source.slice(a,b),c);await c.submitForm({preventDefault(){}});
  assert.deepEqual(opened,['C-SYN-NEW','สมมติ',leadId]);assert.equal(body.sheetName,'Customer');assert.equal(c.customerFromLeadId,'');
});
test('Overview reads ISO and Buddhist dates as the same day and rejects rollover dates',()=>{
  const source=read('overview.html'),a=source.indexOf('        function parseDate(value)'),b=source.indexOf('        function parseMoney(',a),c=vm.createContext({textValue:v=>String(v??'').trim()});
  vm.runInContext(source.slice(a,b),c);
  for(const raw of ['2026-10-27','2026-10-27 13:00:00','2569-10-27','27/10/2569','27/10/69','27/10/2026']){
    const date=c.parseDate(raw);assert.ok(date,raw);assert.equal(date.getFullYear(),2026,raw);assert.equal(date.getMonth(),9,raw);assert.equal(date.getDate(),27,raw);
  }
  for(const raw of ['2026-02-30','31/02/69','2026-13-01','x2026-10-27','2026-10-271'])assert.equal(c.parseDate(raw),null,raw);
});
test('integration retains main\'s pending-work category and all five customer-type choices',()=>{
  for(const page of ['contact-stats.html','overview.html','sales-summary.html']){
    const source=read(page),a=source.indexOf('function classifyCustomerType(value)'),b=source.indexOf('\n        }',a)+10;
    assert.ok(a>=0,page);const c=vm.createContext({normalizeText:v=>String(v).trim(),normalizeLookup:v=>String(v).trim()});vm.runInContext(source.slice(a,b),c);
    assert.equal(c.classifyCustomerType('งานค้าง'),page==='sales-summary.html'?'pending':'งานค้าง',page);
  }
  const html=read('customer-data.html'),group=html.slice(html.indexOf('id="bk-custTypeGroup"'),html.indexOf('</div>',html.indexOf('id="bk-custTypeGroup"')));
  for(const value of ['ลูกค้าใหม่','ลูกค้าเก่า','ลูกค้าเคลม','งานแก้(ในวัน)','งานค้าง'])assert.ok(group.includes('data-val="'+value+'"'),value);
});
