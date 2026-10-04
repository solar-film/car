# CAR CRM Mobile

หน้า PWA สำหรับมือถือที่แสดงเฉพาะตารางนัดหมายติดตั้งฟิล์มและฟอร์ม PayIn

## Isolation

- หน้าเว็บอยู่ใต้ `/mobile/` และไม่แก้ `index.html` หรือหน้าเดสก์ท็อปเดิม
- service worker มี scope เฉพาะ `/mobile/`
- service worker cache เฉพาะไฟล์ shell ในโฟลเดอร์นี้ ไม่ cache Google Sheets, Apps Script, ข้อมูลลูกค้า, รูปสลิป หรือ POST
- mobile ใช้ Apps Script deployment แยกจาก URL ของระบบเดิม

## Data rules

- อ่านเฉพาะ `Bookings`, `Customer` และ `PayIn`
- รายการที่ `Bookings.Status` มีค่า `ยกเลิก` จะถูกตัดออกก่อนนับ ค้นหา และแสดงผลทุกกรณี
- PayIn ใช้ `upsertPayIn` เพื่อไม่สร้างแถวซ้ำเมื่อมือถือ retry
- แนบรูปสลิปได้สูงสุด 4 รูป และส่งทีละรูปผ่าน `attachPayInProof` พร้อม `clientRequestId` เพื่อให้ retry เดิมไม่สร้างไฟล์ซ้ำ

## Apps Script setup

1. เพิ่มคอลัมน์ `หลักฐาน_3` และ `หลักฐาน_4` ในชีต `PayIn` ต่อจาก `หลักฐาน_2` และก่อน `วันที่บันทึกรายการ`
2. ตั้ง Script Property `CAR_CRM_PAYIN_FOLDER_ID` เป็น Folder ID ของ `CAR_CRM-691939189/Images/Pay_In`
3. ให้ manifest มี scopes `spreadsheets` และ `drive`
4. รัน `authorizeOnce()` และอนุญาต Sheets + Drive
5. สร้าง Web app deployment ใหม่สำหรับ mobile โดยไม่แก้ deployment เดิม
6. นำ URL `/exec` ของ deployment ใหม่ไปแทน `__MOBILE_SCRIPT_URL__` ใน `app.js`

## Tests

```powershell
node tests\mobile-core.test.cjs
node tests\apps-script-payin.test.cjs
```
