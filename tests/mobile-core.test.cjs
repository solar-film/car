'use strict';

const assert = require('node:assert/strict');
const Core = require('../mobile/core.js');

const quoted = Core.parseCsv('A,B,C\r\n"หนึ่ง,สอง","หลาย\nบรรทัด","คำว่า ""ทดสอบ"""\r\n');
assert.deepEqual(quoted, [{ A: 'หนึ่ง,สอง', B: 'หลาย\nบรรทัด', C: 'คำว่า "ทดสอบ"' }]);

assert.equal(Core.dateKey('29/8/2569'), '2026-08-29');
assert.equal(Core.dateKey('1/5/2026'), '2026-05-01');
assert.equal(Core.dateKey('31/2/2569'), '');
assert.equal(Core.formatDisplayTime('8:30:00'), '08:30');

['ยกเลิก', ' ยกเลิก ', 'ยก-เลิก', 'สถานะ: ยกเลิกแล้ว'].forEach(value => {
  assert.equal(Core.isCancelledStatus(value), true, value);
});
assert.equal(Core.isCancelledStatus('เสร็จสิ้น'), false);

const bookings = [
  {
    JobID: 'JOB-2', CustID: 'C-2', 'วันที่ติดตั้ง': '29/8/2569', 'เวลานัด': '13:00:00',
    'รุ่นรถยนต์': 'Honda Civic', 'ทะเบียนรถ': 'ขข 22', 'ยี่ห้อฟิล์ม': '3M',
    'ตำแหน่งติดตั้ง': 'เต็มคัน', 'ยอดขาย': '7,500', Status: 'กำลังติดตั้ง'
  },
  {
    JobID: 'JOB-CANCEL', CustID: 'C-1', 'วันที่ติดตั้ง': '29/8/2569', 'เวลานัด': '09:00:00',
    'รุ่นรถยนต์': 'Toyota', Status: ' ยกเลิก '
  },
  {
    JobID: 'JOB-1', CustID: 'C-1', 'วันที่ติดตั้ง': '29/8/2569', 'เวลานัด': '8:30:00',
    'รุ่นรถยนต์': 'Toyota Yaris', 'ทะเบียนรถ': 'กก 11', 'ยี่ห้อฟิล์ม': 'Hi-Kool',
    'ตำแหน่งติดตั้ง': 'บานหน้า', 'ยอดขาย': '5,500', Status: 'เสร็จสิ้น'
  },
  { JobID: '', CustID: 'C-1', 'วันที่ติดตั้ง': '29/8/2569', Status: 'รอนัด' }
];
const customers = [
  { CustID: 'C-1', 'ชื่อลูกค้า': 'คุณหนึ่ง', 'เบอร์โทรศัพท์': '081-111-1111' },
  { CustID: 'C-2', 'ชื่อลูกค้า': 'คุณสอง', 'เบอร์โทรศัพท์': '082-222-2222' }
];
const payIns = [
  { Pay_ID: 'PAY-OLD', JobID: 'JOB-1', 'สถานะ': 'มัดจำ', 'ยอดเงิน(บาท)': '1000' },
  { Pay_ID: 'PAY-NEW', JobID: ' JOB-1 ', 'สถานะ': 'ชำระครบ', 'ยอดเงิน(บาท)': '5500', 'หลักฐาน_1': 'CAR_CRM-691939189/Images/Pay_In/a.jpg', 'หลักฐาน_4': 'CAR_CRM-691939189/Images/Pay_In/d.jpg' }
];

const appointments = Core.buildAppointments(bookings, customers, payIns);
assert.equal(appointments.length, 2, 'canceled and blank JobID must be excluded before all counts');
assert.deepEqual(appointments.map(item => item.id), ['JOB-1', 'JOB-2'], 'appointments sort by time');
assert.equal(appointments[0].customerName, 'คุณหนึ่ง');
assert.equal(appointments[0].payIn.id, 'PAY-NEW', 'latest normalized PayIn row wins');
assert.equal(appointments[0].payIn.hasProof, true);
assert.equal(appointments[0].payIn.proofs[3], 'CAR_CRM-691939189/Images/Pay_In/d.jpg');
assert.equal(Core.paymentKind(appointments[0].payIn), 'paid');
assert.equal(Core.statusKind(appointments[0].status), 'done');
assert.equal(Core.filterAppointments(appointments, '2026-08-29', 'ขข 22')[0].id, 'JOB-2');
assert.equal(Core.filterAppointments(appointments, '2026-08-30', '').length, 0);

// Defense in depth: even an accidentally reintroduced canceled object is hidden by the final filter.
const injected = { ...appointments[0], id: 'BAD', status: 'ยกเลิก', searchText: 'bad', installDateKey: '2026-08-29' };
assert.equal(Core.filterAppointments([...appointments, injected], '2026-08-29', '').some(item => item.id === 'BAD'), false);

console.log('mobile-core tests passed');
