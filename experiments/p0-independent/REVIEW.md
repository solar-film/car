# P0 — Independent source acceptance review
อัปเดต 28 ต.ค.2569: [ผลตรวจล่าสุด](../p0/P0_REVIEW_20261028.md) เพิ่ม direct writer probes ของ private candidate (ผ่าน4/ไม่ผ่าน5) โดยไม่ผ่าน simulator guards; regression ล่าสุด141/141 ส่วน G1–G7 ด้านล่างเป็นผล public checkout ที่ยังผ่าน4/ไม่ผ่าน3 คงแยกกันและยังไม่อนุมัติ release

27 ตุลาคม 2569 · Asia/Bangkok · CAR CRM เท่านั้น

**สถานะ: พร้อมรีวิวชุดโค้ด/Local Staging แต่ยังไม่พร้อมรับรอง Production**
ตรวจซ้ำบน PR #1 head a336fdec153a71762c15f102ac55738cfe5b59da หลังพบการอัปเดต branch ระหว่างทำงาน
ไม่เขียนทับ source, workflow, Staging Plan หรือรายงานของงานชุดใหม่

## ผลล่าสุดและขอบเขต
- GitHub Actions run [40492383997](https://github.com/solar-film/car/actions/runs/40492383997): completed / success ของ head a336fde
- รายงานหลักและคำสั่งของชุดนั้นอยู่ใน [P0_REVIEW_20261027.md](../p0/P0_REVIEW_20261027.md), [README](../p0/README.md) และ [STAGING_PLAN.md](../p0/STAGING_PLAN.md)
- ชุดหลักรายงาน 109/109; รอบ independent นี้ตรวจสถานะ CI จาก connector ไม่ได้อ้างว่ารันครบ109ซ้ำในเครื่อง
- รอบ independent รัน source acceptance probes 7 กรณี: **ผ่าน4 / ไม่ผ่าน3** บน Node v24.16.0, Windows ด้วยข้อมูลจำลอง
- ไม่เรียก Apps Script, Sheets, Ads หรือ Production API ไม่ใช้ credentials จริง
- พิจารณาผลของ commit ปัจจุบัน ไม่ใช้ผล7ข้อที่เคยไม่ผ่านบน baseline4d86be8 เป็นสถานะล่าสุด

## ผลก่อน/หลัง branch update
| Probe | baseline4d86be8 | head a336fde | ข้อสรุป |
| --- | --- | --- | --- |
| G1 แต่ละ Lead เลือกคิวของตนจาก Lead ID | ไม่ผ่าน | ผ่าน | planner ใหม่ไม่ยืมคิวล่าสุดของอีก Lead ในกรณีจำลอง |
| G2 คิวใหม่ไม่เปิด Lead ที่ปิดแล้วกลับ | ไม่ผ่าน | ผ่าน | รักษาสถานะสำเร็จเมื่อเป็น legacy queue |
| G3 วันคิว31/2ไม่เปลี่ยนสถานะ | ไม่ผ่าน | ผ่าน | planner ปฏิเสธวันไม่มีจริง |
| G4 insert Bookings ไม่มี CustID ต้องหยุดก่อน append | ไม่ผ่าน | ไม่ผ่าน | Code.gs ที่ tracked ยัง append ในกรณีจำลอง |
| G5 mutation เดิมต้องไม่สร้างอีก JobID | ไม่ผ่าน | ไม่ผ่าน | Code.gs ที่ tracked appendสองครั้งในกรณีจำลอง |
| G6 source bundle ต้องมี auth/Lead handlers ที่ Code.gs เรียก | ไม่ผ่าน | ไม่ผ่านใน public checkout | ต้องใช้ private complete bundle; ไม่ใช่ข้อกล่าวหาว่า live ขาดไฟล์ |
| G7 JobID เดียวขัดแย้งต่าง Lead ต้องไม่ถูกรวมสองรอบ | ไม่ผ่าน | ผ่าน | โมดูลทดลองใหม่ throw error แทนเลือกแถวแรกหรือนับซ้ำ |

G7 ของ branch ใหม่ตั้งใจหยุดรายงานเมื่อข้อมูลขัดแย้ง จึงทดสอบการปฏิเสธ ไม่บังคับให้เลือก Lead ผู้ชนะเอง
G4/G5 ทดสอบ doPost จาก Code.gs จริง โดยจำลองเฉพาะ storage adapters และตรวจ append count
ไม่ใช้ staging-model wrapper ในการพิสูจน์ guard ของ source writer
Code.gs ของสอง commit มี Git blob เดิม c7018d85886a6e94caf5c5fa53e2762100c2219a
CarBookingStatusSync.gs ปัจจุบัน: 3f83db28c4c459dd801520be13d4ede02dae2dc4
experiments/lead-intelligence.js ปัจจุบัน: 229d9482ed609b217433ecd28b12bce9da7682af

## ทำซ้ำ
จาก repository root:
~~~powershell
node --test experiments/p0-independent/acceptance-probes.cjs
~~~

คำสั่งนี้ **exit1 ใน source ปัจจุบัน** เพราะ G4–G6 ไม่ผ่าน ไม่ใช่ regression suite ที่อ้างว่าผ่านแล้ว
แยกจาก run-checks.cjs ของชุดหลักเพื่อคงความหมายเดิม: regression/reproduction ที่ผ่าน ไม่เท่ากับ release acceptance ครบ
ไม่มี skip/TODO/continue-on-error หรือการเปลี่ยน workflow ให้ซ่อนผล
สามารถใช้ CAR_CRM_PRIVATE_BUNDLE ชี้ directory ที่เจ้าของอนุญาตเพื่อตรวจว่ามี auth/Lead files ครบสำหรับ G6
การมีไฟล์อยู่ไม่ยืนยัน version/hash/security ของ bundle; G4/G5 ยังคงรัน Code.gs ที่ tracked
ห้ามคัดลอก private backend หรือ credentials เข้า public Git เพื่อให้ probe ผ่าน

## สิ่งที่ต้องดำเนินการต่อ
1. ก่อน backend integration ให้ยืนยัน complete private candidate/source version กับ deployment ที่อนุญาต ไม่ deploy Code.gs ที่ tracked โดยลำพัง
2. เพิ่ม/ยืนยัน guard ของ CustID และ durable booking idempotency บน candidate writer จริง พร้อม success/retry/conflict/partial-write/concurrency tests; simulator ผ่านอย่างเดียวไม่พอ
3. กรณีหลาย Lead ต้องทดสอบ legacy/manual-review และข้อมูลกำกวมเพิ่มเติมบน Google Staging
4. provision Google Staging แยกและอนุมัติ masked snapshots/aggregate ตามรายงานหลัก; อย่าถือว่ารายงาน read error ระบุ root causeจริงแล้ว
5. พิสูจน์ Google auth/locks/formulas/notes/validation/protection/quota, backup/restore และพนักงาน UAT ก่อนเสนอ Merge/Deploy
6. ยืนยันนิยาม Lead/Contact/Booking/Completed/Sales และกระทบยอดจากข้อมูลต้นทางก่อนเริ่ม P1–P3

รายงานหลักระบุการตรวจ metadata/source Production แบบอ่านอย่างเดียวในงานอีกชุด; independent pass นี้ไม่ได้เข้าถึงหรือตรวจหลักฐานภายในนั้นซ้ำ
ยังไม่ยืนยันสาเหตุ read errorจริง ยอดลูกค้า/รายได้จริง หรือผลใช้งาน Production
ไม่มี Merge, Deploy, เปลี่ยน schema/sharing, แก้ข้อมูลลูกค้า, Ads หรือ GOOD ERP จาก independent pass นี้

## ไฟล์ที่เพิ่มและ rollback
- runtime.cjs: isolated VM/storage fixture ไม่มี network หรือ secret จริง
- acceptance-probes.cjs: strict probes ที่แสดงทั้งผลผ่านและ acceptance gaps
- REVIEW.md: รายงานนี้; HANDOFF.md ที่ repository root เป็นข้อมูลส่งต่อฉบับปิดบังข้อมูล
- rollback: revert เฉพาะ commit ที่เพิ่ม independent review บน development branch; ไม่ต้อง rollback Production
