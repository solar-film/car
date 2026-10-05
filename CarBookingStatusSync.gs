
function carBookingStatusPlan_(leadRows, customerRows, bookingRows) {
  const norm=v=>String(v||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  const phone=v=>{let p=String(v||'').replace(/\D/g,'');return p.startsWith('66')&&p.length===11?'0'+p.slice(2):p;};
  const dateKey=v=>{const t=String(v||'').trim();if(/^\d{4}-\d{2}-\d{2}/.test(t))return t.slice(0,10);const m=/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t);if(!m)return '';let y=+m[3];if(y>2400)y-=543;else if(y<100)y+=y>=40?1957:2000;return y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');};
  const latest=new Map(), blocked=new Set();
  bookingRows.forEach((b,i)=>{const id=String(b.CustID||'').trim();if(!id||!b.JobID)return;const date=dateKey(b['วันที่ติดตั้ง']);if(!date){blocked.add(id);return;}const key=date+' '+String(b['เวลานัด']||'00:00').padStart(5,'0');const prev=latest.get(id);if(!prev||key>prev.key||key===prev.key&&i>prev.index)latest.set(id,{row:b,key:key,index:i});});
  const plan=[],skipped={unmatched:0,ambiguous:0,noQueue:0,otherStatus:0,missingDate:0,missingLeadId:0};
  leadRows.forEach((lead,i)=>{
    if(!lead['Lead ID']){skipped.missingLeadId++;return;}
    const matches=customerRows.filter(c=>{const p=phone(lead['เบอร์โทร']);if(p&&p===phone(c['เบอร์โทรศัพท์']))return true;const contact=norm(lead['ชื่อช่องทางติดต่อ']);return contact&&!['-','—'].includes(contact)&&norm(lead['ช่องทางติดต่อ'])&&norm(lead['ช่องทางติดต่อ'])===norm(c['ช่องทางติดต่อ'])&&contact===norm(c['ชื่อช่องทางติดต่อ']);});
    if(matches.length!==1){skipped[matches.length?'ambiguous':'unmatched']++;return;}
    const cid=String(matches[0].CustID||'').trim();if(blocked.has(cid)){skipped.missingDate++;return;}
    const selected=latest.get(cid);if(!selected){skipped.noQueue++;return;}
    const status=String(selected.row.Status||'').trim();
    const rule=status==='คิวใหม่'?{status:'🟢 มัดจำ/นัดติดตั้งแล้ว',text:'นัดคิวติดตั้งแล้ว'}:status==='เสร็จสิ้น'?{status:'✅ ปิดการขายสำเร็จ',text:'ติดตั้งเรียบร้อย ปิดการขายสำเร็จ'}:null;
    if(!rule){skipped.otherStatus++;return;}
    plan.push({row:i+2,leadId:String(lead['Lead ID']).trim(),customerId:cid,jobId:String(selected.row.JobID).trim(),bookingStatus:status,previous:lead['สถานะการติดตาม'],channel:lead['ช่องทางติดต่อ'],status:rule.status,text:rule.text,contactId:'CAR-BOOKING:'+lead['Lead ID']+':'+selected.row.JobID+':'+status});
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
