# HANDOFF — CAR CRM P0
อัปเดตล่าสุด: 2026-10-28 · Asia/Bangkok
ฉบับสาธารณะ ไม่มี credential หรือข้อมูลลูกค้า

## งานล่าสุด
- 2026-10-28 · ตรวจ PR head f16a20f/CI, แก้ local reconciliation และเพิ่ม strict direct candidate probes/ข้อกำหนดกระทบยอด · experiments/p0/reconciliation*, RECONCILIATION_SPEC.md, P0_REVIEW_20261028.md, experiments/p0-independent/direct-writer-probes.cjs · regression141/141, reconciliation36/36, private flow12/12; public strictผ่าน4/ไม่ผ่าน3, direct candidateผ่าน4/ไม่ผ่าน5 · ยังไม่ตรวจ Google Staging/Production สด/ข้อมูลจริง/UI/UAT; ไม่ merge/deploy
- 2026-10-27 · ตรวจซ้ำ source หลัง branch อัปเดตระหว่างทำงาน โดยรักษางานใหม่ทั้งหมด · experiments/p0-independent/* · acceptance probes ผ่าน4/ไม่ผ่าน3; CI head a336fde completed/success · ยังไม่ตรวจ writer/deploymentจริง, private bundle, Google Staging หรือข้อมูลจริงในรอบ independent
- 2026-10-27 · งาน P0 ชุดหลักเพิ่ม fixes และ Local Staging ตามรายงาน PR · experiments/p0/* และ sourceที่ระบุใน PR · GitHub Actions run40492383997 สำเร็จ; รายงานหลักระบุ109/109 · Google Staging/reconciliation/พนักงาน UAT ยังไม่ครบ

## สถานะระบบ
- เฉพาะ CAR CRM; PR #1 ยังคง Draft บน feature/lead-quality-attribution-staging-20261027
- รอบ28ต.ค.เริ่มจาก f16a20ff42aa14aba347b07812dfb25785d35be4; แก้เฉพาะ experiments/เอกสาร ไม่มี product/backend runtime เปลี่ยน ไม่ใช่ใบรับรอง Production
- พร้อม review โค้ด/Local Staging แต่ยังไม่ผ่านเกณฑ์ Deploy
- ไม่เปลี่ยน source runtime/workflow/staging plan เดิม และไม่ Merge/Deploy/เขียนข้อมูลจริง/Ads/GOOD ERP

## ผลตรวจล่าสุด
- independent strict probes: G1/G2/G3/G7 ผ่าน; G4/G5/G6 ไม่ผ่านบน public source checkout
- CI ของ head f16a20f: completed/success run40517696960; local ล่าสุด rerun141/141 ผ่าน รวมHTTP loopback ไม่เรียกGoogle; private candidate flow12/12 ผ่าน
- Direct doPost ของ private candidate: ผ่าน4/ไม่ผ่าน5; missing/orphan CustID, cache eviction, mutation payload conflict และ retry หลัง unverified append ยังไม่ผ่าน แยกจาก G4/G5 ของ public Code.gs
- G6: ต้องจัดเตรียม source bundle ภายในอย่างครบถ้วน ห้าม publish auth/service เพื่อให้ test ผ่าน
- หลักฐาน/คำสั่ง: experiments/p0/P0_REVIEW_20261028.md, RECONCILIATION_SPEC.md และ README.md

## งานค้าง
- แก้ complete private candidate writer ตาม direct gates5ข้อ พร้อมตกลง legacy CustID/client mutation policy; ยืนยัน deployment drift ใหม่ก่อน integration ไม่ deploy public bundle
- Google Staging แยก, authorization/locks/concurrency/สูตร/notes/validation/protection/quota และ backup/restore
- ขออนุมัติขอบเขต masked snapshots/aggregate เพื่อตรวจ read error และกระทบยอดจริง
- ยืนยัน metric policy และพนักงาน UAT; ขออนุมัติ Merge/Deploy แยก
- คง Draft และไม่ดำเนินการ Production จนเกณฑ์ตาม experiments/p0/STAGING_PLAN.md ครบ
