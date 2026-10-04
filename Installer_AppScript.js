// ============================================================
// Google Apps Script — รับข้อมูลฟอร์มทีมช่างติดตั้ง → บันทึกใน Sheet
// วิธี Deploy: เหมือนกับ GlassSize_AppScript.js
//   1. เปิด Google Sheet → Extensions → Apps Script
//   2. สร้าง Script ใหม่ หรือเพิ่ม function ใน project เดิม
//   3. Deploy → New deployment → Web app
//      - Execute as: Me
//      - Who has access: Anyone
//   4. Copy URL → ใส่ใน index.html (INSTALLER_SCRIPT_URL)
// ============================================================

const SHEET_ID_INS   = '1u__xYWoWZpmrnquc-Fpk19WtpcrckxSd0-_G35NWxXQ';
const SHEET_NAME_INS = 'Detail_Installer';

const COLUMNS_INS = [
  'Ins_ID', 'JobID', 'ตำแหน่งติดตั้ง',
  'บานหน้า', 'บานหลัง',
  'ประตูหน้า-ซ้าย', 'ประตูหน้า-ขวา',
  'ประตูหลัง-ซ้าย', 'ประตูหลัง-ขวา',
  'บานฟิก-ซ้าย', 'บานฟิก-ขวา',
  'ซันรูฟ-ช่อง1', 'ซันรูฟ-ช่อง2',
  'แครี่บอย', 'วันที่ลงรายการ'
];

// สร้าง ID รูปแบบเดียวกับ AppSheet: DT-YYMMDD-XXX
function generateInsId() {
  const now = new Date();
  const yy  = String(now.getFullYear()).slice(2);
  const mm  = String(now.getMonth() + 1).padStart(2, '0');
  const dd  = String(now.getDate()).padStart(2, '0');
  const hex = Math.floor(Math.random() * 0x1000).toString(16).toUpperCase().padStart(3, '0');
  return `DT-${yy}${mm}${dd}-${hex}`;
}

function isInsIdUnique(sheet, id) {
  const data = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  return !data.some(row => row[0] === id);
}

function doPost(e) {
  try {
    const body  = JSON.parse(e.postData.contents);
    const ss    = SpreadsheetApp.openById(SHEET_ID_INS);
    const sheet = ss.getSheetByName(SHEET_NAME_INS);

    let id = generateInsId();
    let attempts = 0;
    while (!isInsIdUnique(sheet, id) && attempts < 10) {
      id = generateInsId();
      attempts++;
    }

    const now = new Date();
    const timestamp = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()+543} ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

    const row = COLUMNS_INS.map(col => {
      if (col === 'Ins_ID')          return id;
      if (col === 'วันที่ลงรายการ') return timestamp;
      return body[col] !== undefined ? body[col] : '';
    });

    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, id }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'Installer API ready' }))
    .setMimeType(ContentService.MimeType.JSON);
}
