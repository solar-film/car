function carContactHistoryLead_(book, leadId) {
  const sheet=book.getSheetByName('lead');
  if(!sheet || sheet.getSheetId()!==1814698691)throw new Error('ไม่พบชีต lead ที่กำหนด');
  const rows=sheet.getDataRange().getDisplayValues(), headers=rows.shift();
  const idColumn=headers.indexOf('Lead ID'),nameColumn=headers.indexOf('ชื่อลูกค้า'),noteColumn=headers.indexOf('*หมายเหตุ');
  if([idColumn,nameColumn,noteColumn].some(index=>index<0))throw new Error('หัวคอลัมน์ lead ไม่ครบ');
  const found=rows.flatMap((row,index)=>String(row[idColumn]||'').trim()===String(leadId).trim()?[{row:row,index:index+2}]:[]);
  if(found.length!==1)throw new Error('ไม่พบ Lead ID ที่ตรงเพียงรายการเดียวสำหรับประวัติ');
  return {sheet:sheet,nameCell:sheet.getRange(found[0].index,nameColumn+1),note:found[0].row[noteColumn]||''};
}
function carParseDeletedContactHistoryIds_(note) {
  const prefix='CAR-HISTORY-DELETED:';
  const lines=String(note||'').split('\n').filter(line=>line.startsWith(prefix));
  if(lines.length>1)throw new Error('ข้อมูลประวัติที่ลบซ้ำ กรุณาตรวจสอบ');
  let ids=[];
  try { if(lines.length)ids=JSON.parse(lines[0].slice(prefix.length)); } catch(_) {throw new Error('ข้อมูลประวัติที่ลบไม่ถูกต้อง');}
  if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!id||id.length>600||/[\r\n]/.test(id))||new Set(ids).size!==ids.length)throw new Error('ข้อมูลประวัติที่ลบไม่ถูกต้อง');
  return ids;
}
function carDeletedContactHistoryIds_(book, leadId) {
  return carParseDeletedContactHistoryIds_(carContactHistoryLead_(book,leadId).nameCell.getNote());
}
function carContactHistoryTimestamp_(value) {
  let text=String(value||'').trim();
  const local=/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[,\s]+(\d{1,2}:\d{2}(?::\d{2})?))?$/.exec(text);
  if(local){let year=+local[3];if(year>2400)year-=543;else if(year<100)year+=year>=40?1957:2000;text=year+'-'+local[2].padStart(2,'0')+'-'+local[1].padStart(2,'0')+'T'+(local[4]||'00:00:00');}
  text=text.replace(' ','T');
  if(/^\d{4}-\d{2}-\d{2}$/.test(text))text+='T00:00:00';
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?$/.exec(text);
  if(!match)return NaN;
  const date=new Date(Date.UTC(+match[1],+match[2]-1,+match[3]));
  if(date.getUTCFullYear()!==+match[1]||date.getUTCMonth()!==+match[2]-1||date.getUTCDate()!==+match[3]||+match[4]>23||+match[5]>59||+(match[6]||0)>59)return NaN;
  return Date.parse(match[1]+'-'+match[2]+'-'+match[3]+'T'+match[4].padStart(2,'0')+':'+match[5]+':'+(match[6]||'00')+(match[7]?'.'+match[7]:'')+(match[8]||'+07:00'));
}
function planCarContactHistoryDeletion_(book, leadId, data) {
  const items=data.deletedContactHistory===undefined?[]:data.deletedContactHistory;
  if(!Array.isArray(items)||items.length>500)throw new Error('รายการประวัติที่ลบไม่ถูกต้อง');
  if(!items.length)return {ids:[],rows:[]};
  const lead=carContactHistoryLead_(book,leadId), deleted=new Set(carDeletedContactHistoryIds_(book,leadId));
  const sheet=book.getSheetByName('ประวัติการติดต่อ');
  if(!sheet)throw new Error('ไม่พบชีตประวัติการติดต่อ');
  const rows=sheet.getDataRange().getDisplayValues(),headers=rows.shift();
  const required=['Contact ID','Lead ID','วันเวลาติดต่อ','เรื่องที่คุย','ผู้ดูแล'];
  if(required.some(name=>!headers.includes(name)))throw new Error('หัวคอลัมน์ประวัติการติดต่อไม่ครบ');
  const idCol=headers.indexOf('Contact ID'),leadCol=headers.indexOf('Lead ID'),atCol=headers.indexOf('วันเวลาติดต่อ'),byCol=headers.indexOf('ผู้ดูแล'),textCol=headers.indexOf('เรื่องที่คุย');
  const legacy=splitCarHistoryNote_(lead.note).history, ids=[],targets=[];
  const same=(item,old)=>Number.isFinite(carContactHistoryTimestamp_(item.at))&&carContactHistoryTimestamp_(item.at)===carContactHistoryTimestamp_(old.at)&&item.by===old.by&&item.text===old.text;
  if(!Array.isArray(data.contactHistory))throw new Error('ประวัติการติดต่อไม่ถูกต้อง');
  for(const item of data.contactHistory){
    if(!item||!item.id||!item.at||typeof item.text!=='string'||typeof item.by!=='string')throw new Error('ข้อมูลประวัติไม่ครบ');
    const found=rows.filter(row=>row[idCol]===String(item.id));
    if(found.length>1||found.some(row=>String(row[leadCol]).trim()!==String(leadId).trim()))throw new Error('รหัสประวัติซ้ำกับลีดอื่น');
  }
  for(const item of items){
    if(!item||typeof item.id!=='string'||!item.id||item.id.length>600||/[\r\n]/.test(item.id)||typeof item.at!=='string'||typeof item.by!=='string'||typeof item.text!=='string'||!Number.isFinite(carContactHistoryTimestamp_(item.at))||ids.includes(item.id))throw new Error('รายการประวัติที่ลบไม่ถูกต้อง');
    if(data.contactHistory.some(entry=>entry.id===item.id))throw new Error('ประวัติที่ลบยังอยู่ในรายการบันทึก');
    const found=rows.flatMap((row,index)=>String(row[idCol])===item.id?[{row:row,index:index+2}]:[]);
    if(found.length>1||found.some(target=>String(target.row[leadCol]).trim()!==String(leadId).trim()))throw new Error('รหัสประวัติซ้ำหรือไม่ใช่ลีดนี้');
    if(found.length){
      const target=found[0],old={at:target.row[atCol],by:target.row[byCol],text:target.row[textCol]};
      if(!same(item,old))throw new Error('ประวัติเปลี่ยนไปแล้ว กรุณาปิดหน้าต่างและโหลดใหม่ก่อนลบ');
      if(headers.some((_,index)=>sheet.getRange(target.index,index+1).getFormula()))throw new Error('พบสูตรในประวัติที่ลบ');
      targets.push(target);
    } else if(!deleted.has(item.id)) {
      const old=legacy.filter(entry=>entry.id===item.id);
      if(old.length!==1||!same(item,old[0]))throw new Error('ไม่พบประวัติเดิมที่ตรงสำหรับลบ กรุณาโหลดใหม่');
    }
    ids.push(item.id);deleted.add(item.id);
  }
  const noteLines=lead.nameCell.getNote().split('\n').filter(line=>!line.startsWith('CAR-HISTORY-DELETED:'));
  const note=[...noteLines,'CAR-HISTORY-DELETED:'+JSON.stringify([...deleted])].filter(Boolean).join('\n');
  if(note.length>45000)throw new Error('ข้อมูลประวัติที่ลบเกินขนาดที่รองรับ');
  return {ids:ids,rows:targets,headers:headers,sheet:sheet};
}
function applyCarContactHistoryDeletion_(book, leadId, plan) {
  if(!plan.ids.length)return;
  for(const target of plan.rows){const row=plan.sheet.getRange(target.index,1,1,plan.headers.length).getDisplayValues()[0];if(!row.every((value,index)=>value===target.row[index])||plan.headers.some((_,index)=>plan.sheet.getRange(target.index,index+1).getFormula()))throw new Error('ประวัติเปลี่ยนระหว่างตรวจ กรุณาโหลดใหม่ก่อนลบ');}
  const lead=carContactHistoryLead_(book,leadId),deleted=new Set([...carDeletedContactHistoryIds_(book,leadId),...plan.ids]);
  const lines=lead.nameCell.getNote().split('\n').filter(line=>!line.startsWith('CAR-HISTORY-DELETED:'));
  lead.nameCell.setNote([...lines,'CAR-HISTORY-DELETED:'+JSON.stringify([...deleted])].filter(Boolean).join('\n'));
  SpreadsheetApp.flush();
  if(!plan.ids.every(id=>carDeletedContactHistoryIds_(book,leadId).includes(id)))throw new Error('ยืนยันข้อมูลประวัติที่ลบไม่สำเร็จ');
  for(const target of plan.rows.slice().sort((a,b)=>b.index-a.index)){
    const row=plan.sheet.getRange(target.index,1,1,plan.headers.length).getDisplayValues()[0];
    if(!row.every((value,index)=>value===target.row[index]))throw new Error('ประวัติเปลี่ยนระหว่างลบ กรุณาลองคำขอเดิมใหม่');
    plan.sheet.deleteRow(target.index);
  }
  SpreadsheetApp.flush();
  const rows=plan.sheet.getDataRange().getDisplayValues().slice(1),idCol=plan.headers.indexOf('Contact ID');
  if(rows.some(row=>plan.ids.includes(row[idCol])))throw new Error('ยืนยันการลบประวัติไม่สำเร็จ กรุณาลองคำขอเดิมใหม่');
}
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
  const deleted=new Set(carDeletedContactHistoryIds_(book,leadId));
  for (const item of history) {
    if (!item.id || !item.at || typeof item.text !== 'string' || typeof item.by !== 'string') throw new Error('ข้อมูลประวัติไม่ครบ');
    const id = String(item.id);
    if(deleted.has(id))continue;
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
