function syncCarContactHistory_(book, leadId, data) {
  const history = data.contactHistory || splitCarHistoryNote_(data['*หมายเหตุ']).history;
  if (!Array.isArray(history)) throw new Error('ประวัติการติดต่อไม่ถูกต้อง');
  const sheet = book.getSheetByName('ประวัติการติดต่อ');
  if (!sheet) throw new Error('ไม่พบชีตประวัติการติดต่อ');
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  const required = ['Contact ID','Lead ID','วันเวลาติดต่อ','ช่องทาง','เรื่องที่คุย','ผู้ดูแล'];
  if (required.some(name => !headers.includes(name))) throw new Error('หัวคอลัมน์ประวัติการติดต่อไม่ครบ');
  const idCol = headers.indexOf('Contact ID'), leadCol = headers.indexOf('Lead ID');
  const rows = sheet.getLastRow()>1 ? sheet.getRange(2,1,sheet.getLastRow()-1,headers.length).getDisplayValues() : [];
  for (const item of history) {
    if (!item.id || !item.at || typeof item.text !== 'string' || typeof item.by !== 'string') throw new Error('ข้อมูลประวัติไม่ครบ');
    const id = String(item.id);
    const existing = rows.filter(row => row[idCol] === id);
    if (existing.length > 1 || existing.some(row => row[leadCol] !== leadId)) throw new Error('รหัสประวัติซ้ำกับลีดอื่น');
    if (existing.length) continue;
    const record = {'Contact ID':id,'Lead ID':leadId,'วันเวลาติดต่อ':String(item.at).replace('T',' '),'ช่องทาง':String(data['ช่องทางติดต่อ'] || ''),'เรื่องที่คุย':item.text,'ผู้ดูแล':item.by};
    const values = headers.map(name => String(record[name] || ''));
    const target = sheet.getLastRow()+1;
    sheet.getRange(target,1,1,headers.length).setNumberFormat('@').setValues([values.map(value => /^[=+\-@]/.test(value) ? "'"+value : value)]);
    SpreadsheetApp.flush();
    const saved = sheet.getRange(target,1,1,headers.length).getDisplayValues()[0];
    if (!values.every((value,i) => saved[i] === value)) throw new Error('ยืนยันประวัติการติดต่อไม่สำเร็จ กรุณาลองบันทึกซ้ำ');
    rows.push(saved);
  }
  return history.length;
}
function migrateCarContactHistory() {
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const book=SpreadsheetApp.openById(SHEET_ID), sheet=book.getSheetByName('lead');
    const rows=sheet.getDataRange().getDisplayValues(), headers=rows[0], idCol=headers.indexOf('Lead ID');
    if(idCol<0)throw new Error('ไม่พบ Lead ID');
    let total=0;
    for(let i=1;i<rows.length;i++) {
      const data=Object.fromEntries(headers.map((name,j)=>[name,rows[i][j]]));
      if(!String(data['*หมายเหตุ']||'').includes('[CAR_CONTACT_HISTORY_V1]'))continue;
      let id=rows[i][idCol];
      if(!id){id='L-'+Utilities.getUuid();sheet.getRange(i+1,idCol+1).setNumberFormat('@').setValue(id);SpreadsheetApp.flush();}
      total+=syncCarContactHistory_(book,id,data);
    }
    Logger.log('Contact history verified: '+total);
  } finally {lock.releaseLock();}
}

function splitCarHistoryNote_(value) {
  const text=String(value||''), marker='[CAR_CONTACT_HISTORY_V1]';
  let cursor=0, note='', history=[];
  while(true) {
    const at=text.indexOf(marker,cursor);
    if(at<0){note+=text.slice(cursor);break;}
    note+=text.slice(cursor,at).replace(/\r?\n\s*$/, '').replace(/\r?\n$/, '');
    let start=at+marker.length;while(/\s/.test(text[start]||'') && start<text.length)start++;
    if(text[start]!=='[')throw new Error('ประวัติการติดต่อไม่ถูกต้อง');
    let depth=0, quoted=false, escaped=false, end=-1;
    for(let i=start;i<text.length;i++) {
      const ch=text[i];
      if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue;}
      if(ch==='"'){quoted=true;continue;}
      if(ch==='[')depth++;
      if(ch===']' && --depth===0){end=i+1;break;}
    }
    if(end<0)throw new Error('ประวัติการติดต่อไม่ครบ');
    const items=JSON.parse(text.slice(start,end));
    for(const item of items) {
      const old=history.find(h=>h.id===item.id);
      if(old && JSON.stringify(old)!==JSON.stringify(item))throw new Error('รหัสประวัติซ้ำแต่ข้อมูลต่างกัน');
      if(!old)history.push(item);
    }
    cursor=end;
  }
  return {note:note,history:history};
}
function cleanCarHistoryNotes() {
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    const book=SpreadsheetApp.openById(SHEET_ID), sheet=book.getSheetByName('lead'), historySheet=book.getSheetByName('ประวัติการติดต่อ');
    if(!sheet||sheet.getSheetId()!==1814698691||!historySheet)throw new Error('ไม่พบชีตที่กำหนด');
    const rows=sheet.getDataRange().getDisplayValues(), headers=rows[0], ni=headers.indexOf('*หมายเหตุ'), li=headers.indexOf('Lead ID');
    if(ni<0||li<0)throw new Error('หัวคอลัมน์ไม่ครบ');
    const plan=[];
    for(let i=1;i<rows.length;i++) {
      if(!rows[i][ni].includes('[CAR_CONTACT_HISTORY_V1]'))continue;
      const cell=sheet.getRange(i+1,ni+1);if(cell.getFormula())throw new Error('พบสูตรในหมายเหตุ');
      const parsed=splitCarHistoryNote_(rows[i][ni]), id=rows[i][li];
      if(!id)throw new Error('Lead ID ว่าง แถว '+(i+1));
      const data=Object.fromEntries(headers.map((h,j)=>[h,rows[i][j]]));
      syncCarContactHistory_(book,id,data);
      const saved=historySheet.getDataRange().getDisplayValues(), hh=saved.shift();
      for(const item of parsed.history) {
        if(!saved.some(r=>r[hh.indexOf('Contact ID')]===item.id&&r[hh.indexOf('Lead ID')]===id&&r[hh.indexOf('เรื่องที่คุย')]===item.text&&r[hh.indexOf('ผู้ดูแล')]===item.by))throw new Error('ประวัติไม่ตรง แถว '+(i+1));
      }
      plan.push({cell:cell,note:parsed.note,original:rows[i][ni]});
    }
    for(const item of plan) {
      if(item.cell.getDisplayValue()!==item.original)throw new Error('ข้อมูลเปลี่ยนระหว่างตรวจ');
      item.cell.setValue(/^[=+\-@]/.test(item.note)?"'"+item.note:item.note);
      SpreadsheetApp.flush();
      if(item.cell.getDisplayValue()!==item.note)throw new Error('ตรวจหมายเหตุไม่ผ่าน');
    }
    Logger.log('Cleaned notes: '+plan.length+'; all contact history verified');
  } finally {lock.releaseLock();}
}
