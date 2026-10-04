const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = readFileSync(require('node:path').join(__dirname, '../damage.html'), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const context = vm.createContext({ window: { addEventListener() {} }, console });
vm.runInContext(script, context);
const run = code => vm.runInContext(code, context);
run(`
const booking = (id, plate, value, extra = {}) => ({JobID: id, 'ทะเบียนรถ': plate, 'ยอดขาย': value, Pro_ID: 'Mistake', 'ประเภทลูกค้า': 'ลูกค้าเคลม', 'วันที่ติดตั้ง': '9/9/2569', ...extra});
const detail = (id, width = 20, length = 35, installer = 'มาว') => ({JobID: id, 'กว้าง': width, 'ยาว': length, 'ช่าง': installer, 'รุ่นฟิล์ม': 'Film'});
const fixture = buildDamageRows([
 booking('JOB-1', '8ขม 4413', 1100), booking('JOB-2', '6ณน 3086', 5200),
 booking('JOB-3', '7ขษ 4578', 5100), booking('JOB-4', 'กว 9601', 600),
 booking('JOB-5', '4กอ 7750', 800), booking('JOB-CANCEL', 'cancel', 9000, {Status:'ยกเลิก'}),
 booking('JOB-NORMAL', 'normal', 9000, {Pro_ID:'Normal'})
], [detail('JOB-1'), detail('JOB-2'), detail('JOB-3'), detail('JOB-3'), detail('JOB-3',20,35,'นัท'), detail('JOB-4'), detail('JOB-5')], [], [], []);
`);
assert.equal(run('fixture.length'), 7);
assert.equal(run('summarizeDamageType(fixture).count'), 5);
assert.equal(run('summarizeDamageType(fixture).damage'), 12800);
assert.equal(run("aggregateByField(fixture, 'film')[0].count"), 5);
assert.equal(run("aggregateByField(fixture, 'installer').reduce((s, x) => s + x.damage, 0)"), 12800);
run(`const repeats = buildDamageRows([booking('A','กก 1234',100), booking('B','กก-1234',200), booking('C','',10), booking('D','-',20)], [], [], [], []);`);
assert.equal(run('summarizeDamageType(repeats).count'), 3);
assert.equal(run('summarizeDamageType(repeats).damage'), 330);
run(`const tiny = buildDamageRows([booking('tiny','test',0.02)], Array.from({length:8}, () => detail('tiny',0,0)), [], [], []);`);
assert.equal(run('Math.round(summarizeDamageType(tiny).damage * 100)'), 2);
assert.equal(run('tiny.every(row => row.damageValue >= 0)'), true);
run(`
damageRows = fixture;
DOM_IDS.forEach(id => dom[id] = {value: '', innerHTML: '', innerText: ''});
dom.periodFilter.value = 'all';
renderRows();
`);
assert.equal(run(`(dom.damageTableBody.innerHTML.match(/rowspan="3"/g) || []).length`), 5);
assert.equal(run(`(dom.damageTableBody.innerHTML.match(/JOB-3</g) || []).length`), 1);
assert.equal(run(`(dom.damageTableBody.innerHTML.match(/7ขษ 4578/g) || []).length`), 1);
assert.ok(run(`dom.damageTableBody.innerHTML.includes('12,800.00')`));
run(`selectedInstallers = ['นัท']; renderRows();`);
assert.ok(run(`dom.damageTableBody.innerHTML.includes('1,700.00')`));
assert.ok(run(`dom.summaryClaimCount.innerText.includes('1')`));
console.log('Damage regression checks passed: totals, unique plates, multiple jobs, cancellations, rounding, grouped rendering and filters.');
