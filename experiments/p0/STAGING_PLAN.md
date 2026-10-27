# Staging / Backup / Rollback Plan · CAR CRM

27 ตุลาคม 2569 · แผนสำหรับตรวจรับ P0 · ยังไม่ได้ provision หรือ deploy staging ที่เชื่อม Google

## สิ่งที่พร้อมแล้ว

VM สำหรับรัน writer/status sync เดิมกับตารางในหน่วยความจำ, snapshot audit, config preflight, fixtures สมมติ และ CI อยู่ใน PR นี้ รันผ่าน `node experiments/p0/run-checks.cjs` โดยไม่ต้องใช้ credential

อ่าน `DESIGN.html` ของ workspace แล้ว งานนี้ไม่มี UI ใหม่ หากมี integration หน้าเว็บ ให้ใช้ Design System เดิมและทดสอบ desktop/mobile พร้อมชื่อหน้า/เมนูเดิม

## 1. ยืนยัน source และเป้าหมายก่อนเชื่อมต่อ

- ให้เจ้าของอนุมัติ read-only live source/manifest/deployment version ก่อน; เทียบไฟล์ทุกไฟล์ใน project กับชุดที่จะใช้ พร้อม hash และระบุ version ที่ client เรียกจริง ไม่ใช้ประวัติ v97 เป็นการยืนยันสถานะปัจจุบัน
- ทำ inventory แยก Production/Staging: repository, branch, hostname/origin, Apps Script project/deployment, spreadsheet ID, timezone `Asia/Bangkok`, tab name/gid, headers ตามลำดับ, ช่วงอ่านและสิทธิ์ผู้ดูแล เก็บไฟล์ config จริงเป็น private local file ที่ไม่ tracked
- ต้องใช้ staging spreadsheet และ Apps Script project/deployment คนละตัวกับ Production, origin คนละ host และ credentials คนละชุด ห้ามเพียงเปลี่ยน URL path บน `solar-film.github.io`
- เจ้าของกรอก credential เองใน secret store/Script Properties ของ staging ห้ามคัดลอก token จาก Production หรือใส่ลง PR
- ยืนยันเป้าหมายจาก metadata จริงก่อนสร้าง/เขียนแท็บ ไม่มีคำสั่งให้แก้ schema จริงในงานนี้ หาก target ไม่ชัดเจน ให้หยุดการเชื่อมต่อและใช้ fixtures ต่อ

## 2. ปิดทางเชื่อม Production ก่อนเปิด browser

หน้าเดิมมี hardcoded Apps Script endpoint, spreadsheet ID และเงื่อนไข hostname; บาง path เรียก Apps Script แม้เปิด localhost นอกจากนี้ writer/sync ตรวจ lead gid แบบ hardcoded ดังนั้น config preflight อย่างเดียวไม่เพียงพอ

จัด staging bundle ใน integration PR โดยส่ง endpoint/spreadsheet/gid ผ่าน config ที่ตรวจครบ ไม่มี default/fallback ไป Production ตรวจทั้ง `crm-auth.js`, `lead-sheet.js`, `lead-data-app.js`, HTML รายงาน/ฟอร์ม, mobile และ Node adapters ที่ใช้จริง แยก cookie/localStorage/session origin และห้ามเก็บชุด config จริงใน public payload

ก่อนเปิดหน้าใด ต้องผ่าน:

1. `validateStagingConfig` โดยมี production inventory ครบ ไม่ใช้ค่าตัวอย่างจาก tests เป็น inventory จริง
2. สแกน artifact ว่าไม่มี Production ID/endpoint ตาม inventory; ตรวจ dependency และ Service Worker cache ด้วย
3. กำหนด CSP/เครือข่ายให้เชื่อมได้เฉพาะปลายทาง staging ที่ยืนยันแล้ว บล็อก Production แม้ caller เขียน URL คงที่
4. ปิด webhook, capture/nightly/sync triggers, Ads conversions/export และ routing ที่ใช้ร่วมกับระบบอื่น
5. ใช้ allowlist ที่ตรวจแล้วในการเสิร์ฟ ห้ามเสิร์ฟ workspace ทั้งชุด; ไม่รวม env/auth/SQLite/tmp/backups/tests/backend source

## 3. เตรียมข้อมูลทดสอบ

เริ่มด้วยข้อมูลสมมติเท่านั้น คงชื่อและโครงสร้างคอลัมน์ สูตร รูปแบบ notes validation และ protection ที่ผู้ดูแลยืนยันแล้ว ใช้ `Lead ID`/`CustID`/`JobID`/`Pay_ID` ของ fixture แยกจากข้อมูลจริง

การนำข้อมูลจริงมาทำ snapshot หรือสำเนาทดสอบต้องอนุมัติก่อน ระบุช่วงและความจำเป็น ให้ผู้ดูแลลบ/แทน PII ก่อนส่งเข้าเครื่องมือ ตรวจครบทั้งรายการที่ซ่อนและยกเลิก ไม่ export ข้อมูลจริงเข้า public repository/artifact/CI logs

ก่อน audit ให้ adapter ที่ผ่านการตรวจ normalize พ.ศ./ค.ศ. และวันเวลาเป็น Asia/Bangkok โดยเก็บค่าต้นฉบับไว้ใน private snapshot ห้ามใช้ `latestContactTimestamp` เป็นเวลาแก้ไขทุก field การมีหลาย Lead/หลายคิวต่อลูกค้าอาจถูกต้อง ให้ตรวจ FK และบริบท ห้ามรวมเพราะชื่อเหมือนกัน

## 4. Acceptance matrix บน staging จริง

| กระบวนการ | กรณีที่ต้องผ่าน | หลักฐาน |
|---|---|---|
| read/auth | อ่าน Lead/report ปกติ, หมด session, 401/403, HTML แทน CSV, schema เปลี่ยน, upstream timeout | error ชัดเจน, ไม่รายงานศูนย์สำเร็จ, ข้อมูลเดิมยังอยู่พร้อมป้าย stale, ไม่มี request ไป Production |
| Lead | สร้าง/แก้/ติดตาม/ประวัติติดต่อ, ส่งคำขอเดิมซ้ำ, ขาดรหัส, concurrent edit, interrupted write, formula text | Lead ID/แถวเดิมคงเดิม, เก็บ history เดิม, lock/stale protection ทำงาน, readback ตรง |
| Booking | ลูกค้าคนเดิมหลาย Lead/หลายรถ/หลายคิว, ระบุ Lead ID, legacy ไม่ระบุ, ซ้ำ/กำกวม, ยกเลิก/เลื่อน/เสร็จสิ้น | แสดงผลแต่ละ JobID ถูก Lead ไม่เปลี่ยน Lead อื่น; กำกวมเข้า review; ไม่ backfill อัตโนมัติ |
| Customer/PayIn | CustID ขาด/ซ้ำ, JobID/Pay_ID ผิดคู่, retry create/update, เบอร์ซ้ำ | ไม่สร้างซ้ำ/เขียนผิดงานและอ่านค่ากลับได้; คอลัมน์ที่ไม่เกี่ยวข้องไม่เปลี่ยน |
| รายงาน | แยก contact rows/unique Lead/customer/booking/สถานะเสร็จสิ้น; คิวอนาคต เคลม แก้ ยกเลิก คืนเงิน | กระทบยอดทั้งฐานตาม cohort/date/status ที่อนุมัติ; sales value ไม่ถูกอ้างว่า installed revenue |
| UI | Lead/booking/report/login ทุกหน้าที่กระทบที่ desktop 1366px และ mobile 375px | ปุ่ม/การโหลด/ข้อมูล/ข้อความ error และเมนูชื่อหน้าใช้ได้ตาม DESIGN.html; screenshot ข้อมูลสมมติเท่านั้น |
| restore | คืน source/config/fixtures ลง staging ที่แยกไว้ | เปรียบเทียบ hash/schema/formula/notes/validation/counts/IDs และลองอ่าน/บันทึก test record ได้ |

รัน audit ทั้ง dataset ทุกครั้งที่ปรับ mapping; schema/ID ผิดต้องหยุด อย่าเขียนบางส่วนแล้วรายงานสำเร็จ กรณี readback ล้มหลัง write ให้ตรวจรายการเดิมและ retry ด้วย mutation/lead key เดิม ห้ามสร้างรหัสใหม่ชดเชย

## 5. Backup ก่อนการเปลี่ยนแปลงที่ได้รับอนุมัติ

งาน offline นี้เก็บฐาน source ที่ commit `4d86be8ec45b52138d573cd910c0b49711a8a21e` และสำรอง workflow เดิม/HANDOFF ใน private tmp ของ workspace ไม่มีการทำ backup Production ในรอบนี้

ก่อน deploy ภายหลัง ให้ผู้ดูแลจัดเก็บในพื้นที่ private ที่กำหนดสิทธิ์: source+manifest ทุกไฟล์พร้อม version/deployment URL, config names/สถานะโดยไม่แสดง secret, spreadsheet ทั้งค่า/สูตร/รูปแบบ/notes/validation/protection/ACL, และ manifest hash/count/IDs หากมี Node SQLite ต้องสำรองแบบรองรับ WAL หรือหยุดบริการตามแผน ทดสอบ restore ใน staging ก่อนจึงถือว่า backup ใช้งานได้

## 6. Rollback

- ชุด offline นี้: revert เฉพาะ commit P0 บน development branch; คงไฟล์ Production และงานเดิมของคนอื่นไว้ ห้าม force push หรือ reset main
- ก่อน integration/deploy: บันทึก version ของ Apps Script และ Pages source/artifact ที่ใช้อยู่จริงก่อนเปลี่ยนทุกครั้ง
- หาก read/write/auth/reconciliation ผิด: หยุด rollout และ triggers ใหม่ คืน client artifact กับ Apps Script version ที่บันทึกไว้ภายใต้การอนุมัติเดิม ตรวจคู่เวอร์ชัน PayIn `BACKEND_VERSION` และ client ที่ใช้ร่วมกัน
- การย้อน source ไม่ย้อนข้อมูลที่เขียนไปแล้ว ห้าม restore ชีต Production ทับทั้งชุดทันที ต้องทำ diff รายการที่เปลี่ยน ตรวจ FK/idempotency แล้วให้เจ้าของอนุมัติแผนซ่อมข้อมูลเฉพาะรายการ

## 7. สิทธิ์และขั้นตอนที่ยังรอ

ได้รับอนุญาตแล้ว: ตรวจโค้ด/fixtures/tests/เอกสารใน development branch และส่งรายงานใน PR

ยังรอ: read-only live source/schema/log ที่ปิดบังข้อมูล, เป้าหมายและบัญชี staging ที่ยืนยันแล้ว, snapshot ที่อนุญาต, การทดสอบ restore/UAT และการอนุมัติ merge/deploy แยกต่างหาก การแก้ Sheets schema/ลูกค้า Production/Ads/GOOD ERP ไม่อยู่ในรอบนี้
