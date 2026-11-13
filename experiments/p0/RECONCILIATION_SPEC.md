# ข้อกำหนดกระทบยอด P0 · CAR CRM

28 ตุลาคม 2569 · Asia/Bangkok · สำหรับรีวิวและทดสอบ staging เท่านั้น

เอกสารนี้กำหนดหลักฐานที่ต้องมีเพื่อรับรองข้อมูล ไม่อนุมัติอ่าน/เขียน Production, สร้าง Google assets, เปลี่ยน schema, backfill, merge หรือ deploy ไม่มีข้อมูลลูกค้าจริงหรือ credential

## ขอบเขตของเครื่องมือปัจจุบัน

`reconciliation.cjs` รับเฉพาะ snapshot จาก local synthetic model และตรวจทุกแถวรวมคิวที่ยกเลิก ไม่ใช่ตัวอ่าน Google Sheets และไม่รับรองว่า snapshot ภายนอกครบ `scope` เป็น `ALL_SYNTHETIC_ROWS_INCLUDING_CANCELLED` เสมอ ห้ามใส่ข้อมูลจริงแล้วใช้ผลนี้รับรอง Production

เมื่อ schema, รูปร่างแถว, ID, link, วัน หรือประวัติผิด ต้องคืน `ok:false, counts:null` ไม่เติมช่องที่ขาด ไม่ตัดช่องเกิน ไม่เลือกแถวแรก ไม่รวมลูกค้าจากชื่อ และไม่ซ่อมข้อมูลต้นฉบับ ผล issue เปิดเผยเฉพาะ code/table/row ไม่มีค่าจากแถว `auditSnapshot` อาจมี diagnostic counts เมื่อพบ semantic issues; ใช้ตรวจสาเหตุเท่านั้น ห้ามนำไปเป็นยอดรับรอง

ก่อนสร้างตัวอ่าน snapshot จริง ต้องมี manifest ที่ผู้ดูแลยืนยัน: environment, spreadsheet, project/deployment/version, origin, เวลาอ่านเริ่ม/จบ, Asia/Bangkok, รายชื่อแท็บ/gid, header ตามลำดับ, ช่วงที่อ่าน, จำนวนแถวต้นทาง และสิทธิ์อ่าน กำหนดวิธี freeze/version หรืออ่านซ้ำเพื่อพิสูจน์ว่าไม่มีธุรกรรมเปลี่ยนระหว่างอ่านหลายแท็บ การอ่านบางตารางสำเร็จไม่ใช่ snapshot ครบ ห้ามเดา target หรือ fallback ไป Production

ข้อมูลจริงหรือ masked snapshot ต้องอนุมัติช่วงเวลา/คอลัมน์/ผู้เข้าถึง/ที่เก็บ/อายุเก็บแยกก่อน หากใช้ pseudonym ให้คงความสัมพันธ์ข้ามแท็บด้วย mapping ส่วนตัวเดียวกัน ห้ามนำ mapping, โทรศัพท์, ชื่อ หรือแถวจริงเข้า Git/CI/log/screenshot

## หน่วยนับและกฎตรวจความสัมพันธ์

| แหล่ง | หน่วยนับ | ตรวจ |
|---|---|---|
| lead | distinct Lead ID | ID ไม่ว่าง/ไม่ซ้ำ, วันที่ถูกต้อง; ลูกค้าคนเดียวมีหลาย Lead ได้ |
| Customer | distinct CustID | ID ไม่ว่าง/ไม่ซ้ำ; เบอร์ normalized ซ้ำส่งตรวจ ไม่ merge |
| Bookings | distinct JobID | CustID ต้องพบหนึ่งราย; Lead ID ที่ระบุต้องพบ; ไม่มี Lead ID เป็น legacy review ไม่ backfill |
| ประวัติการติดต่อ | distinct Contact ID | Lead ID ต้องพบ, วันเวลาติดต่อถูกต้อง; ไม่ใช้จำนวนประวัติเป็นจำนวนลูกค้า |
| PayIn | distinct Pay_ID | JobID ต้องพบ; จำนวนรายการชำระไม่เท่ากับจำนวนคิว/ยอดขาย |

รักษา JobID เดิมต่อการ retry; ไม่ dedup คิวคนละ JobID ด้วยชื่อ/โทร/วันเดียวกัน ความสัมพันธ์ Lead เดียว→หลาย CustID, เบอร์ขัดแย้ง และ duplicate ID ต้องส่งตรวจพร้อม row locator แบบ private ไม่มีผู้ชนะอัตโนมัติ คิวที่ไม่มี Lead ID และข้อมูลเก่าที่ไม่ครบต้องคงอยู่ในฐานกระทบยอดพร้อมเหตุผล ไม่ซ่อนออกเพื่อให้ตัวเลขตรง

## เวลาและฐานประชากร

- วัน Lead, วันติดตั้ง, วันเวลาติดต่อ, เวลากิจกรรม, เวลาแก้ไข และวันรับชำระเป็นคนละฟิลด์ ห้ามแทนกันด้วย latestContactTimestamp
- ISO ที่มี Z/offset และ Date ที่เป็น instant แปลงเป็นวัน Asia/Bangkok ก่อนแบ่งเดือน เช่น `2026-10-31T18:00:00Z` อยู่วันที่ 1 พ.ย. ส่วน `2026-11-01T01:00:00+09:00` อยู่วันที่ 31 ต.ค.
- ISO ที่ไม่มี offset และวันเวลาไทยเป็น Bangkok wall time ตรวจวันจริงและเวลา 00:00–23:59:59 ก่อนคำนวณ ปฏิเสธ rollover/invalid Date แทน throw หรือเปลี่ยนวันเอง รองรับ พ.ศ./ค.ศ.; ปีสองหลักคงกฎเดิมใน local helper (`69`→2026) ไม่ใช้แทนข้อกำหนดสำหรับข้อมูลจริงที่ยังไม่ยืนยัน
- เครื่องมือปัจจุบันนับทั้ง snapshot ไม่กรอง cohort/เดือน; asOf ใช้ตรวจคิวเสร็จสิ้นในอนาคต ไม่ใช่วันตัดยอดรายได้
- รายงานที่จะกระทบยอดต้องระบุช่วง `[เริ่ม, สิ้นสุด)` และฟิลด์วันที่ฐานของแต่ละยอด แยก Lead cohort ตามวันเข้าออกจาก installation cohort ตามวันติดตั้ง ไม่หารข้าม cohort โดยไม่มีนิยาม conversion window

## ตารางเปรียบเทียบก่อนรับรองยอด

| ยอด | ฐานที่ต้องตกลง | สถานะ |
|---|---|---|
| Lead | distinct Lead ID ตามวันเข้า; แยกข้อมูลเก่า/แถวไม่มีรหัส | ยังไม่เทียบข้อมูลจริง |
| Contact | เหตุการณ์ตาม Contact ID; แยก legacy daily override/กิจกรรมสถานะจากการติดต่อจริง | ต้องยืนยัน metric policy |
| Booking | distinct JobID ทั้งชุด แยก scheduled/in progress/completed/cancelled/unknown | มี local synthetic tests |
| Completed | distinct JobID สถานะเสร็จสิ้น วันถูกต้องไม่เกิน asOf | ยังไม่ใช่หลักฐานรถติดตั้งจริง; ต้องตรวจงาน/UAT |
| Sales | จัดประเภทใหม่/เก่า/เคลม/แก้ในวัน/งานค้าง/ค่าว่างตามกฎรายงานที่ยืนยัน | ยังไม่เปลี่ยน KPI เดิม |
| Revenue | ยอดจอง/สุทธิส่วนลด/VAT/เงินรับ/คืนเงิน/เครดิต แยกกัน ระบุวันรับรู้และการปัดเศษ | ไม่คำนวณรับรอง; `revenueVerified:false` |

รายงานเดิมอาจรวมคิวล่วงหน้า จึงไม่เท่ากับ completed หรือเงินรับ ใน comparison pack ต้องมี source version, report version/filter/cohort, distinct IDs ที่ปิดบัง, ยอดต้นทาง/ยอดรายงาน/ส่วนต่าง และจำนวนข้อผิดพลาดแยกเหตุผล ยอดทุกกรณีต้องตรวจทั้งข้อมูลที่ซ่อน/ยกเลิกและงานค้างตามฐานที่ตกลง ห้ามใช้เฉพาะรายการที่แสดงบนหน้าจอ

## ด่าน writer และ Google Staging

ใช้ strict direct-writer probes แยกจาก regression: ต้องเรียก doPost ของ candidate ที่ระบุ hash โดยตรง ไม่ผ่าน mutation guards ของ staging-model ขณะนี้ private candidate ผ่าน valid save/readback, retry ที่ยังมี cache, invalid token และ lock unavailable; ยังไม่ผ่าน missing/orphan CustID, retry หลัง cache eviction, mutation ID เดิมแต่ payload ต่าง และ retry หลัง append ที่อ่านกลับไม่ผ่าน

ข้อเสนอแก้ writer สำหรับรอบถัดไป: ตรวจ identity ก่อนเขียน; เก็บ durable mutation reservation/result พร้อม payload fingerprint และ JobID ภายใต้ lock; อ่านกลับสถานะเดิมเมื่อ retry หลัง partial write; mutation เดิมต่าง payload ต้อง conflict; cache ใช้เร่งอ่านเท่านั้น ต้องตกลงพฤติกรรมของคิวเก่าที่ไม่มี CustID และ client ที่ไม่มี mutation ID ก่อนแก้ candidate writer ห้ามเพิ่มคอลัมน์เองหรือ deploy public Code.gs เป็น complete bundle

บน Google Staging ที่แยกจริง ต้องตรวจ concurrent requests, lock contention, timeout/quota, cache expiry, retry หลัง partial write, auth/ACL, formulas/notes/validation/protection, backup→restore→readback และ version drift ซึ่ง memory VM ยังยืนยันไม่ได้ ให้ฝ่ายขาย/ช่าง UAT ก่อนขออนุมัติ merge/deploy แยก

## เงื่อนไขปิด P0

1. Google Staging และ inventory ได้รับอนุมัติ/ยืนยัน ปิด trigger/webhook/Ads และไม่มี Production fallback
2. Candidate writer ผ่าน identity/idempotency/partial-write gates โดยตรง พร้อม complete private bundle/hash/version
3. Snapshot ที่อนุมัติครบและ consistent; กระทบยอด ID/link/cohort/metric policy แล้ว ไม่มีส่วนต่างที่ไม่อธิบาย
4. Google regression, backup/restore และพนักงาน UAT ผ่าน; สาเหตุ read error จริงมีหลักฐานปิดบังข้อมูล
5. ผู้ใช้อนุมัติ merge/deploy แยกภายหลัง งานนี้ยังไม่ปิด P0 และไม่เปลี่ยน GOOD ERP/โฆษณา/Production
