const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'customer-data.html'), 'utf8');
const snapshotSource = source.slice(source.indexOf('function getCustomerEditorSnapshot('), source.indexOf('function openCustomerDrawer('));
const openSource = source.slice(source.indexOf('function openCustomerDrawer('), source.indexOf('function openNewLead('));
const bookingSource = source.slice(source.indexOf('async function openBookingFromCustomer('), source.indexOf('function closeCustomerDrawer('));

function setup() {
    const bookings = [], errors = [];
    const fields = [{ id: 'custName', value: 'Test Customer' }, { id: 'genderMale', value: 'male', checked: true }];
    const elements = {
        customerBookingButton: { hidden: true, disabled: false },
        customerDrawerTitle: { textContent: '' },
        customerDrawer: { open: false, showModal() { this.open = true; } },
        custName: { focus() {} }
    };
    let finishClose;
    const context = vm.createContext({
        document: { getElementById: id => elements[id], querySelectorAll: () => fields, body: { classList: { add() {} } } },
        customerSaveInProgress: false, customerDrawerCloseTask: null,
        currentEditingId: 'CUS-TEST', customerEditorSnapshot: '', customerBookingOpening: false,
        allCustomers: [{ id: 'CUS-OTHER', name: 'Other Customer' }, { id: 'CUS-TEST', name: 'Test Customer' }],
        clearCustomerSaveStatus() {},
        showCustomerSaveError: (...args) => errors.push(args),
        openBookingModal: (...args) => bookings.push(args),
        closeCustomerDrawer: () => new Promise(resolve => { finishClose = resolve; })
    });
    vm.runInContext(`${snapshotSource}\n${openSource}\n${bookingSource}`, context);
    context.openCustomerDrawer('Edit Customer');
    return { context, bookings, errors, fields, elements, finishClose(close = true) {
        if (close) elements.customerDrawer.open = false;
        finishClose();
    } };
}

test('footer removes reset and places booking between cancel and save', () => {
    const footer = source.match(/<footer class="customer-editor-footer">([\s\S]*?)<\/footer>/)[1];
    assert.doesNotMatch(footer, /type="reset"|ล้างข้อมูล/);
    assert.match(footer, /ยกเลิก[\s\S]*id="customerBookingButton" type="button"[\s\S]*เพิ่มคิวติดตั้ง[\s\S]*id="customerSaveButton" type="submit"/);
});

test('booking waits for editor to close, uses the selected customer, and ignores double clicks', async () => {
    const f = setup();
    assert.equal(f.elements.customerBookingButton.hidden, false);
    const opening = f.context.openBookingFromCustomer();
    await f.context.openBookingFromCustomer();
    assert.equal(f.elements.customerBookingButton.disabled, true);
    assert.equal(f.bookings.length, 0);
    f.finishClose();
    await opening;
    assert.deepEqual(f.bookings, [['CUS-TEST', 'Test Customer']]);
    assert.equal(f.elements.customerBookingButton.disabled, false);
});

test('unsaved text or radio changes stay in the editor without opening a booking', async () => {
    for (const change of ['text', 'radio']) {
        const f = setup();
        if (change === 'text') f.fields[0].value = 'Unsaved Customer';
        else f.fields[1].checked = false;
        await f.context.openBookingFromCustomer();
        assert.equal(f.errors.length, 1);
        assert.equal(f.elements.customerDrawer.open, true);
        assert.equal(f.bookings.length, 0);
    }
});

test('new and missing customers cannot open a booking', async () => {
    for (const id of [null, '-', 'MISSING']) {
        const f = setup();
        f.context.currentEditingId = id;
        f.context.openCustomerDrawer('New Customer');
        if (id !== 'MISSING') assert.equal(f.elements.customerBookingButton.hidden, true);
        await f.context.openBookingFromCustomer();
        assert.equal(f.errors.length, 1);
        assert.equal(f.bookings.length, 0);
    }
});

test('saving or interrupted drawer closing does not open another modal', async () => {
    const f = setup();
    f.context.customerSaveInProgress = true;
    await f.context.openBookingFromCustomer();
    assert.equal(f.bookings.length, 0);
    f.context.customerSaveInProgress = false;
    const opening = f.context.openBookingFromCustomer();
    f.finishClose(false);
    await opening;
    assert.equal(f.bookings.length, 0);
    assert.equal(f.elements.customerBookingButton.disabled, false);
});
