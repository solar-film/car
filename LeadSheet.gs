// Additive CAR lead API. Keep the worksheet's existing columns and other APIs.
var CAR_CONTACT_HISTORY_DELETE_VERSION_ = 1;
function upsertCarLeadSheet_(body) {
  const columns = ['วันที่','Admin','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ','ชื่อลูกค้า','เบอร์โทร','ยี่ห้อรถยนต์','รุ่นรถยนต์','ตำแหน่งติดตั้ง * (เลือกได้หลายตำแหน่ง)','ยี่ห้อที่สนใจ','รุ่นที่สนใจ','งบประมาณ','ประเภทลูกค้า','รู้จักเราจาก','สถานะการติดตาม','*หมายเหตุ'];
  if (body.sheetName !== 'lead') throw new Error('upsertLead รองรับเฉพาะชีต lead');
  const key = String(body.leadKey || '');
  if (!key || key.length > 600 || /[\r\n]/.test(key)) throw new Error('ไม่พบรหัสรายการสำหรับป้องกันข้อมูลซ้ำ');
  const data = body.data || {};
  if (!String(data['ชื่อลูกค้า'] || '').trim()) throw new Error('กรอกชื่อลูกค้า');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data['วันที่'] || ''))) throw new Error('กรอกวันที่ให้ถูกต้อง');
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('lead');
  if (!sheet || sheet.getSheetId() !== 1814698691) throw new Error('ไม่พบชีต lead ที่กำหนด');
  const header = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  const indices = columns.map(name => header.indexOf(name));
  if (indices.some(index => index < 0)) throw new Error('หัวคอลัมน์ lead เปลี่ยนแปลง กรุณาตรวจโครงสร้างชีต');
  const leadIdColumn = header.indexOf('Lead ID') + 1;
  if (!leadIdColumn) throw new Error('กรุณาเพิ่มหัวคอลัมน์ Lead ID ในชีต lead');
  const nameColumn = indices[4] + 1;
  const marker = 'CAR-LEAD-KEY:' + key;
  const lastRow = sheet.getLastRow();
  const notes = lastRow > 1 ? sheet.getRange(2,nameColumn,lastRow-1,1).getNotes() : [];
  const matches = notes.flatMap((row,index) => String(row[0]).split('\n').includes(marker) ? [index+2] : []);
  if (matches.length > 1) throw new Error('พบรหัสลีดซ้ำ กรุณาตรวจข้อมูลก่อนแก้ไข');
  const normalize = (value,index) => {
      if (index === 0 && value instanceof Date) return Utilities.formatDate(value,'Asia/Bangkok','yyyy-MM-dd');
      const text = String(value == null ? '' : value).trim();
      if (index === 11 && /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return String(Number(text.replace(/,/g,'')));
      return text;
    };
  const digest = value => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value), Utilities.Charset.UTF_8).map(byte => (byte & 255).toString(16).padStart(2,'0')).join('');
  const snapshot = row => columns.map((name,i) => normalize(row[indices[i]],i));
  const requestHash = digest({data:body.data,previous:body.previous || null});
  const statePrefix = 'CAR-LEAD-STATE:';
  let target = matches[0] || Math.max(2,lastRow+1);
  if (body.action === 'updateLeadSheet' && !matches.length) {
    if (!body.previous || columns.some(name => !Object.prototype.hasOwnProperty.call(body.previous,name))) throw new Error('ไม่พบข้อมูลเดิมสำหรับตรวจสอบก่อนแก้ไข');
    const rows = lastRow > 1 ? sheet.getRange(2,1,lastRow-1,header.length).getValues() : [];
    const found = rows.flatMap((row,index) => (!body.leadId || String(row[leadIdColumn-1]).trim() === String(body.leadId).trim()) && columns.every((name,i) => normalize(row[indices[i]],i) === normalize(body.previous[name],i)) ? [index+2] : []);
    if (found.length !== 1) throw new Error(found.length ? 'พบข้อมูลเดิมซ้ำหลายแถว จึงยังไม่แก้ไข กรุณาตรวจชีต lead' : 'ข้อมูลเดิมเปลี่ยนไปแล้ว กรุณาปิดหน้าต่างและโหลดรายการใหม่ก่อนแก้ไข');
    target = found[0];
  }
  if (matches.length) {
    const current = sheet.getRange(target,1,1,header.length).getValues()[0];
    const stateLine = String(notes[target-2][0]).split('\n').find(line => line.startsWith(statePrefix));
    let state = null;
    try { state = stateLine ? JSON.parse(stateLine.slice(statePrefix.length)) : null; } catch (_) {}
    const retry = state && state.request === requestHash && (state.saved === null || state.saved === digest(snapshot(current)));
    if (!retry) {
      if (state && state.saved === null) throw new Error('รายการนี้บันทึกยังไม่ครบ กรุณาลองบันทึกคำขอเดิมก่อนแก้ไขใหม่');
      if (!body.previous || columns.some(name => !Object.prototype.hasOwnProperty.call(body.previous,name))) throw new Error('ไม่พบข้อมูลเดิมสำหรับตรวจสอบก่อนแก้ไข กรุณาโหลดรายการใหม่');
      if (!columns.every((name,i) => normalize(current[indices[i]],i) === normalize(body.previous[name],i))) throw new Error('ข้อมูลเดิมเปลี่ยนไปแล้ว กรุณาปิดหน้าต่างและโหลดรายการใหม่ก่อนแก้ไข');
    }
  }
  const parsedHistory = splitCarHistoryNote_(data['*หมายเหตุ']);
  data.contactHistory = data.contactHistory || parsedHistory.history;
  data['*หมายเหตุ'] = parsedHistory.note;
  const values = columns.map(name => String(data[name] || '').trim());
  if (values.some(value => value.length > 5000)) throw new Error('ข้อมูลแต่ละช่องต้องไม่เกิน 5000 ตัวอักษร');
  let date = Utilities.parseDate(values[0], 'Asia/Bangkok', 'yyyy-MM-dd');
  if (Utilities.formatDate(date,'Asia/Bangkok','yyyy-MM-dd') !== values[0]) throw new Error('วันที่ไม่ถูกต้อง');
  const existingDate = sheet.getRange(target,indices[0]+1).getValues()[0][0];
  const time = Utilities.formatDate(existingDate instanceof Date ? existingDate : new Date(),'Asia/Bangkok','HH:mm:ss');
  const timestamp = values[0] + ' ' + time;
  date = Utilities.parseDate(timestamp,'Asia/Bangkok','yyyy-MM-dd HH:mm:ss');
  const idCell = sheet.getRange(target,leadIdColumn);
  let leadId = String(idCell.getValues()[0][0] || '').trim();
  if(!leadId && data.deletedContactHistory !== undefined && (!Array.isArray(data.deletedContactHistory) || data.deletedContactHistory.length))throw new Error('บันทึกลีดก่อนลบประวัติ');
  if (!leadId) {
    const prefix = 'L-' + Utilities.formatDate(new Date(),'Asia/Bangkok','yyMMdd') + '-';
    const used = new Set(lastRow > 1 ? sheet.getRange(2,leadIdColumn,lastRow-1,1).getValues().map(row => String(row[0]).trim()) : []);
    const start = Math.floor(Math.random() * 4096);
    for (let offset = 0; offset < 4096; offset++) {
      const candidate = prefix + ((start + offset) % 4096).toString(16).toUpperCase().padStart(3,'0');
      if (!used.has(candidate)) { leadId = candidate; break; }
    }
    if (!leadId) throw new Error('รหัส Lead ID ของวันนี้เต็มแล้ว');
  }
  const historyDeletion=planCarContactHistoryDeletion_(SpreadsheetApp.openById(SHEET_ID),leadId,data);
  const nameCell = sheet.getRange(target,nameColumn);
  const writeState = saved => {
    const baseNotes=nameCell.getNote().split('\n').filter(line=>!line.startsWith(statePrefix));
    if(!baseNotes.includes(marker))baseNotes.push(marker);
    return nameCell.setNote([...baseNotes,statePrefix + JSON.stringify({request:requestHash,saved:saved})].filter(Boolean).join('\n'));
  };
  writeState(null);
  if (leadId) idCell.setNumberFormat('@').setValue(leadId);
  // Reserve the row before writing so an interrupted request can retry the same row.
  SpreadsheetApp.flush();
  // Write only the known columns; preserve unrelated cells, formatting and validation.
  columns.forEach((name,index) => {
    const cell = sheet.getRange(target,indices[index]+1);
    if (index === 0) cell.setValue(date).setNumberFormat('d/M/yyyy, HH:mm:ss');
    else {
      cell.setNumberFormat('@');
      cell.setValue(/^[=+\-@]/.test(values[index]) ? "'" + values[index] : values[index]);
    }
  });
  SpreadsheetApp.flush();
  const saved = sheet.getRange(target,1,1,header.length).getValues()[0];
  const verified = columns.every((name,index) => index === 0
    ? saved[indices[index]] instanceof Date && Utilities.formatDate(saved[indices[index]],'Asia/Bangkok','yyyy-MM-dd HH:mm:ss') === timestamp
    : String(saved[indices[index]]) === values[index]);
  if (!verified || String(saved[leadIdColumn-1] || '').trim() !== leadId || !nameCell.getNote().split('\n').includes(marker)) throw new Error('ยังตรวจยืนยันข้อมูลที่บันทึกไม่ได้ กรุณาลองซ้ำด้วยรายการเดิม');
  applyCarContactHistoryDeletion_(SpreadsheetApp.openById(SHEET_ID),leadId,historyDeletion);
  syncCarContactHistory_(SpreadsheetApp.openById(SHEET_ID),leadId,data);
  let bookingSync;
  try { bookingSync=syncCarBookingStatuses_('',leadId); }
  catch(error) { throw new Error('บันทึกลีดแล้ว แต่ยังตรวจคิวติดตั้งไม่สำเร็จ กรุณาบันทึกซ้ำด้วยรายการเดิม: '+error.message); }
  if(historyDeletion.ids.some(id=>bookingSync.contactHistory.some(item=>item.id===id)))throw new Error('ประวัติที่ลบกลับมาอีกครั้ง กรุณาตรวจเวอร์ชันการบันทึกคิวติดตั้ง');
  writeState(digest(snapshot(sheet.getRange(target,1,1,header.length).getValues()[0])));
  SpreadsheetApp.flush();
  return jsonOutput_({success:true,historyVerified:true,historyDeletionVerified:true,deletedContactHistoryIds:historyDeletion.ids,historyCount:bookingSync.historyCount,followUp:bookingSync.followUp,contactHistory:bookingSync.contactHistory,sheetName:'lead',leadKey:key,leadId:leadId,rowNumber:target,verified:true,action:matches.length || body.action === 'updateLeadSheet' ? 'update' : 'insert'});
}
