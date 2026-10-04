const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const scripts = html => [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const elements = {};
const element = id => elements[id] ||= {
    value: '', innerHTML: '', textContent: '',
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, appendChild() {}
};
let sheets = {};
let exported;
const context = vm.createContext({
    console, Date,
    document: { getElementById: element, addEventListener() {}, createElement: () => ({}) },
    fetch: async url => ({ ok: true, text: async () => JSON.stringify(sheets[new URL(url).searchParams.get('sheet')] || []) }),
    XLSX: { utils: { aoa_to_sheet: data => data, book_new: () => ({}), book_append_sheet: (wb, data) => { exported = data; } }, writeFile() {} },
    addEventListener() {}
});
context.window = context;
vm.runInContext(read('booking-read-model.js'), context);
vm.runInContext(scripts(read('accounting.html')), context);
vm.runInContext('parseCsv = async text => JSON.parse(text);', context);
new vm.Script(scripts(read('index.html')));
for (const page of ['index.html', 'accounting.html']) {
    assert.ok(read(page).includes('<script src="booking-read-model.js"></script>'));
    assert.ok(read(page).includes('BookingReadModel.buildJobs('));
}
const run = code => vm.runInContext(code, context);
const norm = value => String(value).replace(/\s/g, '').toLowerCase();
const model = context.BookingReadModel;
const mapping = {
    jobId: 'id', jobStatus: 'status', installDate: 'date', apptTime: 'time', custName: 'custName',
    custPhone: 'custPhone', custType: 'customerType', sales: 'sales', carModel: 'carModel',
    plate: 'plate', plateType: 'plateType', film: 'film', installType: 'installType',
    productVal: 'basePrice', discount: 'discount', discountCode: 'discountCode', billNo: 'receiptNo',
    payType: 'paymentType', amount: 'price', payStatus: 'paymentStatus', hasSlip: 'hasSlip',
    warranty: 'warranty', note: 'note', promotion: 'promotion',
    customerChannel: 'customerChannel', customerChannelName: 'customerChannelName'
};

async function checkParity(data) {
    sheets = data;
    await run('fetchData()');
    const customers = model.makeLookupMap(data.Customer || [], key => norm(key) === 'custid' || key.toLowerCase().includes('cust'));
    const pay = model.buildPayInDetailsMap(data.PayIn || []);
    const expected = model.buildJobs(data.Bookings || [], customers, pay).filter(job => !model.isCancelledJob(job));
    const actual = run('allRows');
    assert.equal(actual.length, expected.length);
    const byId = new Map(expected.map(job => [job.id, job]));
    for (const row of actual) {
        const job = byId.get(row.jobId);
        for (const [field, source] of Object.entries(mapping)) assert.equal(row[field], job[source], `${row.jobId}: ${field}`);
        assert.equal(row.isSales, model.isSalesJob(job));
        const payment = pay[job.id] || pay[norm(job.id)];
        assert.equal(JSON.stringify(row.proofs), JSON.stringify(payment?.proofs || []));
    }
    run('renderTable(allRows); exportExcel();');
    const sales = expected.filter(model.isSalesJob).reduce((s, job) => s + job.price, 0);
    const damage = expected.filter(job => model.isClaimCustomerJob(job) || model.isFixCustomerJob(job)).reduce((s, job) => s + job.price, 0);
    assert.equal(elements.statRevenue.textContent, sales.toLocaleString('th-TH'));
    assert.equal(elements.statDamage.textContent, damage.toLocaleString('th-TH'));
    assert.equal(exported.length, expected.length + 1);
    assert.equal(exported.slice(1).reduce((s, row) => s + row[13], 0), sales);
    assert.equal(exported.slice(1).reduce((s, row) => s + row[14], 0), damage);
    // Exercise every drawer, including missing related records and multiple proofs.
    for (let i = 0; i < actual.length; i++) run(`openDrawer(${i});`);
    return { rows: actual.length, fields: Object.keys(mapping).length, sales, damage };
}

// CSV reader for live verification only; production continues using PapaParse.
function csv(text) {
    const rows = []; let row = [], value = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
        else if (!quoted && (c === ',' || c === '\n')) {
            row.push(value.replace(/\r$/, '')); value = '';
            if (c === '\n') { rows.push(row); row = []; }
        } else value += c;
    }
    if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
    const headers = rows.shift().map(h => h.trim());
    return rows.filter(row => row.some(Boolean)).map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] || ''])));
}

(async () => {
    const booking = (id, type = 'ลูกค้าใหม่', extra = {}) => ({ JobID: id, CustID: 'C1', Status: 'เสร็จ', 'วันที่ติดตั้ง': '29/8/2569', 'เวลานัด': '10:00:00', 'ประเภทลูกค้า': type, 'ยอดขาย': '4100', 'มูลค่าสินค้า': '', 'ส่วนลด': '100', 'ทะเบียนรถ': 'TEST', ...extra });
    await checkParity({
        Bookings: [booking('JOB-1'), booking('JOB-2', 'ลูกค้าเก่า', {'เลขที่บิล/ใบเสร็จ': 'BOOKING-BILL', 'ประเภทการชำระ': 'เงินสด'}), booking('JOB-CANCEL', 'ลูกค้าใหม่', { Status: 'ยกเลิก' }), booking('JOB-CLAIM', 'ลูกค้าเคลม'), booking('JOB-FIX', 'งานแก้'), booking('JOB-UNKNOWN', 'อื่น ๆ')],
        Customer: [{ CustID: 'C1', 'ชื่อลูกค้า': 'Fixture', 'เบอร์โทร': '000', 'ช่องทางติดต่อ': 'Line' }, { CustID: 'C1', 'ชื่อลูกค้า': '', 'เบอร์โทร': '' }],
        PayIn: [{ JobID: 'JOB-1', 'สถานะ': 'ชำระครบ', 'เลขที่บิล/ใบเสร็จ': 'CV-TEST', 'ประเภทการชำระ': 'โอน', 'ยอดเงิน(บาท)': '500', 'หลักฐาน_1': 'CAR_CRM-691939189/Images/slip.jpg', 'หลักฐาน_4': 'CAR_CRM-691939189/Images/slip-4.jpg' }, { JobID: 'JOB-1', 'สถานะ': '', 'เลขที่บิล/ใบเสร็จ': '', 'หลักฐาน_1': '', 'หลักฐาน_2': '', 'หลักฐาน_3': '', 'หลักฐาน_4': '' }],
        Detail_Installer: [{ JobID: 'JOB-1', 'ทีมช่าง': 'Team A' }, { JobID: 'JOB-1', 'ทีมช่าง': 'Team B' }],
        Detail_film: [{ JobID: 'JOB-1', 'รุ่นฟิล์ม': 'Film A' }, { JobID: 'JOB-1', 'รุ่นฟิล์ม': '', 'บานหน้า': 'Film B' }],
        data: [{ JobID: 'JOB-1', MIS_ID: 'M1', 'เหตุผลขอตัดฟิล์ม': 'R1' }],
        'เหตุผลขอตัดฟิล์ม': [{ ID: 'R1', 'เหตุผลขอตัดฟิล์ม': 'Fixture reason' }]
    });
    const job = run("allRows.find(row => row.jobId === 'JOB-1')");
    assert.equal(job.amount, 4100, 'Bookings sales, not the payment/deposit amount');
    assert.equal(job.productVal, 4100, 'Missing base price falls back to sales');
    assert.equal(job.custName, 'Fixture', 'Blank duplicate customer retains name');
    assert.equal(job.billNo, 'CV-TEST');
    assert.equal(job.payStatus, 'ชำระครบ');
    assert.equal(job.apptTime, '10:00');
    assert.equal(job.hasSlip, true);
    assert.equal(job.proofs.length, 2);
    assert.equal(run("allRows.find(row => row.jobId === 'JOB-2').billNo"), 'BOOKING-BILL');
    assert.equal(run("allRows.find(row => row.jobId === 'JOB-2').payType"), 'เงินสด');
    run("openDrawer(filteredRows.findIndex(row => row.jobId === 'JOB-1'));");
    for (const text of ['Team A', 'Team B', 'Film A', 'Film B', 'Fixture reason', 'gettablefileurl']) assert.ok(elements.drawerBody.innerHTML.includes(text), text);
    assert.ok(elements.tableBody.innerHTML.includes('payment-proof-icon'));
    element('filterSearch').value = 'line'; run('applyFilters();');
    assert.equal(run('filteredRows.length'), 5);
    element('filterSearch').value = 'JOB-CANCEL'; run('applyFilters();');
    assert.equal(run('filteredRows.length'), 0);
    element('filterSearch').value = '';
    const id = 'abcdefghijklmnopqrstuvwxyz12345';
    assert.ok(model.buildProofItem(id).src.includes('thumbnail'));
    assert.ok(model.buildProofItem(`https://drive.google.com/file/d/${id}/view`).href.includes(id));
    assert.equal(model.buildProofItem('https://example.com/slip.jpg').type, 'image');
    assert.equal(model.buildProofItem('https://example.com/document').type, 'link');
    assert.equal(model.normalizeProofList(['a.jpg; b.jpg\nc.jpg']).length, 3);
    assert.ok(model.timeToNumber('8:30') < model.timeToNumber('10:00'));
    assert.ok(model.timeToNumber('-') > model.timeToNumber('23:59'));
    console.log('PASS: duplicate payments/customers, booking fallbacks, cancellations, sales/damage totals, exports, filters, related details and proof URLs.');
    if (process.argv.includes('--live')) {
        const names = ['Bookings', 'Customer', 'PayIn', 'Detail_film', 'Detail_Installer', 'ขนาดกระจก', 'Waranty', 'เหตุผลขอตัดฟิล์ม', 'data'];
        const entries = await Promise.all(names.map(async name => {
            const response = await fetch(`https://docs.google.com/spreadsheets/d/1u__xYWoWZpmrnquc-Fpk19WtpcrckxSd0-_G35NWxXQ/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`);
            assert.ok(response.ok, name);
            const text = await response.text();
            assert.ok(!/^\s*</.test(text), name);
            return [name, csv(text)];
        }));
        const result = await checkParity(Object.fromEntries(entries));
        console.log('PASS: live parity', JSON.stringify(result));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
