const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'customer-data.html'), 'utf8');
const handler = source.slice(source.indexOf('function handleCustomerRowActivation('), source.indexOf('function renderTable('));
const render = source.slice(source.indexOf('function renderTable('), source.indexOf('function changeCustomerPage('));

function fixture() {
    const edits = [];
    const row = { dataset: { customerId: 'CUS-TEST', customerPhone: '0812345678' } };
    const elements = new Map();
    const context = vm.createContext({
        editCustomer: (...args) => edits.push(args),
        window: { getSelection: () => ({ toString: () => '' }) },
        document: { getElementById(id) {
            if (!elements.has(id)) elements.set(id, {});
            return elements.get(id);
        } },
        CUSTOMER_PAGE_SIZE: 30, customerPage: 0, currentEditingId: null,
        bookingCountMap: { 'CUS-TEST': 2 },
        getChannelBadge: value => value,
        syncBookingCustomerHighlight() {}
    });
    vm.runInContext(`${handler}\n${render}`, context);
    const target = (interactive = false) => ({ closest: selector => selector.startsWith('tr[') ? row : interactive ? {} : null });
    row.closest = target().closest;
    return { context, edits, row, target, elements };
}

test('all inline scripts compile', () => {
    for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
        new vm.Script(match[1]);
    }
});

test('clicking row content edits that customer by ID and phone', () => {
    const f = fixture();
    f.context.handleCustomerRowActivation({ type: 'click', target: f.target() });
    assert.deepEqual(f.edits, [['0812345678', 'CUS-TEST']]);
});

test('booking/case controls and selected text do not open the editor', () => {
    const f = fixture();
    f.context.handleCustomerRowActivation({ type: 'click', target: f.target(true) });
    f.context.handleCustomerRowActivation({ type: 'keydown', key: 'Enter', target: f.target(true) });
    f.context.window.getSelection = () => ({ toString: () => 'Selected customer text' });
    f.context.handleCustomerRowActivation({ type: 'click', target: f.target() });
    assert.equal(f.edits.length, 0);
});

test('Enter and Space activate only the focused row', () => {
    const f = fixture();
    let prevented = 0;
    for (const key of ['Enter', ' ', 'Tab', 'Escape']) {
        f.context.handleCustomerRowActivation({ type: 'keydown', key, target: f.row, preventDefault() { prevented++; } });
    }
    f.context.handleCustomerRowActivation({ type: 'keydown', key: 'Enter', target: f.target() });
    assert.equal(f.edits.length, 2);
    assert.equal(prevented, 2);
});

test('table has ten columns; case action is on its badge, not the customer name', () => {
    const f = fixture();
    f.context.renderTable([{ id: 'CUS-TEST', name: 'Fixture Customer', phoneClean: '0812345678',
        phone: '081-234-5678', channel: 'Tel', billingName: '-', address: '-', note: '-', date: '-' }]);
    const html = f.elements.get('customerTableBody').innerHTML;
    assert.equal((html.match(/<td\b/g) || []).length, 10);
    assert.equal((html.match(/<button\b/g) || []).length, 2);
    assert.match(html, /tabindex="0"/);
    assert.match(html, /openCasesModal\('CUS-TEST'/);
    assert.match(html, /openBookingModal\('CUS-TEST'/);
    assert.doesNotMatch(html, /fa-pen-to-square/);
    const header = source.slice(source.indexOf('<div id="customerTableScroll"'), source.indexOf('<tbody id="customerTableBody"'));
    assert.equal((header.match(/<th\b/g) || []).length, 10);
    assert.equal((header.match(/<col\b/g) || []).length, 10);
    f.context.renderTable([]);
    assert.match(f.elements.get('customerTableBody').innerHTML, /colspan="10"/);
    assert.doesNotMatch(source, /colspan="11"/);
});

test('ID lookup distinguishes customers sharing a phone and preserves legacy callers', () => {
    const start = source.indexOf('function editCustomer(');
    const lookup = source.slice(start, source.indexOf('if (!cust) return;', start)) + 'return cust; }';
    const first = { id: 'CUS-FIRST', phoneClean: '0812345678' };
    const second = { id: 'CUS-SECOND', phoneClean: '0812345678' };
    const context = vm.createContext({ allCustomers: [first, second] });
    vm.runInContext(lookup, context);
    assert.equal(context.editCustomer('0812345678', 'CUS-SECOND'), second);
    assert.equal(context.editCustomer('0812345678'), first);
    assert.equal(context.editCustomer('0812345678', 'MISSING'), undefined);
});
