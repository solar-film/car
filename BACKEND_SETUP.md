# ตั้งค่าระบบหลังบ้าน CAR CRM

ระบบปัจจุบันใช้ `customer-data.html` เป็นหน้าหลักสำหรับเพิ่ม/แก้ไขข้อมูลลูกค้าและคิวจอง

## ไฟล์ที่ต้อง deploy

- `Code.gs`
- `appsscript.json`

ให้ทำตามขั้นตอนใน `APPS_SCRIPT_DEPLOY.md`

## หมายเหตุสำคัญ

- `admin.html` ถูกถอดออกจากโปรเจกต์แล้ว
- `apps-script.gs` เป็น backend เก่าที่เคยใช้กับ `admin.html`
- อย่า deploy `apps-script.gs` สำหรับ `customer-data.html`
- ตั้งค่า Script Property `CAR_CRM_WRITE_TOKEN` ใน Apps Script ก่อน deploy เวอร์ชันใหม่
- รูป PayIn จะเก็บในโฟลเดอร์ AppSheet เดิม `CAR_CRM-691939189/Images/Pay_In`; ถ้าระบบยืนยันพาธอัตโนมัติไม่ได้หรือมีโฟลเดอร์ชื่อ `CAR_CRM-691939189` ซ้ำ ให้ตั้ง Script Property `CAR_CRM_PAYIN_FOLDER_ID` เป็น Folder ID ของโฟลเดอร์ `Pay_In`
- ชีต `PayIn` ต้องมีคอลัมน์ `หลักฐาน_1`, `หลักฐาน_2`, `หลักฐาน_3`, `หลักฐาน_4` เรียงต่อกันก่อนคอลัมน์ `วันที่บันทึกรายการ`
- ทุกหน้าที่เขียนข้อมูลจะถาม Write Token ครั้งแรกตอนบันทึก เก็บไว้ใน `localStorage` ของเครื่องนั้น และล้าง/ถามใหม่อัตโนมัติหนึ่งครั้งเมื่อ token เก่าหรือไม่ถูกต้อง
- ถ้าเจอ error เรื่องสิทธิ์ Sheets หรือ Drive ให้ตรวจว่า Apps Script มี `appsscript.json` ล่าสุด รัน `authorizeOnce()` อนุญาตทั้งสองสิทธิ์ แล้ว deploy เป็นเวอร์ชันใหม่
