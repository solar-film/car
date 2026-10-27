# CAR CRM · ชุดตรวจ P0 แบบ offline

วันที่ 27 ตุลาคม 2569 · เฉพาะ CAR CRM · ยังไม่อนุมัติ merge/deploy

ชุดนี้พร้อมให้ตรวจโค้ดและผลทดสอบ แต่ P0 ทั้งระบบยังไม่ผ่านเกณฑ์เปิดใช้งาน: ยังไม่ได้ตรวจ deployment/ชีตจริง และยังมีข้อบกพร่องใน source เดิมตาม [รายงานตรวจ](P0_REVIEW_20261027.md)

## ทดลองในเครื่อง

ใช้ Node 24 และเปิด terminal ที่ root ของ development checkout:

```powershell
node experiments/p0/run-checks.cjs
node experiments/p0/demo.cjs
```

ไม่ต้องติดตั้ง package หรือกรอก credential คำสั่งเหล่านี้ไม่เปิด server ไม่อ่าน env ไม่เรียก Google/Ads และไม่บันทึกลง Sheets ใช้เฉพาะไฟล์ source กับข้อมูลสมมติในหน่วยความจำ

`run-checks.cjs` ตรวจ syntax, assertion script เดิม และ `node:test` 71 tests ในสองไฟล์ใหม่ โดย 30 tests รันพฤติกรรม source เดิม/transport/report และ 41 tests ตรวจ audit/preflight ส่วน tests ที่ขึ้นต้น `P0-xx reproduction` ยืนยันว่าปัญหาเดิมยังเกิดขึ้นได้ การที่ tests กลุ่มนี้ผ่าน **ไม่ได้แปลว่าปัญหาได้รับการแก้แล้ว**

`demo.cjs` แสดงตัวอย่างลูกค้า 1 คน มี 2 Lead และ 2 คิว: สถานะเสร็จสิ้น 1 คิว และคิวนัดอนาคต 1 คิว จึงเห็นความต่างของตัวหารโดยไม่ใช้ข้อมูลลูกค้าจริง

## ขอบเขตของเครื่องมือตรวจ

- `apps-script-fixture.cjs`: รัน `Code.gs`, `LeadSheet.gs`, `CarContactHistory.gs`, `CarBookingStatusSync.gs` จาก checkout นี้ใน VM; จำลองบริการ Sheets/lock/readback ด้วยหน่วยความจำ
- `legacy-regression.test.cjs`: ตรวจ retry, รหัสเดิม, stale edit, schema, token, lock, วันที่ พ.ศ., การอ่านรายงานล้มเหลว และทำซ้ำข้อบกพร่องเดิม
- `staging-audit.cjs`: pure functions `validateStagingConfig(config, productionInventory)` กับ `auditSnapshot(snapshot, expected, asOf)`; ไม่มี I/O หรือการแก้ข้อมูล
- `synthetic-fixture.cjs`: snapshot สมมติที่คืนสำเนาใหม่ทุกรอบ ไม่ใช้หมายเลขโทรศัพท์จริง

`auditSnapshot` ต้องได้รับ spreadsheet ID, ชื่อแท็บ, gid, headers และขอบเขต snapshot ที่ครบจากผู้ดูแล ไม่ค้นหาแท็บสำรอง ไม่เพิ่มคอลัมน์ และไม่จับคู่ด้วยชื่อ ตัวอย่างมีเพียงคอลัมน์ที่เครื่องมือใช้ตรวจ ส่วน snapshot ที่ได้จริงต้องรักษาคอลัมน์อื่นครบด้วย

เมื่อ spreadsheet/schema/primary key ไม่ตรง จะได้ `ok:false` และ `counts:null` เมื่อพบความสัมพันธ์หรือวันที่ที่ต้องตรวจ จะได้ `ok:false` พร้อม issue code/เลขแถวและ counts สำหรับวินิจฉัยเท่านั้น **ห้ามนำ counts ที่ `ok:false` ไปแสดงเป็นรายงานสำเร็จ** ไม่ส่งชื่อ เบอร์โทร หรือค่ารหัสใน issues

วันที่รับเข้าเครื่องมือเป็น `YYYY-MM-DD` ค.ศ. ที่ normalize จาก adapter ที่ตรวจแล้ว; `asOf` เป็นวันที่ Asia/Bangkok เครื่องมือนี้ไม่เปลี่ยน format ในชีต ไม่คำนวณยอดขาย VAT กำไร CAC หรือ attribution และ `completed` หมายถึงจำนวนแถวที่ระบุ Status ว่า `เสร็จสิ้น` เท่านั้น ยังไม่ใช่การรับรองงานติดตั้งจริงจากหลักฐานหน้างาน

`validateStagingConfig` เป็นการตรวจค่าที่ส่งเข้าแบบ offline ต้องมี inventory ของ Production ที่ตรวจครบก่อนใช้ มันไม่ได้เปลี่ยน hardcoded endpoints ในหน้าเว็บและไม่ได้ sandbox browser ให้เอง อย่าใช้ผล `ok:true` เป็นเหตุให้เปิดเว็บที่ยังชี้ Production

ขั้นตอนจัด staging จริง, การสำรอง, rollback และรายการที่ต้องขออนุมัติอยู่ใน [STAGING_PLAN.md](STAGING_PLAN.md)
