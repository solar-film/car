// ============================================================
// Google Apps Script — รับข้อมูลฟอร์มขนาดกระจก → บันทึกใน Sheet
// วิธี Deploy:
//   1. เปิด Google Sheet → Extensions → Apps Script
//   2. วางโค้ดนี้ทับ Code.gs
//   3. Deploy → New deployment → Web app
//      - Execute as: Me
//      - Who has access: Anyone  (หรือ Anyone with Google account)
//   4. Copy URL ที่ได้ไปใส่ใน index.html (ตัวแปร GLASS_SIZE_SCRIPT_URL)
// ============================================================

const SHEET_ID   = '1u__xYWoWZpmrnquc-Fpk19WtpcrckxSd0-_G35NWxXQ';
const SHEET_NAME = 'ขนาดกระจก';

// คอลัมน์ตามลำดับใน Sheet (A–Q)
const COLUMNS = [
  'ID', 'JobID', 'รุ่นรถยนต์', 'ตำแหน่งติดตั้ง',
  'บานหน้า', 'บานหลัง',
  'ประตูหน้า-ซ้าย', 'ประตูหน้า-ขวา',
  'ประตูหลัง-ซ้าย', 'ประตูหลัง-ขวา',
  'บานฟิก-ซ้าย', 'บานฟิก-ขวา',
  'ซันรูฟ-ช่อง1', 'ซันรูฟ-ช่อง2',
  'แครี่บอย', 'หมายเหตุ', 'วันที่ลงรายการ'
];

// สร้าง ID รูปแบบเดียวกับ AppSheet: Size-YYMMDD-XXX
function generateSizeId() {
  const now = new Date();
  const yy  = String(now.getFullYear()).slice(2);
  const mm  = String(now.getMonth() + 1).padStart(2, '0');
  const dd  = String(now.getDate()).padStart(2, '0');
  const hex = Math.floor(Math.random() * 0x1000).toString(16).toUpperCase().padStart(3, '0');
  return `Size-${yy}${mm}${dd}-${hex}`;
}

// ตรวจสอบว่า ID ซ้ำไหม (optional)
function isIdUnique(sheet, id) {
  const data = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  return !data.some(row => row[0] === id);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const ss    = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);

    // สร้าง ID ที่ไม่ซ้ำ
    let id = body.ID || generateSizeId();
    let attempts = 0;
    while (!isIdUnique(sheet, id) && attempts < 10) {
      id = generateSizeId();
      attempts++;
    }

    // เวลา timestamp (Thai format)
    const now = new Date();
    const timestamp = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()+543} ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

    // เรียงค่าตามลำดับ COLUMNS
    const row = COLUMNS.map(col => {
      if (col === 'ID')             return id;
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

// สำหรับทดสอบ GET (เปิด URL ใน browser แล้วดูผล)
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'GlassSize API ready' }))
    .setMimeType(ContentService.MimeType.JSON);
}
