'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function report() {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, {value: '', textContent: '', innerHTML: ''});
        return elements.get(id);
    };
    const context = vm.createContext({Date, console, document: {getElementById: element, addEventListener() {}}});
    const html = fs.readFileSync(path.join(__dirname, '../contact-stats.html'), 'utf8');
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (!/\bsrc=/.test(script[1])) vm.runInContext(script[2], context);
    }
    const run = code => vm.runInContext(code, context);
    run('cacheDom()');
    run(`
        customers = [
            {CustID:'C1', 'วันที่บันทึก':'30/9/2569', 'รู้จักครั้งแรก *':'ค้นหา Google'},
            {CustID:'C2', 'วันที่บันทึก':'1/10/2569', 'รู้จักครั้งแรก *':''},
            {CustID:'NO-JOB', 'วันที่บันทึก':'1/10/2569', 'รู้จักครั้งแรก *':'Facebook'}
        ];
        bookings = buildBookings([
            {JobID:'J1', CustID:'C1', 'วันที่ติดตั้ง':'1/10/2569', 'ประเภทลูกค้า':'ลูกค้าใหม่'},
            {JobID:'J2', CustID:'C1', 'วันที่ติดตั้ง':'3/10/2569', 'ประเภทลูกค้า':'ลูกค้าเก่า'},
            {JobID:'J3', CustID:'C2', 'วันที่ติดตั้ง':'3/10/2569', 'ประเภทลูกค้า':'ลูกค้าใหม่'},
            {JobID:'J4', CustID:'MISSING', 'วันที่ติดตั้ง':'29/10/2569', 'ประเภทลูกค้า':'ลูกค้าใหม่'},
            {JobID:'CANCEL', CustID:'C1', 'วันที่ติดตั้ง':'1/10/2569', 'ประเภทลูกค้า':'ลูกค้าใหม่', Status:'ยกเลิก'},
            {JobID:'CLAIM', CustID:'C1', 'วันที่ติดตั้ง':'1/10/2569', 'ประเภทลูกค้า':'งานเคลม'},
            {JobID:'REPAIR', CustID:'C1', 'วันที่ติดตั้ง':'1/10/2569', 'ประเภทลูกค้า':'งานแก้'},
            {JobID:'SEPT', CustID:'C1', 'วันที่ติดตั้ง':'30/9/2569', 'ประเภทลูกค้า':'ลูกค้าใหม่'},
            {JobID:'UNDATED', CustID:'C1', 'ประเภทลูกค้า':'ลูกค้าใหม่'}
        ]);
    `);
    return {element, run};
}

test('first-known report counts jobs on installation dates, including repeat and future jobs, and matches channel totals', () => {
    const {element, run} = report();
    element('monthFilter').value = '2026-10';
    assert.deepEqual(JSON.parse(run('JSON.stringify(buildFirstKnownBookings(getCustomerBookings("2026-10"), customers).map(item => [item.jobId, item.source, dateKey(item.date)]))')), [
        ['J1', 'ค้นหา Google', '2026-10-01'],
        ['J2', 'ค้นหา Google', '2026-10-03'],
        ['J3', 'ไม่ระบุ', '2026-10-03'],
        ['J4', 'ไม่ระบุ', '2026-10-29']
    ]);
    run('renderFirstKnownDailyReport()');
    assert.match(element('firstKnownReportPeriod').textContent, /4 งาน$/);
    assert.equal(run('getBookingChannelContext().total'), 4);
    assert.match(element('firstKnownDailyReport').innerHTML, /ไม่ระบุ/);
    assert.doesNotMatch(element('firstKnownDailyReport').innerHTML, /Facebook/);
});

test('all months retain undated jobs and empty months render without inventing counts', () => {
    const {element, run} = report();
    run('renderFirstKnownDailyReport()');
    assert.match(element('firstKnownReportPeriod').textContent, /6 งาน$/);
    assert.equal(run('getBookingChannelContext().total'), 6);
    assert.match(element('firstKnownDailyReport').innerHTML, /ไม่ระบุวันที่/);
    element('monthFilter').value = '2026-11';
    run('renderFirstKnownDailyReport()');
    assert.match(element('firstKnownReportPeriod').textContent, /0 งาน$/);
    assert.match(element('firstKnownDailyReport').innerHTML, /ไม่มีงานติดตั้ง/);
});
