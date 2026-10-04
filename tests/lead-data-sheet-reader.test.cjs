const test=require('node:test');const assert=require('node:assert/strict');const {readLeads}=require('../lead-data-sheet-reader.cjs');
test('formatted numeric budgets use the raw value for save comparisons',async()=>{
 const labels=['วันที่','Admin','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ','ชื่อลูกค้า','เบอร์โทร','ยี่ห้อรถยนต์','รุ่นรถยนต์','ตำแหน่งติดตั้ง * (เลือกได้หลายตำแหน่ง)','ยี่ห้อที่สนใจ','รุ่นที่สนใจ','งบประมาณ','ประเภทลูกค้า','รู้จักเราจาก','สถานะการติดตาม','*หมายเหตุ','Lead ID'];
 const cells=labels.map(()=>null);cells[0]={v:'Date(2026,9,1)',f:'1/10/2026, 10:00:00'};cells[4]={v:'test'};cells[11]={v:4900,f:'4,900.00'};cells[16]={v:'L-test'};cells[15]={v:'หมายเหตุ "ลูกค้า"\nบรรทัดที่สอง, นัดโทรกลับ'};
 const payload={status:'ok',table:{cols:labels.map((label,i)=>({label,type:i===11?'number':'string'})),rows:[{c:cells}]}};
 const result=await readLeads(async url=>({ok:true,text:async()=>new URL(url).searchParams.get('sheet')==='lead'?'google.visualization.Query.setResponse('+JSON.stringify(payload)+');':new URL(url).searchParams.get('sheet')==='Customer'?'"CustID","ชื่อลูกค้า","เบอร์โทรศัพท์","ช่องทางติดต่อ","ชื่อช่องทางติดต่อ"':'"Contact ID","Lead ID"'}));
 assert.equal(result.leads[0].sheetData.note,cells[15].v);assert.equal(result.leads[0].note,cells[15].v);assert.equal(result.leads[0].sheetData.budget,'4900');assert.equal(result.leads[0].sheetData.date,'2026-10-01');
});
test('same customer name alone never matches',()=>{
 const {matchesCustomer}=require('../lead-data-sheet-reader.cjs');
 assert.equal(matchesCustomer({name:'คุณเนย'},{'ชื่อลูกค้า':'คุณเนย'}),false);
 assert.equal(matchesCustomer({name:'คุณเนย',phone:'0991111111'},{'ชื่อลูกค้า':'คุณเนย','เบอร์โทรศัพท์':'0992222222'}),false);
 assert.equal(matchesCustomer({channel:'Line',contact:'profile'},{'ช่องทางติดต่อ':'FB','ชื่อช่องทางติดต่อ':'profile'}),false);
});
test('report maps all sixteen lead columns with separate profile and phone',async()=>{
 const headers=['วันที่','Admin','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ','ชื่อลูกค้า','เบอร์โทร','ยี่ห้อรถยนต์','รุ่นรถยนต์','ตำแหน่งติดตั้ง * (เลือกได้หลายตำแหน่ง)','ยี่ห้อที่สนใจ','รุ่นที่สนใจ','งบประมาณ','ประเภทลูกค้า','รู้จักเราจาก','สถานะการติดตาม','*หมายเหตุ','Lead ID'];
 const values=['1/10/26','พลอย','Line','Weerachon','ลูกค้า','0991234567','Toyota','Vios','บานหน้า','G-TEC','CM15','3200','ลค.ใหม่','Facebook','สอบถามใหม่','ติดตาม','L-1'];
 const result=await readLeads(async(url)=>{if(new URL(url).searchParams.get('sheet')==='ประวัติการติดต่อ')return {ok:true,text:async()=> '"Contact ID","Lead ID"\n"H1","L-1"\n"H2","L-1"\n"H3","L-2"'};if(new URL(url).searchParams.get('sheet')==='Customer')return {ok:true,text:async()=> '"ชื่อลูกค้า","เบอร์โทรศัพท์","ช่องทางติดต่อ","ชื่อช่องทางติดต่อ"\n"อื่น","099-123-4567","Line","Weerachon"'};assert.equal(new URL(url).searchParams.get('tq'),'select A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q');return {ok:true,text:async()=>[headers,values].map(r=>r.map(v=>JSON.stringify(v)).join(',')).join('\n')};});
 assert.equal(result.leads.length,1);assert.equal(result.leads[0].historyCount,2);assert.equal(result.leads[0].leadId,'L-1');assert.equal(result.leads[0].isCustomer,true);assert.equal(result.leads[0].phone,'0991234567');assert.equal(result.leads[0].sheetData.contact,'Weerachon');assert.equal(result.leads[0].sheetData.carBrand,'Toyota');assert.equal(result.leads[0].note,'ติดตาม');
});

test('customer matching normalizes phones and excludes unnamed placeholders',()=>{const {matchesCustomer}=require('../lead-data-sheet-reader.cjs');assert.equal(matchesCustomer({phone:'099-123-4567'},{'เบอร์โทรศัพท์':'+66 99 123 4567'}),true);assert.equal(matchesCustomer({channel:'Line',contact:'Profile'},{'ช่องทางติดต่อ':'Line','ชื่อช่องทางติดต่อ':'profile'}),true);assert.equal(matchesCustomer({name:'ลูกค้ายังไม่ให้ข้อมูล'},{'ชื่อลูกค้า':'ลูกค้ายังไม่ให้ข้อมูล'}),false);assert.equal(matchesCustomer({name:'คนละชื่อ',phone:'0991111111'},{'ชื่อลูกค้า':'อื่น','เบอร์โทรศัพท์':'0992222222'}),false);});

function deferred() {
 let resolve,reject;
 const promise=new Promise((resolvePromise,rejectPromise)=>{resolve=resolvePromise;reject=rejectPromise;});
 return {promise,resolve,reject};
}
function sheetFixtures() {
 const headers=['วันที่','Admin','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ','ชื่อลูกค้า','เบอร์โทร','ยี่ห้อรถยนต์','รุ่นรถยนต์','ตำแหน่งติดตั้ง * (เลือกได้หลายตำแหน่ง)','ยี่ห้อที่สนใจ','รุ่นที่สนใจ','งบประมาณ','ประเภทลูกค้า','รู้จักเราจาก','สถานะการติดตาม','*หมายเหตุ','Lead ID'];
 const values=['1/10/26, 10:00:00','พลอย','Line','PROFILE','ลูกค้า','0991234567','Toyota','Vios','บานหน้า','G-TEC','CM15','3200','ลค.ใหม่','Facebook','สอบถามใหม่','ติดตาม','L-1'];
 return new Map([
   ['lead',[headers,values].map(row=>row.map(value=>JSON.stringify(value)).join(',')).join('\n')],
   ['Customer','"CustID","ชื่อลูกค้า","เบอร์โทรศัพท์","ช่องทางติดต่อ","ชื่อช่องทางติดต่อ"\n"C-1","ชื่ออื่น","099-123-4567","Line","profile"'],
   ['ประวัติการติดต่อ','"Contact ID","Lead ID","วันเวลาติดต่อ","ผู้ดูแล","เรื่องที่คุย"\n"H-1","L-1","1/10/2026, 11:30:00","พลอย","โทรติดตาม"']
 ]);
}

test('starts all independent sheet requests and body reads without waiting for another sheet',async()=>{
 const fixtures=sheetFixtures();
 const responses=new Map([...fixtures.keys()].map(sheet=>[sheet,deferred()]));
 const bodies=new Map([...fixtures.keys()].map(sheet=>[sheet,deferred()]));
 const requests=[];const bodyReads=[];let settled=false;
 const report=readLeads((url,options)=>{
   const parsed=new URL(url);const sheet=parsed.searchParams.get('sheet');
   requests.push({sheet,url:parsed,options});
   return responses.get(sheet).promise;
 });
 report.then(()=>{settled=true;},()=>{settled=true;});
 assert.deepEqual(requests.map(request=>request.sheet),[...fixtures.keys()],'all three requests start before any response resolves');
 for(const {sheet,url,options} of requests) {
   assert.equal(options.cache,'no-store');assert.ok(options.signal instanceof AbortSignal);assert.equal(options.signal.aborted,false);
   assert.equal(url.searchParams.get('tq'),sheet==='lead'?'select A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q':sheet==='Customer'?'select A,B,D,E,F':'select A,B,C,D,E,F,G,H,I,J');
   assert.equal(url.searchParams.get('tqx'),sheet==='lead'?'out:json':'out:csv');
   if(sheet==='Customer')assert.equal(url.searchParams.has('_'),false);else assert.match(url.searchParams.get('_'),/^\d+$/);
 }
 const resolveResponse=sheet=>responses.get(sheet).resolve({ok:true,text:()=>{bodyReads.push(sheet);return bodies.get(sheet).promise;}});
 resolveResponse('ประวัติการติดต่อ');await Promise.resolve();
 assert.deepEqual(bodyReads,['ประวัติการติดต่อ'],'history can begin consuming its body while lead and Customer responses are pending');
 assert.equal(settled,false);
 resolveResponse('lead');resolveResponse('Customer');await Promise.resolve();
 assert.deepEqual(new Set(bodyReads),new Set(fixtures.keys()),'all response bodies start before any body completes');
 bodies.get('lead').resolve(fixtures.get('lead'));bodies.get('Customer').resolve(fixtures.get('Customer'));await Promise.resolve();
 assert.equal(settled,false,'the report waits for the history body instead of returning partial leads');
 bodies.get('ประวัติการติดต่อ').resolve(fixtures.get('ประวัติการติดต่อ'));
 const result=await report;
 assert.equal(result.leads.length,1);assert.equal(result.leads[0].leadId,'L-1');assert.equal(result.leads[0].customerId,'C-1');
 assert.equal(result.leads[0].sheetData.date,'2026-10-01');assert.equal(result.leads[0].sheetData.time,'10:00:00');assert.equal(result.leads[0].historyCount,1);
 assert.deepEqual(result.leads[0].contactHistory,[{id:'H-1',at:'2026-10-01T11:30:00',by:'พลอย',text:'โทรติดตาม'}]);
});

test('rejects the full report instead of returning partial leads when any sheet request fails',async()=>{
 const failures=new Map([['lead','อ่านชีต lead ไม่สำเร็จ'],['Customer','ตรวจชีต Customer ไม่สำเร็จ'],['ประวัติการติดต่อ','อ่านจำนวนประวัติการติดต่อไม่สำเร็จ']]);
 for(const [failedSheet,errorMessage] of failures) {
   const fixtures=sheetFixtures();const responses=new Map([...fixtures.keys()].map(sheet=>[sheet,deferred()]));
   const started=[];let returnedResult;
   const report=readLeads(url=>{const sheet=new URL(url).searchParams.get('sheet');started.push(sheet);return responses.get(sheet).promise;});
   report.then(result=>{returnedResult=result;},()=>{});
   assert.deepEqual(started,[...fixtures.keys()]);
   for(const [sheet,text] of fixtures)if(sheet!==failedSheet)responses.get(sheet).resolve({ok:true,text:async()=>text});
   await Promise.resolve();
   assert.equal(returnedResult,undefined,'successful sheets must not produce a partial report');
   responses.get(failedSheet).resolve({ok:false,text:async()=>{throw Error('an unsuccessful response body must not be read');}});
   await assert.rejects(report,{message:errorMessage});
   assert.equal(returnedResult,undefined);
 }
});

test('rejects the full report when an independent response body fails',async()=>{
 const fixtures=sheetFixtures();const failure=Error('Customer response body failed');let returnedResult;
 const report=readLeads(async url=>({ok:true,text:async()=>{
   const sheet=new URL(url).searchParams.get('sheet');if(sheet==='Customer')throw failure;return fixtures.get(sheet);
 }}));
 report.then(result=>{returnedResult=result;},()=>{});
 await assert.rejects(report,error=>error===failure);assert.equal(returnedResult,undefined);
});
