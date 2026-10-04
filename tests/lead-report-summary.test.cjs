const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'lead-data-app.js'), 'utf8');
const statusHelpers = source.slice(source.indexOf('    const followUpStatuses ='), source.indexOf('    const initialTab ='));
const followUp = source.slice(source.indexOf('    function customerFollowUp('), source.indexOf('    function followUpAge('));
const render = source.slice(source.indexOf('    function renderLeads() {'), source.indexOf('    function renderInstallations() {'));

function setup(tab = 'followups') {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, {value:'', textContent:'', innerHTML:'', disabled:false});
        return elements.get(id);
    };
    const lead = (id, status, date = '2026-10-03') => ({id, name:id, status,
        sheetData:{date, time:'09:00:00'}, contactHistory:[]});
    const leads = Array.from({length:60}, (_, i) => lead('active_' + i,
        ['สอบถามใหม่', 'เลื่อนติดตั้ง', 'ติดตามผล / รอตัดสินใจ'][i % 3]));
    // A cancelled booking does not make the lead's current follow-up status cancelled.
    leads[1].installationDate = '1 ต.ค. 69 · ยกเลิก';
    ['❌ ยกเลิก / ไม่สนใจ', '⚪ ยกเลิก / ไม่เกี่ยวข้อง', 'ไม่เกี่ยวข้อง', 'ยกเลิก', 'ยกเลิก / อื่น ๆ']
        .forEach((status, i) => leads.push(lead('cancelled_' + i, status)));
    leads.push(lead('closed', '✅ ปิดการขายสำเร็จ'), lead('booked', '🟢 มัดจำ/นัดติดตั้งแล้ว'));
    leads.push(lead('older_open', 'สอบถามใหม่', '2026-10-02'),
        lead('older_followup', 'ติดตามผล / รอตัดสินใจ', '2026-10-02'),
        lead('older_cancelled', '❌ ยกเลิก / ไม่สนใจ', '2026-10-02'),
        lead('older_booked', '🟢 มัดจำ/นัดติดตั้งแล้ว', '2026-10-02'));
    const context = vm.createContext({
        $:element, sheetLeads:leads, contactPage:0, tab, session:{},
        updateFollowUpCount(){}, contactDate:l => l.sheetData.date, day:() => '',
        followUpAge:() => ({overdue:false, label:''}), esc:v => String(v ?? ''),
        sourceLabel:() => '', formatLeadPhone:v => v, renderInstallationDates:() => '',
        window:{CarLeadSheet:{splitHistory:() => ({history:[]})}}, empty:text => text
    });
    vm.runInContext(statusHelpers + followUp + render, context);
    return {context, element, render() {
        vm.runInContext('renderLeads()', context);
        return element('lead-list').innerHTML;
    }};
}

test('follow-up summary counts all cancelled lead statuses for the full day across pages', () => {
    const app = setup();
    let html = app.render();
    assert.match(html, /วันนี้ 67 รายการ · ไม่สำเร็จ 5 รายการ · คิดเป็น 7.5%/);
    assert.match(html, /วันนี้ 4 รายการ · ไม่สำเร็จ 1 รายการ · คิดเป็น 25%/);
    assert.equal((html.match(/data-lead-details=/g) || []).length, 50);
    assert.equal(app.element('contact-count').textContent, '62 ราย');
    assert.doesNotMatch(html, /data-lead-details="(?:cancelled_|older_cancelled|closed|booked)/);
    app.context.contactPage = 1;
    html = app.render();
    assert.match(html, /วันนี้ 67 รายการ · ไม่สำเร็จ 5 รายการ · คิดเป็น 7.5%/);
    assert.equal((html.match(/data-lead-details=/g) || []).length, 12);
});

test('follow-up search and status filters do not hide cancellations from the daily summary', () => {
    const app = setup();
    app.element('lead-status').value = 'สอบถามใหม่';
    app.element('lead-search').value = 'active_1';
    const html = app.render();
    assert.match(html, /วันนี้ 67 รายการ · ไม่สำเร็จ 5 รายการ · คิดเป็น 7.5%/);
    assert.equal((html.match(/data-lead-details=/g) || []).length, 3);
});

test('contact report retains successful counts for closed and booked leads only', () => {
    const app = setup('leads');
    let html = app.render();
    assert.match(html, /วันนี้ 67 รายการ · สำเร็จ 2 รายการ · คิดเป็น 3%/);
    assert.doesNotMatch(html, / · ไม่สำเร็จ /);
    app.context.contactPage = 1;
    html = app.render();
    assert.match(html, /วันนี้ 4 รายการ · สำเร็จ 1 รายการ · คิดเป็น 25%/);
});

test('empty follow-up results do not render an invalid percentage', () => {
    const app = setup();
    app.element('lead-search').value = 'no matches';
    const html = app.render();
    assert.equal(app.element('contact-page-label').textContent, '0 รายการ');
    assert.doesNotMatch(html, /NaN|Infinity|contact-day-heading/);
});
