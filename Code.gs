// ============================================================
// Google Apps Script — รวม API สำหรับทุก Sheet
// วิธี Deploy:
//   Extensions → Apps Script → วางโค้ดนี้ทับ Code.gs
//   Deploy → New deployment → Web app
//     - Execute as: Me
//     - Who has access: Anyone
//   Copy URL ไปใส่ใน index.html ตัวแปร SCRIPT_URL
// ============================================================

const SHEET_ID = '1u__xYWoWZpmrnquc-Fpk19WtpcrckxSd0-_G35NWxXQ';
const WRITE_TOKEN_PROPERTY = 'CAR_CRM_WRITE_TOKEN';
const PAYIN_IMAGE_FOLDER_ID_PROPERTY = 'CAR_CRM_PAYIN_FOLDER_ID';
const APPSHEET_APP_FOLDER_NAME = 'CAR_CRM-691939189';
const PAYIN_IMAGE_RELATIVE_FOLDER = 'Images/Pay_In';
const PAYIN_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const PAYIN_PROOF_SLOT_COUNT = 4;
const PAYIN_MAX_POST_BYTES = 10 * 1024 * 1024;
const PAYIN_MUTATION_CACHE_SECONDS = 6 * 60 * 60;
const BACKEND_VERSION = '2026-09-23-payin-four-proofs';

// ─── Column definitions ───────────────────────────────────────
const SCHEMA = {
  ความเสียหายอื่นๆ: {
    idPrefix: 'MI',
    idField: 'MI_ID',
    columns: [
      'MI_ID', 'CustID', 'รายการ', 'มูลค่า', 'ช่าง', 'หมายเหตุ',
      'รูปภาพ_1', 'รูปภาพ_2', 'รูปภาพ_3', 'วันที่ลงรายการ', 'นำไปหักคอมรอบ'
    ]
  },
  ขนาดกระจก: {
    idPrefix: 'Size',
    idField: 'ID',
    columns: [
      'ID', 'JobID', 'รุ่นรถยนต์', 'ตำแหน่งติดตั้ง',
      'บานหน้า', 'บานหลัง',
      'ประตูหน้า-ซ้าย', 'ประตูหน้า-ขวา',
      'ประตูหลัง-ซ้าย', 'ประตูหลัง-ขวา',
      'บานฟิก-ซ้าย', 'บานฟิก-ขวา',
      'ซันรูฟ-ช่อง1', 'ซันรูฟ-ช่อง2',
      'แครี่บอย', 'หมายเหตุ', 'วันที่ลงรายการ'
    ]
  },
  Customer: {
    idPrefix: 'CUS',
    idField: 'CustID',
    columns: [
      'CustID', 'ชื่อลูกค้า', 'เพศ', 'เบอร์โทรศัพท์', 'ช่องทางติดต่อ',
      'ชื่อช่องทางติดต่อ', 'ชื่อ/บริษัทออกบิล', 'ที่อยู่สำหรับออกบิล',
      'เลขประจำตัวผู้เสียภาษี', 'หมายเหตุ', 'รู้จักครั้งแรก', 'วันที่บันทึก'
    ]
  },
  สถิตการติดต่อ: {
    idPrefix: 'ST',
    idField: 'ST_ID',
    columns: [
      'ST_ID', 'วันที่', 'โทร', 'Line', 'FB', 'Tiktok', 'WalkIn',
      'หมายเหตุ', 'ผู้บันทึก', 'วันที่บันทึกรายการ'
    ]
  },
  Detail_Installer: {
    idPrefix: 'DT',
    idField: 'Ins_ID',
    columns: [
      'Ins_ID', 'JobID', 'ตำแหน่งติดตั้ง',
      'บานหน้า', 'บานหลัง',
      'ประตูหน้า-ซ้าย', 'ประตูหน้า-ขวา',
      'ประตูหลัง-ซ้าย', 'ประตูหลัง-ขวา',
      'บานฟิก-ซ้าย', 'บานฟิก-ขวา',
      'ซันรูฟ-ช่อง1', 'ซันรูฟ-ช่อง2',
      'แครี่บอย', 'วันที่ลงรายการ'
    ]
  },
  Detail_film: {
    idPrefix: 'Cut',
    idField: 'Detail_ID',
    columns: [
      'Detail_ID', 'JobID', 'ขอตัดฟิล์ม', 'ตำแหน่งติดตั้ง', 'ยี่ห้อฟิล์ม',
      'บานหน้า', 'บานหลัง',
      'ประตูหน้า-ซ้าย', 'ประตูหน้า-ขวา',
      'ประตูหลัง-ซ้าย', 'ประตูหลัง-ขวา',
      'บานฟิก-ซ้าย', 'บานฟิก-ขวา',
      'ซันรูฟ-ช่อง1', 'ซันรูฟ-ช่อง2',
      'แครี่บอย', 'เหตุผลขอตัดฟิล์ม', 'หมายเหตุ', 'วันที่ลงรายการ'
    ]
  },
  Waranty: {
    idPrefix: 'WA',
    idField: 'WA_ID',
    columns: [
      'WA_ID', 'JobID', 'ทะเบียนรถ',
      'เลขที่ใบรับประกัน', 'ปีรับประกัน',
      'วันที่เริ่ม', 'สิ้นสุด',
      'หมายเหตุ', 'วันที่ลงรายการ'
    ]
  },
  PayIn: {
    idPrefix: 'PAY',
    idField: 'Pay_ID',
    columns: [
      'Pay_ID', 'JobID', 'สถานะ',
      'ใบเสนอราคา', 'เลขที่บิล/ใบเสร็จ',
      'ประเภทการชำระ', 'ยอดเงิน(บาท)',
      'หมายเหตุ', 'หลักฐาน_1', 'หลักฐาน_2', 'หลักฐาน_3', 'หลักฐาน_4',
      'วันที่บันทึกรายการ'
    ]
  },
  Bookings: {
    idPrefix: 'JOB',
    idField: 'JobID',
    columns: [
      'JobID', 'CustID', 'พน.ขาย', 'วันที่ติดตั้ง', 'เวลานัด',
      'ประเภทลูกค้า', 'รุ่นรถยนต์', 'ทะเบียนรถ', 'ป้าย', 'ยี่ห้อฟิล์ม',
      'ตำแหน่งติดตั้ง', 'มูลค่าสินค้า', 'ส่วนลด', 'รหัสส่วนลด', 'ยอดขาย',
      'การรับประกัน', 'Pro_ID', 'WA_ID', 'หมายเหตุ', 'Status',
      'Colorstatus', 'รูปภาพ_01', 'รูปภาพ_02', 'รูปภาพ_03', 'วันที่ลงรายการ'
    ]
  },
  data: {
    idPrefix: 'MIS',
    idField: 'MIS_ID',
    columns: [
      'MIS_ID', 'JobID', 'ตำแหน่งติดตั้ง', 'รุ่นฟิล์ม',
      'กว้าง', 'ยาว', 'จำนวน', 'ทีมช่าง', 'เหตุผลขอตัดฟิล์ม',
      'หมายเหตุ', 'วันที่ลงรายการ'
    ]
  }
};

// ─── Memo / แจ้งเตือน ─────────────────────────────────────────
// ชีต memo เดิมมีการใช้งานอยู่แล้วและอาจมีชื่อคอลัมน์ต่างกันตามไฟล์ที่สร้างไว้
// จึงค้นหาคอลัมน์จากชื่อก่อน แล้วใช้ตำแหน่งมาตรฐาน (วันที่, สถานะ, รายละเอียด)
// เป็นทางเลือกสุดท้าย เพื่อแก้ไขข้อมูลเดิมได้โดยไม่ต้องย้ายชีตหรือเปลี่ยนหัวตาราง
function normalizeMemoHeader_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function memoColumnIndex_(header, exactNames, includesNames, fallbackIndex) {
  const normalizedHeader = header.map(normalizeMemoHeader_);
  const exact = exactNames.reduce((foundIndex, name) => {
    if (foundIndex !== -1) return foundIndex;
    return normalizedHeader.indexOf(normalizeMemoHeader_(name));
  }, -1);
  if (exact !== -1) return exact;

  const included = includesNames.reduce((foundIndex, part) => {
    if (foundIndex !== -1) return foundIndex;
    const normalizedPart = normalizeMemoHeader_(part);
    return normalizedHeader.findIndex(name => name.indexOf(normalizedPart) !== -1);
  }, -1);
  if (included !== -1) return included;

  return fallbackIndex >= 0 && fallbackIndex < header.length ? fallbackIndex : -1;
}

function getMemoColumns_(header) {
  return {
    id: memoColumnIndex_(
      header,
      ['memo_id', 'memoid', 'id'],
      ['memoid'],
      0
    ),
    date: memoColumnIndex_(
      header,
      ['วันที่แจ้งเตือน', 'วันแจ้งเตือน', 'กำหนดแจ้งเตือน', 'กำหนด', 'due date', 'date'],
      ['วันที่', 'วันแจ้ง', 'กำหนด', 'duedate'],
      1
    ),
    status: memoColumnIndex_(
      header,
      ['สถานะงาน', 'สถานะ', 'status', 'เปิดใช้งาน', 'active', 'enabled'],
      ['สถานะ', 'status', 'เปิดใช้งาน', 'active', 'enable'],
      -1
    ),
    topic: memoColumnIndex_(
      header,
      ['หัวข้อ', 'topic', 'category'],
      ['หัวข้อ', 'topic', 'category'],
      -1
    ),
    title: memoColumnIndex_(
      header,
      ['รายละเอียด', 'ข้อความ', 'หมายเหตุ', 'หัวข้อ', 'เรื่อง', 'รายการ', 'แจ้งเตือน', 'memo'],
      ['รายละเอียด', 'ข้อความ', 'หมายเหตุ', 'หัวข้อ', 'เรื่อง', 'รายการ', 'แจ้งเตือน', 'memo'],
      3
    )
  };
}

function ensureMemoStatusColumn_(sheet, header) {
  let columns = getMemoColumns_(header);
  if (columns.status !== -1) return { header: header, columns: columns };

  const newColumn = sheet.getLastColumn() + 1;
  sheet.getRange(1, newColumn).setValue('สถานะ');
  const updatedHeader = sheet.getRange(1, 1, 1, newColumn).getDisplayValues()[0].map(String);
  columns = getMemoColumns_(updatedHeader);
  return { header: updatedHeader, columns: columns };
}

function memoDateForSheet_(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('วันที่แจ้งเตือนไม่ถูกต้อง');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('วันที่แจ้งเตือนไม่ถูกต้อง');
  }
  return `${day}/${month}/${year + 543}`;
}

function getOrCreateMemoSheet_(ss) {
  let sheet = ss.getSheetByName('memo');
  if (sheet) return sheet;

  sheet = ss.insertSheet('memo');
  sheet.appendRow(['Memo_ID', 'วันที่แจ้งเตือน', 'สถานะ', 'รายละเอียด', 'วันที่บันทึก']);
  return sheet;
}

function getMemoTargetRow_(sheetValues, columns, body) {
  const memoId = String(body.memoId || '').trim();
  if (memoId && columns.id !== -1) {
    for (let index = 1; index < sheetValues.length; index++) {
      if (String(sheetValues[index][columns.id] || '').trim() === memoId) return index + 1;
    }
    throw new Error('ไม่พบรายการแจ้งเตือนเดิม กรุณารีเฟรชข้อมูลแล้วลองใหม่');
  }

  const rowNumber = Number(body.memoRowNumber);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheetValues.length) {
    throw new Error('ไม่พบรายการแจ้งเตือนเดิม กรุณารีเฟรชข้อมูลแล้วลองใหม่');
  }
  return rowNumber;
}

function upsertMemo_(body) {
  const title = String(body.title || '').trim();
  if (!title) throw new Error('กรุณาระบุรายละเอียดแจ้งเตือน');
  if (title.length > 5000) throw new Error('รายละเอียดแจ้งเตือนยาวเกิน 5,000 ตัวอักษร');

  const dateText = memoDateForSheet_(body.date);
  const status = body.active === true || String(body.active).toLowerCase() === 'true' ? 'on' : 'off';
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = getOrCreateMemoSheet_(ss);
  const lastColumn = Math.max(sheet.getLastColumn(), 4);
  let header = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(String);
  const statusSetup = ensureMemoStatusColumn_(sheet, header);
  header = statusSetup.header;
  const columns = statusSetup.columns;
  if (columns.date === -1 || columns.title === -1) {
    throw new Error('หัวตารางชีต memo ไม่ครบ กรุณาตรวจสอบคอลัมน์ วันที่แจ้งเตือน และ รายละเอียด');
  }

  const dataRange = sheet.getDataRange();
  const sheetValues = dataRange.getDisplayValues();
  const isUpdate = Boolean(String(body.memoId || '').trim()) ||
    (Number.isInteger(Number(body.memoRowNumber)) && Number(body.memoRowNumber) >= 2);
  let rowNumber;

  if (isUpdate) {
    rowNumber = getMemoTargetRow_(sheetValues, columns, body);
  } else {
    rowNumber = sheet.getLastRow() + 1;
    if (columns.id !== -1) {
      let memoId = generateId('MEM');
      const usedIds = sheetValues.slice(1).map(row => String(row[columns.id] || '').trim());
      while (usedIds.indexOf(memoId) !== -1) memoId = generateId('MEM');
      sheet.getRange(rowNumber, columns.id + 1).setValue(memoId);
    }
    if (columns.topic !== -1) sheet.getRange(rowNumber, columns.topic + 1).setValue('แจ้งเตือน');
  }

  sheet.getRange(rowNumber, columns.date + 1).setValue(dateText);
  if (columns.status !== -1) sheet.getRange(rowNumber, columns.status + 1).setValue(status);
  sheet.getRange(rowNumber, columns.title + 1).setValue(title);
  SpreadsheetApp.flush();

  return jsonOutput_({
    success: true,
    action: isUpdate ? 'updateMemo' : 'insertMemo',
    sheetName: 'memo',
    id: columns.id !== -1 ? String(sheet.getRange(rowNumber, columns.id + 1).getDisplayValue() || rowNumber) : String(rowNumber),
    rowNumber: rowNumber,
    verified: true
  });
}

function deleteMemo_(body) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('memo');
  if (!sheet) throw new Error('ไม่พบชีต: "memo"');

  const sheetValues = sheet.getDataRange().getDisplayValues();
  const header = (sheetValues[0] || []).map(String);
  const columns = getMemoColumns_(header);
  const rowNumber = getMemoTargetRow_(sheetValues, columns, body);
  sheet.deleteRow(rowNumber);
  SpreadsheetApp.flush();

  return jsonOutput_({ success: true, action: 'deleteMemo', sheetName: 'memo', id: String(rowNumber) });
}

// ─── ID Generator ─────────────────────────────────────────────
function generateId(prefix) {
  const now = new Date();
  const yy  = String(now.getFullYear()).slice(2);
  const mm  = String(now.getMonth() + 1).padStart(2, '0');
  const dd  = String(now.getDate()).padStart(2, '0');
  const hex = Math.floor(Math.random() * 0x1000).toString(16).toUpperCase().padStart(3, '0');
  if (prefix === 'MIS') return `MIS_${yy}${mm}${dd}-${hex}`;
  return `${prefix}-${yy}${mm}${dd}-${hex}`;
}

function isUnique(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return true;
  const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  return !data.some(row => row[0] === id);
}

// ─── Timestamp ────────────────────────────────────────────────
function thaiTimestamp() {
  const now = new Date();
  return `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()+543} ` +
         `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
}

function ensureHeaderRow(sheet, columns) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(columns);
    return;
  }
  const firstRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), columns.length)).getValues()[0];
  const hasHeader = firstRow.some(value => String(value || '').trim() !== '');
  if (!hasHeader) {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
    return;
  }
  const needsHeaderUpdate = columns.some((column, index) => String(firstRow[index] || '').trim() !== column);
  if (needsHeaderUpdate) {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
  }
}

// ─── บันทึกชีต data แบบ batch (เวอร์ชันเร็ว) ────────────────────
// แนวคิด: อ่านข้อมูลทั้งหมด "ครั้งเดียว" → ประมวลผลในหน่วยความจำ →
//        เขียนกลับ "ครั้งเดียว" หลีกเลี่ยง deleteRow/getValue/isUnique แบบวนซ้ำ
function saveDataRows(sheet, schema, body) {
  const jobId = String(body.JobID || '').trim();
  if (!jobId) throw new Error('ไม่พบ JobID');

  ensureHeaderRow(sheet, schema.columns);

  const numCols   = schema.columns.length;
  const jobColIdx = schema.columns.indexOf('JobID');
  const idColIdx  = schema.columns.indexOf(schema.idField);

  // 1) อ่านข้อมูลเดิมทั้งหมดครั้งเดียว
  const lastRow  = sheet.getLastRow();
  const existing = (lastRow >= 2)
    ? sheet.getRange(2, 1, lastRow - 1, numCols).getValues()
    : [];

  // 2) เก็บ ID ที่ใช้แล้วไว้ตรวจความซ้ำในหน่วยความจำ (ไม่อ่านชีตซ้ำ)
  const usedIds = {};
  existing.forEach(r => {
    const v = String(r[idColIdx] || '').trim();
    if (v) usedIds[v] = true;
  });

  // 3) เก็บแถวเดิมที่ "ไม่ใช่" jobId นี้ (แทนการ deleteRow ทีละแถว)
  const kept = existing.filter(r => String(r[jobColIdx] || '').trim() !== jobId);

  // ตัวช่วยสร้าง ID ใหม่ที่ไม่ซ้ำ (เช็คในหน่วยความจำ)
  function genUniqueId() {
    let id = generateId(schema.idPrefix);
    while (usedIds[id]) id = generateId(schema.idPrefix);
    usedIds[id] = true;
    return id;
  }

  const timestamp = thaiTimestamp();
  const savedIds  = [];
  const rows      = Array.isArray(body.rows) ? body.rows : [body];
  const newValues = [];

  rows.forEach(item => {
    const hasUsefulValue = ['ตำแหน่งติดตั้ง', 'รุ่นฟิล์ม', 'กว้าง', 'ยาว', 'จำนวน', 'ทีมช่าง', 'เหตุผลขอตัดฟิล์ม']
      .some(col => String(item[col] || '').trim() !== '');
    if (!hasUsefulValue) return;

    let id = String(item[schema.idField] || '').trim();
    if (!id || usedIds[id]) {
      id = genUniqueId();
    } else {
      usedIds[id] = true;
    }
    savedIds.push(id);

    newValues.push(sanitizeRowValues_(schema.columns.map(col => {
      if (col === schema.idField)    return id;
      if (col === 'JobID')           return jobId;
      if (col === 'วันที่ลงรายการ')  return timestamp;
      return item[col] !== undefined ? item[col] : '';
    })));
  });

  // 4) เขียนกลับครั้งเดียว: ล้างพื้นที่ข้อมูลเดิม แล้วเขียน kept + ใหม่
  const finalRows = kept.concat(newValues);
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, numCols).clearContent();
  }
  if (finalRows.length) {
    sheet.getRange(2, 1, finalRows.length, numCols).setValues(finalRows);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ success: true, ids: savedIds, id: savedIds[0] || '', sheetName: 'data' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function commissionCycleLabel_(now = new Date()) {
  const timeZone = 'Asia/Bangkok';
  const parts = Utilities.formatDate(now, timeZone, 'yyyy,M,d').split(',').map(Number);
  const [currentYear, currentMonth, currentDay] = parts;
  let startYear = currentYear;
  let startMonth = currentMonth;

  // ใช้รอบปัจจุบัน: วันที่ 26 ของเดือนก่อนถึงวันที่ 25 ของเดือนนี้ หรือวันที่ 26 ของเดือนนี้ถึงวันที่ 25 ของเดือนหน้า
  if (currentDay <= 25) {
    startMonth -= 1;
    if (startMonth === 0) {
      startMonth = 12;
      startYear -= 1;
    }
  }

  let endYear = startYear;
  let endMonth = startMonth + 1;
  if (endMonth === 13) {
    endMonth = 1;
    endYear += 1;
  }

  return `26/${startMonth}/${String(startYear).slice(-2)} - 25/${endMonth}/${String(endYear).slice(-2)}`;
}

function verifyWriteToken_(body) {
  const expectedToken = String(PropertiesService.getScriptProperties().getProperty(WRITE_TOKEN_PROPERTY) || '').trim();
  if (!expectedToken) {
    throw new Error(`ยังไม่ได้ตั้งค่า Script Property: ${WRITE_TOKEN_PROPERTY}`);
  }

  const providedToken = String(body && body.token ? body.token : '').trim();
  if (!providedToken || providedToken !== expectedToken) {
    throw new Error('Write token ไม่ถูกต้องหรือไม่ได้ระบุ');
  }
}

function payInMutationCacheKey_(body) {
  const mutationId = String(body && body.mutationId ? body.mutationId : '').trim();
  if (!mutationId) return '';
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(mutationId)) throw new Error('mutationId ของ PayIn ไม่ถูกต้อง');
  return `payin-mutation-${mutationId}`;
}

function readPayInMutationResult_(cacheKey) {
  if (!cacheKey) return '';
  try {
    const cached = CacheService.getScriptCache().get(cacheKey) || '';
    if (!cached) return '';
    const parsed = JSON.parse(cached);
    return parsed && parsed.success && parsed.verified ? cached : '';
  }
  catch (error) { return ''; }
}

function rememberPayInMutationResult_(cacheKey, result) {
  if (!cacheKey) return;
  try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), PAYIN_MUTATION_CACHE_SECONDS); }
  catch (error) { /* cache is best effort; the sheet write already succeeded */ }
}

function sanitizeCellValue_(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  const text = String(value);
  return /^[=+\-@]/.test(text.trimStart()) ? "'" + text : text;
}

function sanitizeRowValues_(row) {
  return row.map(sanitizeCellValue_);
}

function findRowNumberById_(sheet, schema, expectedId) {
  const idIndex = schema.columns.indexOf(schema.idField);
  if (idIndex === -1 || !expectedId) return -1;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, idIndex + 1, lastRow - 1, 1).getValues();
  for (let index = values.length - 1; index >= 0; index--) {
    if (String(values[index][0] || '').trim() === String(expectedId).trim()) {
      return index + 2;
    }
  }
  return -1;
}

function findRowNumbersByColumnValue_(sheetValues, header, columnName, expectedValue) {
  const columnIndex = header.indexOf(columnName);
  const expected = String(expectedValue || '').trim();
  if (columnIndex === -1 || !expected) return [];
  const rowNumbers = [];
  for (let index = 1; index < sheetValues.length; index++) {
    if (String(sheetValues[index][columnIndex] || '').trim() === expected) {
      rowNumbers.push(index + 1);
    }
  }
  return rowNumbers;
}

function updateSubmittedCells_(sheet, schema, rowNumber, body, idValue) {
  const timestamp = thaiTimestamp();
  schema.columns.forEach(function(column, columnIndex) {
    let shouldWrite = false;
    let value = '';

    if (column === schema.idField) {
      shouldWrite = true;
      value = idValue;
    } else if (column === 'วันที่ลงรายการ' || column === 'วันที่บันทึกรายการ' || column === 'วันที่บันทึก') {
      shouldWrite = true;
      value = timestamp;
    } else if (body[column] !== undefined) {
      shouldWrite = true;
      value = body[column];
    }

    if (shouldWrite) {
      sheet.getRange(rowNumber, columnIndex + 1).setValue(sanitizeCellValue_(value));
    }
  });
}

function assertWrittenRow_(sheet, schema, rowNumber, expectedId, expectedJobId) {
  SpreadsheetApp.flush();
  let verifiedRowNumber = rowNumber;
  const idIndex = schema.columns.indexOf(schema.idField);
  const jobIndex = schema.columns.indexOf('JobID');

  if (verifiedRowNumber < 2 || verifiedRowNumber > sheet.getLastRow()) {
    verifiedRowNumber = findRowNumberById_(sheet, schema, expectedId);
  } else if (idIndex !== -1) {
    const actualId = String(sheet.getRange(verifiedRowNumber, idIndex + 1).getValue() || '').trim();
    if (actualId !== String(expectedId || '').trim()) {
      verifiedRowNumber = findRowNumberById_(sheet, schema, expectedId);
    }
  }

  if (verifiedRowNumber < 2) {
    throw new Error(`บันทึกไม่สำเร็จ: เขียนชีต ${sheet.getName()} แล้วแต่ตรวจไม่พบแถว ${schema.idField}`);
  }

  const row = sheet.getRange(verifiedRowNumber, 1, 1, schema.columns.length).getValues()[0];
  const actualId = idIndex === -1 ? '' : String(row[idIndex] || '').trim();
  if (idIndex !== -1 && actualId !== String(expectedId || '').trim()) {
    throw new Error(`บันทึกไม่สำเร็จ: ตรวจสอบ ${schema.idField} หลังบันทึกไม่ตรงกัน`);
  }
  if (expectedJobId && jobIndex !== -1 && String(row[jobIndex] || '').trim() !== String(expectedJobId).trim()) {
    throw new Error('บันทึกไม่สำเร็จ: ตรวจสอบ JobID หลังบันทึกไม่ตรงกัน');
  }

  return { rowNumber: verifiedRowNumber, row: row };
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function isLikelyAppSheetRootFolder_(folder) {
  const parents = folder.getParents();
  while (parents.hasNext()) {
    const parent = parents.next();
    if (String(parent.getName() || '').toLowerCase() !== 'data') continue;
    const grandparents = parent.getParents();
    while (grandparents.hasNext()) {
      if (String(grandparents.next().getName() || '').toLowerCase() === 'appsheet') return true;
    }
  }
  return false;
}

function findAppSheetRootFolder_() {
  const matches = DriveApp.getFoldersByName(APPSHEET_APP_FOLDER_NAME);
  const folders = [];
  while (matches.hasNext()) folders.push(matches.next());
  if (!folders.length) {
    throw new Error(`ไม่พบโฟลเดอร์ AppSheet "${APPSHEET_APP_FOLDER_NAME}" ใน Google Drive`);
  }

  const preferred = folders.filter(isLikelyAppSheetRootFolder_);
  if (preferred.length === 1) return preferred[0];
  if (folders.length === 1) {
    throw new Error(`ไม่สามารถยืนยันว่าโฟลเดอร์ "${APPSHEET_APP_FOLDER_NAME}" เป็นโฟลเดอร์ข้อมูล AppSheet กรุณาตั้ง Script Property ${PAYIN_IMAGE_FOLDER_ID_PROPERTY} เป็น Folder ID ของโฟลเดอร์ Pay_In`);
  }
  throw new Error(`พบโฟลเดอร์ "${APPSHEET_APP_FOLDER_NAME}" มากกว่า 1 แห่ง กรุณาตั้ง Script Property ${PAYIN_IMAGE_FOLDER_ID_PROPERTY} เป็น Folder ID ของโฟลเดอร์ Pay_In`);
}

function getOrCreateChildFolder_(parent, name) {
  const matches = parent.getFoldersByName(name);
  return matches.hasNext() ? matches.next() : parent.createFolder(name);
}

function isValidConfiguredPayInFolder_(folder) {
  if (String(folder.getName() || '') !== 'Pay_In') return false;
  const imageParents = folder.getParents();
  while (imageParents.hasNext()) {
    const imagesFolder = imageParents.next();
    if (String(imagesFolder.getName() || '') !== 'Images') continue;
    const appRoots = imagesFolder.getParents();
    while (appRoots.hasNext()) {
      if (String(appRoots.next().getName() || '') === APPSHEET_APP_FOLDER_NAME) return true;
    }
  }
  return false;
}

function getPayInImageFolder_() {
  const configuredFolderId = String(PropertiesService.getScriptProperties().getProperty(PAYIN_IMAGE_FOLDER_ID_PROPERTY) || '').trim();
  if (configuredFolderId) {
    const configuredFolder = DriveApp.getFolderById(configuredFolderId);
    if (!isValidConfiguredPayInFolder_(configuredFolder)) {
      throw new Error(`Script Property ${PAYIN_IMAGE_FOLDER_ID_PROPERTY} ต้องชี้ไปที่โฟลเดอร์ ${APPSHEET_APP_FOLDER_NAME}/Images/Pay_In`);
    }
    return configuredFolder;
  }

  const appRoot = findAppSheetRootFolder_();
  const imagesFolder = getOrCreateChildFolder_(appRoot, 'Images');
  const payInFolder = getOrCreateChildFolder_(imagesFolder, 'Pay_In');
  if (!isValidConfiguredPayInFolder_(payInFolder)) throw new Error('โครงสร้างโฟลเดอร์ PayIn ไม่ถูกต้อง');
  return payInFolder;
}

function hasExpectedImageSignature_(bytes, mimeType) {
  const byteAt = function (index) { return Number(bytes[index]) & 255; };
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && byteAt(0) === 0xFF && byteAt(1) === 0xD8 && byteAt(2) === 0xFF;
  }
  if (mimeType === 'image/png') {
    const png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    return bytes.length >= png.length && png.every(function (value, index) { return byteAt(index) === value; });
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12 &&
      String.fromCharCode(byteAt(0), byteAt(1), byteAt(2), byteAt(3)) === 'RIFF' &&
      String.fromCharCode(byteAt(8), byteAt(9), byteAt(10), byteAt(11)) === 'WEBP';
  }
  return false;
}

function decodePayInProofUploads_(body) {
  if (body.payInProofUploads === undefined) return [];
  if (!Array.isArray(body.payInProofUploads)) throw new Error('รูปหลักฐานมีรูปแบบข้อมูลไม่ถูกต้อง');
  if (body.payInProofUploads.length > PAYIN_PROOF_SLOT_COUNT) throw new Error(`แนบรูปหลักฐานได้สูงสุด ${PAYIN_PROOF_SLOT_COUNT} รูป`);

  const allowedMimeTypes = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };
  const seenSlots = {};

  return body.payInProofUploads.map(function (upload) {
    const slot = Number(upload && upload.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > PAYIN_PROOF_SLOT_COUNT || seenSlots[slot]) throw new Error('ตำแหน่งรูปหลักฐานไม่ถูกต้อง');
    seenSlots[slot] = true;

    let mimeType = String(upload.mimeType || '').toLowerCase().trim();
    let base64 = String(upload.base64 || '').trim();
    const dataUrlMatch = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
      mimeType = String(dataUrlMatch[1] || mimeType).toLowerCase().trim();
      base64 = dataUrlMatch[2];
    }
    if (!allowedMimeTypes[mimeType]) throw new Error('รองรับรูปหลักฐานเฉพาะ JPG, PNG และ WebP');

    let bytes;
    try {
      bytes = Utilities.base64Decode(base64.replace(/\s/g, ''));
    } catch (error) {
      throw new Error(`อ่านข้อมูลหลักฐาน ${slot} ไม่สำเร็จ`);
    }
    if (!bytes.length) throw new Error(`หลักฐาน ${slot} ไม่มีข้อมูลรูป`);
    if (bytes.length > PAYIN_IMAGE_MAX_BYTES) throw new Error(`หลักฐาน ${slot} มีขนาดเกิน 3 MB`);
    if (!hasExpectedImageSignature_(bytes, mimeType)) throw new Error(`หลักฐาน ${slot} ไม่ใช่ไฟล์รูป ${allowedMimeTypes[mimeType].toUpperCase()} ที่ถูกต้อง`);

    return {
      slot: slot,
      column: `หลักฐาน_${slot}`,
      mimeType: mimeType,
      extension: allowedMimeTypes[mimeType],
      bytes: bytes
    };
  });
}

function trashFilesQuietly_(files) {
  (files || []).forEach(function (file) {
    try { file.setTrashed(true); } catch (error) { /* best effort cleanup */ }
  });
}

function savePayInProofUploads_(body, payId) {
  const uploads = decodePayInProofUploads_(body);
  if (!uploads.length) return [];

  const folder = getPayInImageFolder_();
  const safePayId = String(payId || 'PAY').replace(/[^a-zA-Z0-9_-]/g, '_');
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyyMMdd_HHmmss');
  const createdFiles = [];

  try {
    uploads.forEach(function (upload) {
      const suffix = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
      const fileName = `${safePayId}_${upload.slot}_${timestamp}_${suffix}.${upload.extension}`;
      const blob = Utilities.newBlob(upload.bytes, upload.mimeType, fileName);
      const file = folder.createFile(blob);
      createdFiles.push(file);
      file.setDescription(`CAR CRM PayIn ${payId} หลักฐาน ${upload.slot}`);
      body[upload.column] = `${APPSHEET_APP_FOLDER_NAME}/${PAYIN_IMAGE_RELATIVE_FOLDER}/${fileName}`;
    });
  } catch (error) {
    trashFilesQuietly_(createdFiles);
    throw error;
  }

  return createdFiles;
}

function decodePayInProof_(body) {
  if (body.sheetName !== 'PayIn') throw new Error('การแนบรูปนี้รองรับเฉพาะ PayIn');

  const recordId = String(body.recordId || '').trim();
  const jobId = String(body.JobID || '').trim();
  const slot = Number(body.slot);
  const requestId = String(body.clientRequestId || '').toLowerCase().trim();
  if (!recordId || recordId.length > 100) throw new Error('ไม่พบ Pay_ID สำหรับผูกรูป');
  if (!jobId || jobId.length > 100) throw new Error('ไม่พบ JobID สำหรับผูกรูป');
  if (!Number.isInteger(slot) || slot < 1 || slot > PAYIN_PROOF_SLOT_COUNT) throw new Error('ตำแหน่งรูปหลักฐานไม่ถูกต้อง');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)) {
    throw new Error('รหัสคำขออัปโหลดไม่ถูกต้อง');
  }

  const decoded = decodePayInProofUploads_({
    payInProofUploads: [{
      slot: slot,
      mimeType: body.mimeType,
      base64: body.base64
    }]
  })[0];

  return {
    recordId: recordId,
    jobId: jobId,
    slot: slot,
    requestId: requestId,
    column: decoded.column,
    mimeType: decoded.mimeType,
    extension: decoded.extension,
    bytes: decoded.bytes
  };
}

function findPayInTarget_(sheet, recordId, jobId) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) return null;
  const header = values[0].map(String);
  const idIndex = header.indexOf('Pay_ID');
  const jobIndex = header.indexOf('JobID');
  if (idIndex === -1 || jobIndex === -1) throw new Error('หัวตาราง PayIn ไม่ถูกต้อง');

  for (let index = 1; index < values.length; index++) {
    const rowId = String(values[index][idIndex] || '').trim();
    const rowJobId = String(values[index][jobIndex] || '').trim();
    if (rowId === recordId && rowJobId === jobId) {
      return { rowNumber: index + 1, values: values[index], header: header };
    }
  }
  return null;
}

function assertPayInProofSaved_(sheet, proof, relativePath, file) {
  SpreadsheetApp.flush();
  const target = findPayInTarget_(sheet, proof.recordId, proof.jobId);
  if (!target) throw new Error('บันทึกรูปไม่สำเร็จ: ตรวจไม่พบ PayIn หลังอัปโหลด');

  const proofIndex = target.header.indexOf(proof.column);
  if (proofIndex === -1) throw new Error(`บันทึกรูปไม่สำเร็จ: ตรวจไม่พบคอลัมน์ ${proof.column}`);

  const actualPath = String(target.values[proofIndex] || '').trim();
  if (actualPath !== relativePath) {
    throw new Error(`บันทึกรูปไม่สำเร็จ: ตรวจสอบช่อง ${proof.column} แล้วไม่พบ path รูป`);
  }

  if (!file || file.isTrashed()) {
    throw new Error('บันทึกรูปไม่สำเร็จ: ตรวจไม่พบไฟล์รูปใน Google Drive');
  }

  return { rowNumber: target.rowNumber };
}

function attachPayInProof_(body) {
  const proof = decodePayInProof_(body);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('PayIn');
  if (!sheet) throw new Error('ไม่พบชีต: "PayIn"');

  const initialTarget = findPayInTarget_(sheet, proof.recordId, proof.jobId);
  if (!initialTarget) throw new Error('ไม่พบ PayIn ที่ตรงกับ Pay_ID และ JobID');
  const proofIndex = initialTarget.header.indexOf(proof.column);
  if (proofIndex === -1) throw new Error(`ไม่พบคอลัมน์ ${proof.column}`);

  const safePayId = proof.recordId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeRequestId = proof.requestId.replace(/-/g, '');
  const fileName = `${safePayId}_${proof.slot}_${safeRequestId}.${proof.extension}`;
  const relativePath = `${APPSHEET_APP_FOLDER_NAME}/${PAYIN_IMAGE_RELATIVE_FOLDER}/${fileName}`;

  const folder = getPayInImageFolder_();
  const matchingFiles = folder.getFilesByName(fileName);
  let file = matchingFiles.hasNext() ? matchingFiles.next() : null;
  let createdNow = false;
  if (!file) {
    file = folder.createFile(Utilities.newBlob(proof.bytes, proof.mimeType, fileName));
    file.setDescription(`CAR CRM PayIn ${proof.recordId} หลักฐาน ${proof.slot}`);
    createdNow = true;
  }

  if (String(initialTarget.values[proofIndex] || '').trim() === relativePath) {
    const verified = assertPayInProofSaved_(sheet, proof, relativePath, file);
    return jsonOutput_({
      success: true,
      id: proof.recordId,
      action: 'attachPayInProof',
      slot: proof.slot,
      relativePath: relativePath,
      rowNumber: verified.rowNumber,
      reused: true,
      verified: true
    });
  }

  let lock = null;
  let committed = false;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw new Error('ระบบกำลังบันทึกข้อมูลอยู่ กรุณาลองอัปโหลดรูปอีกครั้ง');

    const latestTarget = findPayInTarget_(sheet, proof.recordId, proof.jobId);
    if (!latestTarget) throw new Error('PayIn ถูกเปลี่ยนแปลงระหว่างอัปโหลด กรุณารีเฟรชแล้วลองใหม่');
    const latestProofIndex = latestTarget.header.indexOf(proof.column);
    if (latestProofIndex === -1) throw new Error(`ไม่พบคอลัมน์ ${proof.column}`);

    if (String(latestTarget.values[latestProofIndex] || '').trim() !== relativePath) {
      sheet.getRange(latestTarget.rowNumber, latestProofIndex + 1).setValue(sanitizeCellValue_(relativePath));
      const timestampIndex = latestTarget.header.indexOf('วันที่บันทึกรายการ');
      if (timestampIndex !== -1) sheet.getRange(latestTarget.rowNumber, timestampIndex + 1).setValue(thaiTimestamp());
    }
    const verified = assertPayInProofSaved_(sheet, proof, relativePath, file);
    committed = true;
    return jsonOutput_({
      success: true,
      id: proof.recordId,
      action: 'attachPayInProof',
      slot: proof.slot,
      relativePath: relativePath,
      rowNumber: verified.rowNumber,
      reused: !createdNow,
      verified: true
    });
  } catch (error) {
    if (createdNow && !committed && file) {
      try { file.setTrashed(true); } catch (trashError) { /* best effort cleanup */ }
    }
    throw error;
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function upsertPayIn_(sheet, schema, body) {
  const jobId = String(body.JobID || '').trim();
  if (!jobId) throw new Error('ไม่พบ JobID สำหรับบันทึก PayIn');

  const values = sheet.getDataRange().getValues();
  const header = values[0].map(String);
  const headerMismatch = schema.columns.some(function(column, index) {
    return String(header[index] || '').trim() !== column;
  });
  if (headerMismatch) {
    throw new Error('หัวตาราง PayIn ไม่ตรงกับโครงสร้างที่ระบบกำหนด - ยกเลิกการบันทึกเพื่อป้องกันคอลัมน์สลับ');
  }
  const idIndex = header.indexOf(schema.idField);
  const jobIndex = header.indexOf('JobID');
  if (idIndex === -1 || jobIndex === -1) throw new Error('หัวตาราง PayIn ไม่ถูกต้อง');

  const requestedId = String(body.recordId || '').trim();
  let targetRowIndex = -1;
  if (requestedId) {
    for (let index = 1; index < values.length; index++) {
      if (String(values[index][idIndex] || '').trim() !== requestedId) continue;
      if (String(values[index][jobIndex] || '').trim() !== jobId) {
        throw new Error('Pay_ID ไม่ตรงกับ JobID - ยกเลิกการบันทึกเพื่อป้องกันข้อมูลผิดงาน');
      }
      targetRowIndex = index + 1;
      break;
    }
    if (targetRowIndex === -1) {
      throw new Error('ไม่พบ Pay_ID ที่ต้องการแก้ไข กรุณารีเฟรชข้อมูลก่อนบันทึกอีกครั้ง');
    }
  }
  if (!requestedId && targetRowIndex === -1) {
    const matchingRows = [];
    for (let index = 1; index < values.length; index++) {
      if (String(values[index][jobIndex] || '').trim() === jobId) {
        matchingRows.push(index + 1);
      }
    }
    if (matchingRows.length > 1) {
      throw new Error('พบ PayIn ซ้ำสำหรับ JobID นี้ - ยกเลิกการบันทึกเพื่อป้องกันแก้ไขผิดรายการ');
    }
    if (matchingRows.length === 1) targetRowIndex = matchingRows[0];
  }

  let payId;
  let action;
  if (targetRowIndex !== -1) {
    const existingRow = values[targetRowIndex - 1];
    payId = String(existingRow[idIndex] || '').trim();
    if (!payId) {
      payId = generateId(schema.idPrefix);
      let attempts = 0;
      while (!isUnique(sheet, payId) && attempts < 10) {
        payId = generateId(schema.idPrefix);
        attempts++;
      }
    }
    updateSubmittedCells_(sheet, schema, targetRowIndex, body, payId);
    const verified = assertWrittenRow_(sheet, schema, targetRowIndex, payId, jobId);
    action = 'update';
    targetRowIndex = verified.rowNumber;
  } else {
    payId = generateId(schema.idPrefix);
    let attempts = 0;
    while (!isUnique(sheet, payId) && attempts < 10) {
      payId = generateId(schema.idPrefix);
      attempts++;
    }
    const timestamp = thaiTimestamp();
    const rowData = schema.columns.map(function(column) {
      if (column === schema.idField) return payId;
      if (column === 'วันที่บันทึกรายการ') return timestamp;
      return body[column] !== undefined ? body[column] : '';
    });
    sheet.appendRow(sanitizeRowValues_(rowData));
    const verified = assertWrittenRow_(sheet, schema, sheet.getLastRow(), payId, jobId);
    action = 'insert';
    targetRowIndex = verified.rowNumber;
  }

  SpreadsheetApp.flush();
  return jsonOutput_({ success: true, id: payId, action: action, sheetName: 'PayIn', rowNumber: targetRowIndex, verified: true });
}

function ensurePlainTextColumns_(sheet, schema) {
  const lastColumn = Math.max(sheet.getLastColumn(), schema.columns.length, 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);

  headers.forEach(function(header, index) {
    if (/เบอร์|โทรศัพท์|phone/i.test(header)) {
      sheet.getRange(1, index + 1, Math.max(sheet.getMaxRows(), 1), 1).setNumberFormat('@');
    }
  });
}

// ─── Main POST handler ────────────────────────────────────────
function formatErrorMessage_(err) {
  const message = String(err && err.message ? err.message : err || '').trim();
  const lowerMessage = message.toLowerCase();
  const isDriveScopeError =
    lowerMessage.indexOf('you do not have permission to call driveapp') !== -1 ||
    lowerMessage.indexOf('authorization is required to perform that action') !== -1 ||
    lowerMessage.indexOf('googleapis.com/auth/drive') !== -1;
  if (isDriveScopeError) {
    return 'Apps Script Web App ยังเข้าถึง Google Drive ไม่ได้: ถ้า authorizeOnce() ผ่านแล้ว ให้ตรวจ Deploy ว่า Execute as = Me, Who has access = Anyone แล้วเลือก Version > New version เพื่อ Deploy ใหม่';
  }

  const isSpreadsheetScopeError =
    lowerMessage.indexOf('spreadsheetapp.openbyid') !== -1 ||
    lowerMessage.indexOf('googleapis.com/auth/spreadsheets') !== -1 ||
    lowerMessage.indexOf('do not have permission') !== -1;

  if (isSpreadsheetScopeError) {
    return 'Apps Script Web App ยังเข้าถึง Google Sheets ไม่ได้: ถ้า authorizeOnce() ผ่านแล้ว ให้ตรวจ Deploy ว่า Execute as = Me, Who has access = Anyone แล้วเลือก Version > New version เพื่อ Deploy ใหม่';
  }

  return message || 'เกิดข้อผิดพลาด';
}

function diagnosticErrorMessage_(err) {
  return String(err && err.message ? err.message : err || 'ไม่ทราบสาเหตุ')
    .replace(/[A-Za-z0-9_-]{20,}/g, '[redacted-id]')
    .slice(0, 500);
}

function doPost(e) {
  if (e && e.parameter && e.parameter.crmAuth === '1') return carCrmAuthPost_(e);
  if (e && e.parameter && e.parameter.crmLead === '1') return carLeadServicePost_(e);
  let lock = null;
  let uploadedProofFiles = [];
  let proofFilesCommitted = false;
  let payInMutationCacheKey = '';
  try {
    const rawPost = String(e && e.postData && e.postData.contents ? e.postData.contents : '');
    const contentLength = Number(e && e.contentLength ? e.contentLength : rawPost.length);
    if (!rawPost) throw new Error('ไม่พบข้อมูลที่ส่งมา');
    if (contentLength > PAYIN_MAX_POST_BYTES || rawPost.length > PAYIN_MAX_POST_BYTES) {
      throw new Error('ข้อมูลที่ส่งมามีขนาดใหญ่เกิน 10 MB');
    }

    const body = JSON.parse(rawPost);
    verifyWriteToken_(body);

    const action = String(body.action || '').trim();
    const allowedActions = ['', 'insert', 'update', 'delete', 'upsertPayIn', 'attachPayInProof', 'upsertMemo', 'deleteMemo', 'upsertLead', 'updateLeadSheet'];
    if (allowedActions.indexOf(action) === -1) throw new Error(`ไม่รู้จัก action: "${action}"`);
    if (action === 'delete' && !String(body.recordId || body.custId || '').trim()) {
      throw new Error('คำสั่งลบต้องระบุรหัสรายการ');
    }
    if (action === 'update' && !String(body.recordId || body.custId || '').trim() &&
        !String(body.matchPhone || '').replace(/\D/g, '') &&
        !(['PayIn', 'Waranty'].indexOf(body.sheetName) !== -1 && String(body.JobID || '').trim())) {
      throw new Error('คำสั่งแก้ไขต้องระบุรหัสรายการหรือข้อมูลสำหรับค้นหารายการเดิม');
    }
    if (action === 'attachPayInProof') return attachPayInProof_(body);

    lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      throw new Error('ระบบกำลังบันทึกข้อมูลอยู่ กรุณาลองใหม่อีกครั้ง');
    }

    if (action === 'upsertLead' || action === 'updateLeadSheet') return upsertCarLeadSheet_(body);
    if (action === 'upsertMemo') return upsertMemo_(body);
    if (action === 'deleteMemo') return deleteMemo_(body);

    const sheetName = body.sheetName;

    if (!sheetName || !SCHEMA[sheetName]) {
      throw new Error(`ไม่รู้จัก sheetName: "${sheetName}"`);
    }

    if (sheetName === 'PayIn') {
      payInMutationCacheKey = payInMutationCacheKey_(body);
      const cachedResult = readPayInMutationResult_(payInMutationCacheKey);
      if (cachedResult) {
        return ContentService
          .createTextOutput(cachedResult)
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    const schema = SCHEMA[sheetName];
    const ss     = SpreadsheetApp.openById(SHEET_ID);
    let sheet  = ss.getSheetByName(sheetName);
    if (!sheet && sheetName === 'data') {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(schema.columns);
    }

    if (!sheet) throw new Error(`ไม่พบชีต: "${sheetName}"`);
    ensurePlainTextColumns_(sheet, schema);

    // เส้นทางรูปเป็นค่าที่ server สร้างเท่านั้น ป้องกัน client เขียน path เอง
    if (sheetName === 'PayIn') {
      for (let slot = 1; slot <= PAYIN_PROOF_SLOT_COUNT; slot++) {
        delete body[`หลักฐาน_${slot}`];
      }
    }

    if (action === 'upsertPayIn') {
      if (sheetName !== 'PayIn') throw new Error('action upsertPayIn รองรับเฉพาะชีต PayIn');
      return upsertPayIn_(sheet, schema, body);
    }

    if (sheetName === 'data' && Array.isArray(body.rows)) {
      const batchResult = saveDataRows(sheet, schema, body);
      SpreadsheetApp.flush();
      return batchResult;
    }

    if (body.action === 'update' && (body.custId || body.matchPhone || body.recordId || (['PayIn', 'Waranty'].indexOf(sheetName) !== -1 && body.JobID))) {
      const dataRange = sheet.getDataRange();
      const sheetValues = dataRange.getValues();
      const header = sheetValues[0];
      const idIdx = header.indexOf(schema.idField);
      // หาคอลัมน์เบอร์โทรเป็นทางสำรอง เผื่อหา ID ไม่เจอ
      const phoneIdx = header.findIndex(function(h){ return String(h).indexOf('เบอร์') !== -1 || String(h).indexOf('โทร') !== -1; });
      const matchPhoneClean = body.matchPhone ? String(body.matchPhone).replace(/\D/g, '') : '';

      // ค่า ID ที่จะใช้หา: รองรับทั้ง custId (ของเก่า) และ recordId (generic)
      const lookupId = body.recordId || body.custId;

      let targetRowIndex = -1;
      let matchedId = lookupId;

      // 1) หาด้วย ID ตรง ๆ ตาม schema.idField
      if (idIdx !== -1 && lookupId) {
        for (let i = 1; i < sheetValues.length; i++) {
          if (String(sheetValues[i][idIdx]) === String(lookupId)) {
            targetRowIndex = i + 1;
            matchedId = sheetValues[i][idIdx];
            break;
          }
        }
      }

      if (targetRowIndex !== -1 && (sheetName === 'PayIn' || sheetName === 'Waranty') && body.JobID) {
        const jobIdx = header.indexOf('JobID');
        if (jobIdx !== -1 && String(sheetValues[targetRowIndex - 1][jobIdx] || '').trim() !== String(body.JobID || '').trim()) {
          throw new Error(`${schema.idField} ไม่ตรงกับ JobID - ยกเลิกการบันทึกเพื่อป้องกันข้อมูลผิดงาน`);
        }
      }

      // 2) ถ้ายังไม่เจอ ลองหาด้วยเบอร์โทรที่กำลังแก้ไข
      if (targetRowIndex === -1 && phoneIdx !== -1 && matchPhoneClean.length >= 9) {
        for (let i = 1; i < sheetValues.length; i++) {
          const rowPhone = String(sheetValues[i][phoneIdx] || '').replace(/\D/g, '');
          if (rowPhone === matchPhoneClean) {
            targetRowIndex = i + 1;
            if (idIdx !== -1) matchedId = sheetValues[i][idIdx];
            break;
          }
        }
      }

      // PayIn / Waranty แก้ไขจากหน้า index.html: ถ้าไม่มี ID ให้หาแถวเดิมด้วย JobID
      if (targetRowIndex === -1 && (sheetName === 'PayIn' || sheetName === 'Waranty') && body.JobID) {
        const matchingRows = findRowNumbersByColumnValue_(sheetValues, header, 'JobID', body.JobID);
        if (matchingRows.length > 1) {
          throw new Error(`พบ ${sheetName} ซ้ำสำหรับ JobID นี้ กรุณารีเฟรชข้อมูลหรือแก้จากรายการที่มี ID เพื่อป้องกันข้อมูลหาย`);
        }
        if (matchingRows.length === 1) {
          targetRowIndex = matchingRows[0];
          if (idIdx !== -1) matchedId = sheetValues[targetRowIndex - 1][idIdx];
        }
      }

      if (targetRowIndex !== -1) {
        if (!matchedId && idIdx !== -1) {
          matchedId = generateId(schema.idPrefix);
          let attempts = 0;
          while (!isUnique(sheet, matchedId) && attempts < 10) {
            matchedId = generateId(schema.idPrefix);
            attempts++;
          }
        }
        if (sheetName === 'PayIn') uploadedProofFiles = savePayInProofUploads_(body, matchedId);
        updateSubmittedCells_(sheet, schema, targetRowIndex, body, matchedId);
        const verified = assertWrittenRow_(sheet, schema, targetRowIndex, matchedId, body.JobID);
        proofFilesCommitted = true;
        const updateResult = { success: true, id: matchedId, action: 'update', sheetName, rowNumber: verified.rowNumber, verified: true };
        rememberPayInMutationResult_(payInMutationCacheKey, updateResult);
        if (sheetName === 'Bookings') { try { updateResult.leadSync=syncCarBookingStatuses_(body.CustID); } catch(syncError) { updateResult.leadSync={error:String(syncError.message)}; console.error('CAR booking lead sync failed: '+syncError.message); } }
        return ContentService
          .createTextOutput(JSON.stringify(updateResult))
          .setMimeType(ContentService.MimeType.JSON);
      }

      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'ไม่พบรายการเดิม (CustID/เบอร์โทร) — ยกเลิกการบันทึกเพื่อกันข้อมูลซ้ำ' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (body.action === 'delete' && (body.recordId || body.custId)) {
      const dataRange = sheet.getDataRange();
      const sheetValues = dataRange.getValues();
      const header = sheetValues[0];
      const idIdx = header.indexOf(schema.idField);
      const lookupId = body.recordId || body.custId;

      let targetRowIndex = -1;
      for (let i = 1; i < sheetValues.length; i++) {
        if (String(sheetValues[i][idIdx]) === String(lookupId)) {
          targetRowIndex = i + 1;
          break;
        }
      }

      if (targetRowIndex > -1) {
        sheet.deleteRow(targetRowIndex);
        SpreadsheetApp.flush();
        return ContentService
          .createTextOutput(JSON.stringify({ success: true, id: lookupId, action: 'delete', sheetName }))
          .setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService
          .createTextOutput(JSON.stringify({ success: false, error: 'ไม่พบรายการที่ต้องการลบ' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // สร้าง ID ที่ไม่ซ้ำสำหรับการเพิ่มใหม่
    let id = generateId(schema.idPrefix);
    let attempts = 0;
    while (!isUnique(sheet, id) && attempts < 10) {
      id = generateId(schema.idPrefix);
      attempts++;
    }

    if (sheetName === 'PayIn') uploadedProofFiles = savePayInProofUploads_(body, id);

    const timestamp = thaiTimestamp();

    const row = schema.columns.map(col => {
      if (col === schema.idField)      return id;
      if (col === 'วันที่ลงรายการ')   return timestamp;
      if (col === 'วันที่บันทึกรายการ') return timestamp;
      if (col === 'วันที่บันทึก') return timestamp;
      if (col === 'นำไปหักคอมรอบ') return commissionCycleLabel_();
      return body[col] !== undefined ? body[col] : '';
    });

    sheet.appendRow(sanitizeRowValues_(row));
    const verified = assertWrittenRow_(sheet, schema, sheet.getLastRow(), id, body.JobID);
    proofFilesCommitted = true;
    const insertResult = { success: true, id, sheetName, action: 'insert', rowNumber: verified.rowNumber, verified: true };
    rememberPayInMutationResult_(payInMutationCacheKey, insertResult);
        if (sheetName === 'Bookings') { try { insertResult.leadSync=syncCarBookingStatuses_(body.CustID); } catch(syncError) { insertResult.leadSync={error:String(syncError.message)}; console.error('CAR booking lead sync failed: '+syncError.message); } }

    return ContentService
      .createTextOutput(JSON.stringify(insertResult))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    if (!proofFilesCommitted && uploadedProofFiles.length) trashFilesQuietly_(uploadedProofFiles);
    console.error('CAR_CRM doPost failed: ' + diagnosticErrorMessage_(err));
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: formatErrorMessage_(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (lock && lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

// ─── ฟังก์ชันสำหรับ "กดอนุญาตสิทธิ์" (รันครั้งเดียว) ──────────────
// เลือกฟังก์ชันนี้ในเมนูด้านบนแล้วกด "เรียกใช้/Run"
// จะมีกล่องขออนุญาตเด้งขึ้น → Allow ให้เข้าถึง Google Sheets และ Google Drive
// doGet ตรวจสิทธิ์ได้ แต่ไม่เปิดหน้าขออนุญาต ต้องรันฟังก์ชันนี้จาก Apps Script
function authorizeOnce() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
  ]);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const names = ss.getSheets().map(function (s) { return s.getName(); });
  Logger.log('เข้าถึงสเปรดชีตสำเร็จ พบชีต: ' + names.join(', '));
  const payInFolder = getPayInImageFolder_();
  Logger.log('เข้าถึงโฟลเดอร์รูป PayIn สำเร็จ: ' + payInFolder.getName() + ' (' + payInFolder.getId() + ')');
  return { sheets: names, payInFolderId: payInFolder.getId() };
}

function verifyPayInDriveWriteOnce() {
  const folder = getPayInImageFolder_();
  const fileName = `__CAR_CRM_PAYIN_WRITE_CHECK_${Utilities.getUuid()}.png`;
  const bytes = Utilities.base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
  let file = null;
  try {
    file = folder.createFile(Utilities.newBlob(bytes, 'image/png', fileName));
    file.setDescription('CAR CRM PayIn Drive write check');
    const result = { created: file.getSize() > 0, size: file.getSize(), trashed: false };
    file.setTrashed(true);
    result.trashed = file.isTrashed();
    Logger.log(JSON.stringify(result));
    return result;
  } catch (err) {
    if (file) {
      try { file.setTrashed(true); } catch (trashError) { /* best effort cleanup */ }
    }
    console.error('CAR_CRM PayIn Drive write check failed: ' + diagnosticErrorMessage_(err));
    throw err;
  }
}

// ─── GET สำหรับทดสอบ ──────────────────────────────────────────
function doGet(e) {
  if (e && e.parameter && e.parameter.crmAuth === '1') return carCrmAuthStatus_();
  if (e && e.parameter && e.parameter.crmLead === '1') return carCrmAuthJson_({leadServiceVersion:1});
  const available = Object.keys(SCHEMA).join(', ');
  const response = { status: 'API ready', backendVersion: BACKEND_VERSION, sheets: available, leadSheetApi: 3 };
  if (String(e && e.parameter && e.parameter.driveCheck || '') === '1') {
    try {
      const authorization = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL, [
        'https://www.googleapis.com/auth/drive'
      ]);
      if (authorization.getAuthorizationStatus() !== ScriptApp.AuthorizationStatus.NOT_REQUIRED) {
        throw new Error('ยังไม่ได้รับอนุญาตให้เรียกใช้ Google Drive สำหรับสร้างและแก้ไขไฟล์ กรุณารัน authorizeOnce และอนุญาตสิทธิ์ Google Drive ให้ครบ');
      }
      const folder = getPayInImageFolder_();
      folder.getFilesByName('__CAR_CRM_PAYIN_READ_CHECK__').hasNext();
      response.drive = { ready: true };
    } catch (err) {
      console.error('CAR_CRM PayIn Drive check failed: ' + diagnosticErrorMessage_(err));
      response.drive = { ready: false, error: diagnosticErrorMessage_(err) };
    }
  }
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}
