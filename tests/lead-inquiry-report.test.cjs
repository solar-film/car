const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../contact-stats.html'), 'utf8');
const code = html.slice(html.indexOf('        function groupLeadInterests('), html.indexOf('        function renderStats()'));
function setup() {
    const elements = { leadInquiryDimension: { value: 'car' }, leadInquirySummary: {}, leadInquiryTable: {} };
    const row = { date: '2026-10-03', car: 'Toyota / Yaris', film: '3M / Ceramic', positions: 'เต็มคัน', channel: 'Line', knownFrom: 'เพื่อนแนะนำ' };
    const context = vm.createContext({ document: { getElementById: id => elements[id] }, dom: { monthFilter: { value: '2026-10' } },
        leadInquiryRows: [row, { ...row }, { ...row, positions: 'บานหน้า', channel: 'FB', car: '<img src=x>' }, { ...row, date: '2026-09-03' }],
        monthLabel: month => month, escapeHtml: text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') });
    vm.runInContext(code, context);
    return { context, elements };
}
test('daily matrix counts each date and escapes category labels', () => {
    const {context,elements}=setup();
    context.renderLeadInquiryReport();
    assert.match(elements.leadInquirySummary.textContent,/รวม 3 Lead/);
    assert.match(elements.leadInquiryTable.innerHTML,/&lt;img src=x&gt;/);
    assert.match(elements.leadInquiryTable.innerHTML,/รวมรายวัน/);
    assert.match(elements.leadInquiryTable.innerHTML,/>2<\/td>/);
    assert.doesNotMatch(elements.leadInquiryTable.innerHTML,/ก.ย./);
});
test('dimension and month changes replace the table', () => {
    const {context,elements}=setup();
    elements.leadInquiryDimension.value='positions';
    context.renderLeadInquiryReport();
    assert.match(elements.leadInquiryTable.innerHTML,/เต็มคัน/);
    assert.match(elements.leadInquiryTable.innerHTML,/บานหน้า/);
    assert.doesNotMatch(elements.leadInquiryTable.innerHTML,/Toyota/);
    context.dom.monthFilter.value='2026-11';
    context.renderLeadInquiryReport();
    assert.match(elements.leadInquiryTable.innerHTML,/ไม่มีข้อมูล/);
});
test('grouping retains unknown values and counts duplicate inquiries without dropping records', () => {
    const { context } = setup();
    const groups = context.groupLeadInterests([{ car: '' }, {}], ['car']);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].values[0], 'ไม่ระบุ');
    assert.equal(groups[0].count, 2);
});
test('follow-up and customer status have independent daily counts including unspecified values', () => {
    const {context,elements}=setup();
    context.leadInquiryRows[0] = {...context.leadInquiryRows[0], followUp:'ส่งเสนอราคาแล้ว', customerType:'ลูกค้าใหม่'};
    context.leadInquiryRows[1] = {...context.leadInquiryRows[1], followUp:'ปิดการขายสำเร็จ', customerType:'ลูกค้าเก่า'};
    elements.leadInquiryDimension.value='followUp';
    context.renderLeadInquiryReport();
    assert.match(elements.leadInquiryTable.innerHTML,/ส่งเสนอราคาแล้ว/);
    assert.match(elements.leadInquiryTable.innerHTML,/ปิดการขายสำเร็จ/);
    assert.match(elements.leadInquiryTable.innerHTML,/ไม่ระบุ/);
    elements.leadInquiryDimension.value='customerType';
    context.renderLeadInquiryReport();
    assert.match(elements.leadInquiryTable.innerHTML,/ลูกค้าใหม่/);
    assert.match(elements.leadInquiryTable.innerHTML,/ลูกค้าเก่า/);
    assert.doesNotMatch(elements.leadInquiryTable.innerHTML,/ปิดการขายสำเร็จ/);
});
test('all inline scripts parse', () => {
    for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script);
});
test('channel outcomes separate pending, lost, won and unspecified and filter by inquiry month', () => {
    const {context}=setup();
    const leads=['✅ ปิดการขายสำเร็จ','❌ ยกเลิก / ไม่สนใจ','⚪ ยกเลิก / ไม่เกี่ยวข้อง','🟢 มัดจำ/นัดติดตั้งแล้ว','ส่งเสนอราคาแล้ว',''].map(followUp=>({date:'2026-10-01',channel:'Line',knownFrom:'Google',followUp}));
    leads.push({date:'2026-09-01',channel:'FB',followUp:'ปิดการขายสำเร็จ'});
    const sales=[{date:'2026-10-01',channel:'Line',knownFrom:'Google',sales:1000},{date:'2026-09-01',channel:'Line',knownFrom:'Google',sales:9000}];
    const rows=context.summarizeLeadOutcomes(leads,sales,'channel','2026-10');
    assert.equal(rows.length,1);
    assert.equal(rows[0].total,6);
    assert.equal(rows[0].success,1);
    assert.equal(rows[0].failed,2);
    assert.equal(rows[0].pending,2);
    assert.equal(rows[0].unknown,1);
    assert.equal(rows[0].sales,1000);
    assert.equal(context.summarizeLeadOutcomes(leads,sales,'knownFrom','2026-10')[0].label,'Google');
});
test('outcome view renders counts even if revenue sources fail and escapes labels', () => {
    const {context,elements}=setup();
    context.leadSalesReady=false;
    context.leadInquiryRows[0]={...context.leadInquiryRows[0],channel:'<img src=x>',followUp:'ปิดการขายสำเร็จ'};
    elements.leadInquiryDimension.value='outcomeChannel';
    context.renderLeadInquiryReport();
    assert.match(elements.leadInquiryTable.innerHTML,/&lt;img src=x&gt;/);
    assert.match(elements.leadInquiryTable.innerHTML,/โหลดไม่ครบ/);
    assert.match(elements.leadInquiryTable.innerHTML,/รวมทั้งหมด/);
    assert.match(elements.leadInquiryTable.innerHTML,/อยู่ระหว่างติดตาม/);
    assert.doesNotMatch(elements.leadInquiryTable.innerHTML,/฿/);
});
test('outcome percentages use each row total and aggregate counts for the footer', () => {
    const {context,elements}=setup();
    context.leadSalesReady=false;
    context.leadInquiryRows=[];
    for (const [channel,success,failed,pending] of [['FB',5,4,28],['Line',17,3,17],['Tel',2,1,3],['WalkIn',3,0,2]]) {
        for (const [followUp,count] of [['ปิดการขายสำเร็จ',success],['ยกเลิก / ไม่สนใจ',failed],['ส่งเสนอราคาแล้ว',pending]]) {
            for (let i=0;i<count;i++) context.leadInquiryRows.push({date:'2026-10-03',channel,followUp});
        }
    }
    elements.leadInquiryDimension.value='outcomeChannel';
    context.renderLeadInquiryReport();
    const output=elements.leadInquiryTable.innerHTML;
    const fb=output.match(/<tr><th[^>]*>FB<\/th>([\s\S]*?)<\/tr>/)[1];
    assert.match(fb,/13\.51%/);
    assert.match(fb,/10\.81%/);
    assert.match(fb,/75\.68%/);
    const footer=output.slice(output.indexOf('<tfoot'));
    assert.match(footer,/31\.76%/);
    assert.match(footer,/9\.41%/);
    assert.match(footer,/58\.82%/);
    assert.match(output,/0\.00%/);
    assert.doesNotMatch(output,/NaN|Infinity/);
});
test('linked revenue uses inquiry date, excludes old/cancelled/claim jobs and deduplicates JobID', () => {
    const {context}=setup();
    const leads=[{date:'2026-10-01',leadId:'L1',phone:'0812345678'}];
    const customers=[{CustID:'C1','เบอร์โทรศัพท์':'+66 81 234 5678'}];
    const job={jobId:'J1',custId:'C1',date:new Date(2026,9,3),status:'เสร็จสิ้น',customerGroup:'ลูกค้าใหม่',sales:1070};
    const result=context.buildLeadSales(leads,customers,[job,{...job},{...job,jobId:'old',date:new Date(2026,8,1)},{...job,jobId:'cancel',status:'ยกเลิก'},{...job,jobId:'claim',customerGroup:'งานเคลม'}]);
    assert.equal(result.rows.length,1);
    assert.equal(result.rows[0].date,'2026-10-01');
    assert.ok(Math.abs(result.rows[0].sales-1000)<0.001);
    assert.equal(context.buildLeadSales([...leads,{...leads[0],leadId:'L2'}],customers,[job]).rows.length,0);
    assert.equal(context.buildLeadSales(leads,[...customers,{...customers[0],CustID:'C2'}],[job]).rows.length,0);
});
test('sales matrix sums currency instead of counting rows and reports unavailable sources', () => {
    const {context,elements}=setup();
    context.leadSalesReady=true;
    context.leadInquiryRows=[{date:'2026-10-01',leadId:'L1',phone:'0812345678'}];
    context.customers=[{CustID:'C1','เบอร์โทรศัพท์':'0812345678'}];
    context.bookings=[{jobId:'J1',custId:'C1',date:new Date(2026,9,3),status:'เสร็จสิ้น',customerGroup:'ลูกค้าใหม่',sales:1070}];
    elements.leadInquiryDimension.value='sales';
    context.renderLeadInquiryReport();
    assert.match(elements.leadInquiryTable.innerHTML,/1,000\.00/);
    assert.doesNotMatch(elements.leadInquiryTable.innerHTML,/฿/);
    assert.match(elements.leadInquirySummary.textContent,/ตามวันที่สอบถาม/);
    context.leadSalesReady=false;
    context.renderLeadInquiryReport();
    assert.match(elements.leadInquiryTable.innerHTML,/โหลดข้อมูลคิวหรือลูกค้าไม่ครบ/);
});
