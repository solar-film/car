# CAR CRM · Staging / Backup / Rollback

27 ตุลาคม 2569 · ยังไม่ deploy หรือ provision Google Staging

## สิ่งที่พร้อม

Local Staging ที่127.0.0.1:3193 เสิร์ฟหน้าเดิม/ข้อมูลสมมติ ปิด Production ผ่าน endpoint transformation/local dependencies/CSP/allowlist มี CLI fault/snapshot/restore/reconcile ตาม [README](README.md)

อ่าน source/manifest/deployment และ metadata/header Production ตามอนุมัติแล้ว Source editor7ไฟล์ตรง private release97 และ active deployment97 ตรง endpoint ของ client ไม่มีแถวลูกค้าถูกอ่าน Private candidateครบ7ไฟล์เปลี่ยนเฉพาะ planner มี hashes/deployAllowed:false ไม่มี deploy config

UI ใช้ DESIGN.html ของ workspace คงฟอร์ม/เมนูเดิม คำเตือน stale ใช้ #fffbeb/#92400e/#fcd34d ระยะ12/16px radius12px ตรวจ Desktop/Mobile ข้อมูลสมมติแล้ว

## ขั้นถัดไปที่ต้องยืนยันก่อนเชื่อม Google

1. เจ้าของยืนยัน staging spreadsheet/project/deployment/origin/ผู้ดูแล แยกทุกตัวจาก Production ไม่ใช้เพียง path ใหม่บน solar-film.github.io และไม่มี Production fallback
2. การสร้าง/คัดลอก Google assets หรือข้อมูลต้องได้รับอนุมัติขอบเขตก่อน เจ้าของกรอก credential เองใน secret store ไม่คัดลอก Production token/รหัสผ่านเข้า PR/แชต
3. Inventory จริงมี spreadsheet/tab/gid/header ตามลำดับ/timezone/ช่วงอ่าน/สิทธิ์ ก่อนเขียน หากไม่ตรงหยุด ไม่เพิ่มแท็บ/คอลัมน์เพื่อหลบ error
4. ปิด Ads/conversion/export/webhook/capture/nightly/sync triggers/routing ร่วมใน staging ตรวจ payload ไม่รวม env/auth/SQLite/tmp/backups/tests/backend
5. Source ที่จะ deploy ต้องเทียบ snapshot ใหม่ครบทุกไฟล์ ไม่ใช้ Code.gs ใน public repo แทน complete live bundle หาก live version เปลี่ยนตรวจ drift ใหม่

เริ่มข้อมูลสมมติทุกตาราง คง schema/formulas/formats/notes/validation/protection ที่ยืนยันแล้ว การนำข้อมูลจริงมาทำ masked snapshot ต้องอนุมัติแยกและเก็บส่วนตัว ห้ามแถวลูกค้าจริงใน test/screenshot

## Acceptance matrix

| กลุ่ม | Local ล่าสุด | ต้องตรวจ Google Staging/UAT |
|---|---|---|
| Lead | create/update/history/stale/retry/IDเดิม/invalid schema | สิทธิ์จริง lock concurrent request notes/formulas/readback |
| Customer→Booking | explicit link และ new Customer auto-book รักษา Lead ID | duplicate phone/ID/generic writer guards ที่ยังเป็น wrapper; พนักงานใช้จริง |
| Status | ใหม่→กำลังติดตั้ง→เสร็จสิ้น/ยกเลิก ไม่ปน Lead | คิวเก่า/หลายรถ/หลาย Lead/ยกเลิกแล้วเปิดใหม่/manual review legacy |
| Read failures | first read/refresh/session/HTML CSV คงแถวเดิม/ล็อกแก้ | timeout/401/403/GViz schema drift/partial dependency จริง |
| Reports | contact/sales/overview/install-summary 2ขนาด ISO/พ.ศ./ยอดสมมติตรง | snapshotครบรวมhidden/canceled; metric policy/refund/VAT/payment |
| Backup | memory snapshot/restore readback/ID/history/formats/notes | สำเนา Google กู้จริง ACL/protection/formulas/Script Properties/trigger inventory ไม่เผย secret |
| UI | Desktop1366×900/Mobile375×812 ฟอร์ม/โหลด/ปุ่ม/คำเตือน | ฝ่ายขาย/ช่าง UAT ตามบทบาท/browser ทุกหน้าที่กระทบ |

หาก schema/ID/link/history ผิด หยุดยอดรับรอง ไม่ทิ้งแถวเงียบ ไม่ backfill อัตโนมัติ ตรวจ readback ก่อนรายงานสำเร็จ Test green ไม่ยืนยัน permission/integration จริง

## Backup และ rollback ก่อนเผยแพร่

- เก็บ sourceครบ/manifest/deployment version/Pages commit/file manifest พร้อม hash วันที่ Asia/Bangkok/ผู้รับผิดชอบ ส่วนตัว
- สำรอง staging Sheets ทุกแท็บที่กระทบ พร้อมสูตร/format/notes/validation/protection และซ้อม restore ในสำเนาทิ้งได้ก่อน UAT เก็บข้อมูลลูกค้า/credential นอก Git/public
- ซ้อม create/update/retry/status แล้ว restore ตรวจ ID/count/link/history/สูตรตรง backup ไม่ใช้เพียง HTTP200
- ก่อน Production ต้องอนุมัติ merge/deploy/backup ชัดเจน หยุดเขียนช่วงเปลี่ยนรุ่นตามผู้ดูแลตกลง เก็บ endpoint เดิมถ้าไม่มีคำสั่งเปลี่ยน
- หากอ่าน/บันทึก/สถานะ/ยอดกระทบ หยุด rollout/เขียน คืน frontend commit/Apps Script version ก่อนหน้าที่บันทึกไว้ ตรวจ source/endpoints/readback แล้วรายงาน การคืนข้อมูลจริงต้องอนุมัติเฉพาะ ไม่ restore ทับธุรกรรมใหม่อัตโนมัติ

งานนี้ไม่เปลี่ยน Google Sheets/Ads/GOOD ERP ไม่มีคำสั่ง deploy แฝงในเครื่องมือ ยังไม่รับรอง P0 ทั้งระบบจน integration/reconciliation/UAT ผ่าน
