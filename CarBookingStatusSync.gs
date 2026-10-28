
function carBookingStatusPlan_(leadRows, customerRows, bookingRows) {
  const norm=v=>String(v||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  const phone=v=>{let p=String(v||'').replace(/\D/g,'');return p.startsWith('66')&&p.length===11?'0'+p.slice(2):p;};
  const text=v=>String(v||'').trim();
  const dateKey=v=>{
    const t=text(v),iso=/^(\d{4})-(\d{2})-(\d{2})(?:\b|T)/.exec(t),local=/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\b|\s|,)/.exec(t);
    let key='';
    if(iso)key=iso[1]+'-'+iso[2]+'-'+iso[3];
    else if(local){let y=+local[3];if(y>2400)y-=543;else if(y<100)y+=y>=40?1957:2000;key=y+'-'+local[2].padStart(2,'0')+'-'+local[1].padStart(2,'0');}
    const date=new Date(key+'T00:00:00Z');return key&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===key?key:'';
  };
  const unique=(rows,key)=>{const seen=new Set();for(const row of rows){const id=text(row[key]);if(id&&seen.has(id))throw new Error(key+' ซ้ำ จึงยังไม่ปรับสถานะลีด');if(id)seen.add(id);}return seen;};
  const leadIds=unique(leadRows,'Lead ID'),customerIds=unique(customerRows,'CustID');unique(bookingRows,'JobID');
  const latest=new Map(),latestByLead=new Map(),blocked=new Set(),blockedLeads=new Set();
  bookingRows.forEach((b,i)=>{
    const id=text(b.CustID),own=text(b['Lead ID']);if(!id||!text(b.JobID))return;
    if(!customerIds.has(id)||own&&!leadIds.has(own))throw new Error('คิวอ้างอิงลูกค้าหรือ Lead ที่ไม่พบ จึงยังไม่ปรับสถานะ');
    const date=dateKey(b['วันที่ติดตั้ง']);if(!date){if(own)blockedLeads.add(own);else blocked.add(id);return;}
    const key=date+' '+String(b['เวลานัด']||'00:00').padStart(5,'0'),target=own?latestByLead:latest,slot=own||id,prev=target.get(slot);
    if(own&&prev&&text(prev.row.CustID)!==id)throw new Error('Lead เดียวอ้างอิงลูกค้าหลายรหัส จึงยังไม่ปรับสถานะ');
    if(!prev||key>prev.key||key===prev.key&&i>prev.index)target.set(slot,{row:b,key,index:i});
  });
  // The verified release 97 fallback matches customers by phone only; profile names are not stable identifiers.
  const matches=lead=>customerRows.filter(c=>{const p=phone(lead['เบอร์โทร']);return !!p&&p===phone(c['เบอร์โทรศัพท์']);});
  const legacyOwners=new Map();
  for(const lead of leadRows){if(!text(lead['Lead ID'])||latestByLead.has(text(lead['Lead ID'])))continue;const found=matches(lead);if(found.length===1){const id=text(found[0].CustID);legacyOwners.set(id,(legacyOwners.get(id)||0)+1);}}
  const plan=[],skipped={unmatched:0,ambiguous:0,noQueue:0,otherStatus:0,missingDate:0,missingLeadId:0,keptStatus:0};
  leadRows.forEach((lead,i)=>{
    const leadId=text(lead['Lead ID']);if(!leadId){skipped.missingLeadId++;return;}
    if(blockedLeads.has(leadId)){skipped.missingDate++;return;}
    let selected=latestByLead.get(leadId),cid=selected?text(selected.row.CustID):'';
    if(!selected){
      const found=matches(lead);if(found.length!==1){skipped[found.length?'ambiguous':'unmatched']++;return;}
      cid=text(found[0].CustID);if(legacyOwners.get(cid)>1){skipped.ambiguous++;return;}
      if(blocked.has(cid)){skipped.missingDate++;return;}
      selected=latest.get(cid);if(!selected){skipped.noQueue++;return;}
      const current=norm(lead['สถานะการติดตาม']);
      if(current.includes('ปิดการขาย')||dateKey(lead['วันที่'])&&selected.key.slice(0,10)<dateKey(lead['วันที่'])){skipped.keptStatus++;return;}
    }
    const status=String(selected.row.Status||'').trim();
    if(status==='ยกเลิก'&&(!dateKey(lead['วันที่'])||selected.key.slice(0,10)<dateKey(lead['วันที่'])||/เลื่อนติดตั้ง|ยกเลิก/.test(text(lead['สถานะการติดตาม'])))){skipped.keptStatus++;return;}
    const rule=status==='คิวใหม่'||status==='กำลังติดตั้ง'?{status:'🟢 มัดจำ/นัดติดตั้งแล้ว',text:'นัดคิวติดตั้งแล้ว',historyKey:'คิวใหม่'}:status==='เสร็จสิ้น'?{status:'✅ ปิดการขายสำเร็จ',text:'ติดตั้งเรียบร้อย ปิดการขายสำเร็จ',historyKey:'เสร็จสิ้น'}:status==='ยกเลิก'?{status:'❌ ยกเลิก / ไม่สนใจ',text:'ยกเลิกคิวติดตั้ง',historyKey:'ยกเลิก'}:null;
    if(!rule){skipped.otherStatus++;return;}
    plan.push({row:i+2,leadId,customerId:cid,jobId:text(selected.row.JobID),bookingStatus:status,previous:lead['สถานะการติดตาม'],channel:lead['ช่องทางติดต่อ'],status:rule.status,text:rule.text,contactId:'CAR-BOOKING:'+leadId+':'+text(selected.row.JobID)+':'+rule.historyKey});
  });return {plan:plan,skipped:skipped};
}
function carReadStatusSyncTable_(book,name,required) {
  const sheet=book.getSheetByName(name);if(!sheet)throw new Error('ไม่พบชีต '+name);
  const rows=sheet.getDataRange().getDisplayValues(),headers=rows.shift();
  if(required.some(h=>!headers.includes(h)))throw new Error('หัวคอลัมน์ '+name+' ไม่ครบ');
  return {sheet:sheet,headers:headers,rows:rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])))};
}
function syncCarBookingStatuses_(onlyCustomer, onlyLeadId) {
  const book=SpreadsheetApp.openById(SHEET_ID);
  const leads=carReadStatusSyncTable_(book,'lead',['Lead ID','เบอร์โทร','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ','สถานะการติดตาม']);
  if(leads.sheet.getSheetId()!==1814698691)throw new Error('ชีต lead ไม่ตรง');
  const customers=carReadStatusSyncTable_(book,'Customer',['CustID','เบอร์โทรศัพท์','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ']);
  const bookings=carReadStatusSyncTable_(book,'Bookings',['JobID','CustID','วันที่ติดตั้ง','เวลานัด','Status']);
  const history=carReadStatusSyncTable_(book,'ประวัติการติดต่อ',['Contact ID','Lead ID','Customer ID','วันเวลาติดต่อ','ช่องทาง','เรื่องที่คุย','ผลการติดต่อ','ผู้ดูแล']);
  const result=carBookingStatusPlan_(leads.rows,customers.rows,bookings.rows), si=leads.headers.indexOf('สถานะการติดตาม')+1;
  const targetLeadId=String(onlyLeadId||'').trim();
  const targetRows=targetLeadId?leads.rows.map((lead,index)=>({lead:lead,row:index+2})).filter(item=>String(item.lead['Lead ID']).trim()===targetLeadId):[];
  if(targetLeadId&&targetRows.length!==1)throw new Error('ไม่พบ Lead ID ที่ตรงเพียงรายการเดียวสำหรับตรวจคิวติดตั้ง');
  const plan=result.plan.filter(p=>(!onlyCustomer||p.customerId===String(onlyCustomer).trim())&&(!targetLeadId||p.leadId===targetLeadId));
  const deletedByLead=new Map();
  if(plan.length){
    const nameColumn=leads.headers.indexOf('ชื่อลูกค้า')+1;
    if(!nameColumn)throw new Error('ไม่พบคอลัมน์ชื่อลูกค้าสำหรับประวัติที่ลบ');
    const notes=leads.sheet.getRange(2,nameColumn,leads.rows.length,1).getNotes(),counts=new Map();
    for(const lead of leads.rows){const id=String(lead['Lead ID']||'').trim();if(id)counts.set(id,(counts.get(id)||0)+1);}
    for(const p of plan){
      if(counts.get(p.leadId)!==1)throw new Error('Lead ID ซ้ำ กรุณาตรวจสอบก่อนบันทึกประวัติ');
      if(!deletedByLead.has(p.leadId))deletedByLead.set(p.leadId,new Set(carParseDeletedContactHistoryIds_((notes[p.row-2]||[''])[0])));
    }
  }
  for(const p of plan){if(leads.sheet.getRange(p.row,si).getFormula())throw new Error('พบสูตรในสถานะ');const old=history.rows.filter(h=>h['Contact ID']===p.contactId);if(old.length>1||old.some(h=>h['Lead ID']!==p.leadId||h['เรื่องที่คุย']!==p.text))throw new Error('รหัสประวัติขัดแย้ง');}
  let updated=0,added=0;
  for(const p of plan){
    if(!history.rows.some(h=>h['Contact ID']===p.contactId)&&!deletedByLead.get(p.leadId).has(p.contactId)){
      const record={'Contact ID':p.contactId,'Lead ID':p.leadId,'Customer ID':p.customerId,'วันเวลาติดต่อ':Utilities.formatDate(new Date(),'Asia/Bangkok','yyyy-MM-dd HH:mm:ss'),'ช่องทาง':p.channel,'เรื่องที่คุย':p.text,'ผลการติดต่อ':p.status,'ผู้ดูแล':'ระบบ'};
      const values=history.headers.map(h=>String(record[h]||'')),range=history.sheet.getRange(history.sheet.getLastRow()+1,1,1,history.headers.length);
      range.setNumberFormat('@').setValues([values.map(v=>/^[=+\-@]/.test(v)?"'"+v:v)]);SpreadsheetApp.flush();
      if(!range.getDisplayValues()[0].every((v,i)=>v===values[i]))throw new Error('ตรวจประวัติไม่สำเร็จ');history.rows.push(record);added++;
    }
    const cell=leads.sheet.getRange(p.row,si);
    if(cell.getDisplayValue()!==p.status){cell.setValue(p.status);SpreadsheetApp.flush();if(cell.getDisplayValue()!==p.status)throw new Error('ตรวจสถานะไม่สำเร็จ');updated++;}
  }
  const response={matched:plan.length,updated:updated,historyAdded:added,skipped:result.skipped};
  if(targetLeadId){
    response.followUp=leads.sheet.getRange(targetRows[0].row,si).getDisplayValue();
    response.contactHistory=history.rows.filter(h=>String(h['Lead ID']).trim()===targetLeadId).map(h=>({id:String(h['Contact ID']),at:String(h['วันเวลาติดต่อ']).replace(' ','T'),by:String(h['ผู้ดูแล']||''),text:String(h['เรื่องที่คุย']||'')}));
    response.historyCount=response.contactHistory.length;
  }
  return response;
}
function previewCarBookingStatusesNow() {
  const book=SpreadsheetApp.openById(SHEET_ID);
  const leads=carReadStatusSyncTable_(book,'lead',['Lead ID','สถานะการติดตาม']);
  if(leads.sheet.getSheetId()!==1814698691)throw new Error('ชีต lead ไม่ตรง');
  const customers=carReadStatusSyncTable_(book,'Customer',['CustID','เบอร์โทรศัพท์','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ']);
  const bookings=carReadStatusSyncTable_(book,'Bookings',['JobID','CustID','วันที่ติดตั้ง','เวลานัด','Status']);
  const result=carBookingStatusPlan_(leads.rows,customers.rows,bookings.rows);
  Logger.log(JSON.stringify({changes:result.plan.filter(p=>p.previous!==p.status).map(p=>({leadId:p.leadId,jobId:p.jobId,from:p.previous,to:p.status})),skipped:result.skipped}));
}
function syncCarBookingStatusesNow() {
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {Logger.log(JSON.stringify(syncCarBookingStatuses_()));}finally{lock.releaseLock();}
}
