# CAR CRM · P0 regression และ Local Staging

28 ตุลาคม 2569 · CAR CRM เท่านั้น · Draft / ยังไม่อนุมัติ merge/deploy

ดู [ผลตรวจล่าสุด 28 ต.ค.](P0_REVIEW_20261028.md), [ผลเดิม](P0_REVIEW_20261027.md), [ข้อกำหนดกระทบยอด](RECONCILIATION_SPEC.md) และ [Staging Plan](STAGING_PLAN.md) ชุดนี้มีโค้ดแก้ไขที่เสนอและเครื่องมือทดสอบ ยังไม่ได้เปลี่ยนระบบที่พนักงานใช้

## ตรวจโดยไม่ใช้ credential

ใช้ Node24 ที่ root ของ development checkout:

    node experiments/p0/run-checks.cjs
    node experiments/p0/demo.cjs

ผล local ล่าสุด: syntax28 ไฟล์ + inline9 scripts ใน4หน้า + assertion script เดิม + **141/141 tests** รวม HTTP loopback ชั่วคราว ไม่เรียก Google/Ads Tests reproduction P0-01/P0-03 ยังแสดงข้อจำกัดที่เปิดอยู่ CI ผ่านไม่ใช่อนุมัติ deploy

Strict public acceptance ยังคงผ่าน4/ไม่ผ่าน3 รันแยกด้วย `node --test experiments/p0-independent/acceptance-probes.cjs` ส่วน direct candidate probes ต้องระบุ private code.gs ที่ได้รับอนุญาต:

    $env:CAR_P0_SOURCE_SNAPSHOT = (Resolve-Path experiments/p0/.local/backend-candidate/code.gs).Path
    node --test experiments/p0-independent/direct-writer-probes.cjs
    Remove-Item Env:CAR_P0_SOURCE_SNAPSHOT

Direct probes เรียก doPost ตรงโดยไม่ผ่าน staging-model guards: ผ่าน4/ไม่ผ่าน5 (exit1) เป็น release blockers ที่เปิดเผย ไม่รวมเป็นผล regression ผ่าน ดูรายละเอียดและ hash ในรายงานล่าสุด ไม่ส่ง private source เข้า CI/Git

## เปิดหน้าทดสอบด้วยข้อมูลสมมติ

    npm ci --prefix experiments/p0 --ignore-scripts
    node experiments/p0/prepare-assets.cjs
    node experiments/p0/staging-server.cjs

เปิด http://127.0.0.1:3193/lead-data.html#leads · บัญชี staging / staging-only ใช้เฉพาะ localhost นี้

เซิร์ฟเวอร์เสิร์ฟหน้าเดิมผ่าน allowlist เปลี่ยน endpoint เฉพาะ response ให้ชี้ API ในหน่วยความจำ ใช้ dependencies ในเครื่องและ CSP connect-src self ไม่มี proxy/Production fallback/env/ฐานข้อมูลจริง/Ads/webhook ไม่เสิร์ฟ tmp, backend, tests, snapshot, .local, auth files หรือ node_modules ทั้งชุด

ค่าเริ่มต้นเป็น contract simulator ส่วน writer จาก source snapshot ที่ได้รับอนุมัติต้องระบุ local path เอง:

    node experiments/p0/check-source-snapshot.cjs <private-source-directory>
    node experiments/p0/prepare-backend-candidate.cjs <private-source-directory>
    node experiments/p0/check-source-snapshot.cjs experiments/p0/.local/backend-candidate
    node experiments/p0/staging-server.cjs --source-dir experiments/p0/.local/backend-candidate

Builder เก็บครบ7ไฟล์จาก snapshot ไว้ส่วนตัว เปลี่ยนเฉพาะ carBookingStatusPlan_ ไม่มี .clasp.json และกำหนด deployAllowed:false ห้ามเผยแพร่ .local/source snapshot/config/backups Source97 และ candidate ผ่านอย่างละ12/12 ใช้ memory Sheets/lock/cache และ auth จำลอง ยังไม่ยืนยัน Google permissions/quota/concurrency/integration จริง

## Fault injection / Backup / Reconciliation

    node experiments/p0/staging-control.cjs status
    node experiments/p0/staging-control.cjs snapshot before-test.json
    node experiments/p0/staging-control.cjs fault-on
    node experiments/p0/staging-control.cjs fault-off
    node experiments/p0/staging-control.cjs restore before-test.json
    node experiments/p0/staging-control.cjs reconcile

คำสั่งล็อกปลายทาง 127.0.0.1:3193 สำรองใน .local และ restore ตรวจ readback ตรงทั้งชุด ข้อมูลหายเมื่อหยุด process หากยังไม่ snapshot

reconcile ตรวจทุกแถวสมมติรวมคิวที่ยกเลิก แยก Lead/Customer/Booking/scheduled/inProgress/completed/payment/contactEvent เมื่อ schema/ID/link/history/รูปแถว/วันเวลาผิด คืน ok:false และ counts:null ไม่เติมค่าว่างแทนช่องขาด ตรวจวันจริงและแปลง timestamp ตาม Asia/Bangkok ไม่รับรองรายได้หรือรถติดตั้งจริง

auditSnapshot/validateStagingConfig เป็น pure functions สำหรับ inventory/snapshot ที่ผู้ดูแลยืนยันแล้ว ไม่ค้นหาแท็บสำรอง ไม่เปลี่ยน schema ไม่จับคู่ด้วยชื่อ ตัวเลข audit ที่ ok:false ใช้วินิจฉัยเท่านั้น วันที่เข้า audit ต้อง normalize ค.ศ. YYYY-MM-DD ตาม Asia/Bangkok

## ไฟล์หลัก

- fixes.test.cjs: รันฟังก์ชัน frontend จริงที่แก้ read failure/CSV/วันที่/Lead ID และโมดูล JobID ซ้ำ
- legacy-regression.test.cjs: token/lock/schema/retry/stale edit/history และข้อจำกัดเดิม
- staging-flow.test.cjs: Lead→Customer→Booking→ติดตั้ง/ยกเลิก, retry, auth/origin, snapshot/restore และ HTTP
- staging-model.cjs: simulator หรือ writer VM ที่เลือกชัดเจน; wrapper validations บางส่วนไม่ได้แก้ backend จริง
- staging-schema.cjs: เฉพาะหัวคอลัมน์ที่อ่านยืนยัน ไม่มีข้อมูลลูกค้า/credential
- reconciliation.cjs/staging-audit.cjs: grain/ID/link/วันที่และหยุดยอดที่ไม่น่าเชื่อถือ

UI คงเมนู/ฟอร์มเดิม คำเตือนใช้สี/ระยะ/radius ตาม DESIGN.html ของ workspace ตรวจ Desktop/Mobile ด้วยข้อมูลสมมติแล้ว ยังต้อง Google Staging และพนักงาน UAT ก่อนรับรอง P0 ทั้งระบบ
