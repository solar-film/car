const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'customer-data.html'), 'utf8');
function extractFunction(name) {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, `${name} exists in the customer page`);
    const body = source.indexOf('{', start);
    let depth = 0, quote = '', lineComment = false;
    for (let i = body; i < source.length; i++) {
        const char = source[i];
        if (lineComment) { if (char === '\n') lineComment = false; continue; }
        if (quote) {
            if (char === '\\') i++;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '/' && source[i + 1] === '/') { lineComment = true; i++; continue; }
        if ('"\'`'.includes(char)) { quote = char; continue; }
        if (char === '{') depth++;
        if (char === '}' && --depth === 0) return source.slice(start, i + 1);
    }
    throw new Error(`Cannot extract ${name}`);
}
const helpers = ['clearCustomerSaveStatus', 'showCustomerSaveStatus', 'showCustomerSaveError',
    'setCustomerSaving', 'closeCustomerDrawer', 'submitForm'].map(extractFunction).join('\n');
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup(mode = 'insert') {
    const requests = [], refreshes = [], bookings = [], alerts = [];
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, {
            value:'', hidden:false, disabled:false, dataset:{}, attributes:{}, innerHTML:'', textContent:'',
            classList:{add(){},remove(){}}, focus(){}, reportValidity(){},
            setAttribute(name, value) { this.attributes[name] = value; }
        });
        return elements.get(id);
    };
    const fieldValues = {custName:'Fixture Customer',phone:'081-234-5678',contactName:'Fixture contact',
        billingName:'Fixture billing',billingAddress:'Fixture address',taxId:'',note:'Keep this note',firstKnown:'Google'};
    Object.entries(fieldValues).forEach(([id, value]) => { element(id).value = value; });
    const buttons = ['customerSaveButton','cancel','close','reset'].map(element);
    const fields = element('fields');
    element('customerForm').querySelector = () => fields;
    element('customerForm').reset = () => { element('note').value = ''; };
    const drawer = element('customerDrawer');
    drawer.open = true;
    drawer.close = () => { drawer.open = false; };
    let duplicate = false;
    const context = vm.createContext({
        document:{getElementById:element,querySelectorAll:() => buttons,
            querySelector:selector => ({value:selector.includes('gender') ? 'ไม่ระบุ' : 'Tel'})},
        window:{matchMedia:() => ({matches:true})}, Promise, setTimeout, clearTimeout,
        CUSTOMER_SHEET_NAME:'customers',
        normalizePhone:value => value.replace(/\D/g,''),
        findCustomerByPhone:() => duplicate ? {id:'OTHER'} : null,
        showDuplicatePhoneError:() => { element('phoneError').hidden = false; },
        filterTable(){},resetForm(){},
        showAlert:(...args) => alerts.push(args),
        openBookingModal:(...args) => bookings.push(args),
        fetchExistingCustomers:options => { const request = {...deferred(),options}; refreshes.push(request); return request.promise; },
        postWithWriteToken:payload => { const request = {...deferred(),payload}; requests.push(request); return request.promise; }
    });
    vm.runInContext(`let customerSaveInProgress=false, customerSaveLockedButtons=[], customerDrawerCloseTask=null;
        let customerFromLead=${mode === 'insert'}, currentEditingPhone=${mode === 'update' ? "'0812345678'" : 'null'},
        currentEditingId=${mode === 'update' ? "'CUS-FIXTURE'" : 'null'};\n${helpers}`, context);
    return {context,element,fields,buttons,drawer,requests,refreshes,bookings,alerts,
        duplicate:() => { duplicate = true; },
        submit:() => context.submitForm({preventDefault(){}})};
}

for (const mode of ['insert','update']) {
    test(`${mode}: one save for repeated submits, visible busy state, and locked close controls`, async () => {
        const f = setup(mode);
        const saving = f.submit();
        await f.submit();
        assert.equal(f.refreshes.length, 1);
        assert.equal(f.element('customerForm').attributes['aria-busy'], 'true');
        assert.equal(f.fields.inert, true);
        assert.ok(f.buttons.every(button => button.disabled));
        assert.match(f.element('customerSaveButton').innerHTML, /กำลังบันทึก/);
        assert.match(f.element('customerSaveStatus').textContent, /ตรวจสอบเบอร์/);
        assert.equal(f.element('customerSaveStatus').hidden, false);
        await f.context.closeCustomerDrawer();
        assert.equal(f.drawer.open, true);

        f.refreshes[0].resolve(true);
        await tick();
        assert.equal(f.requests.length, 1);
        assert.equal(f.requests[0].payload.action, mode);
        assert.equal(f.requests[0].payload.custId, mode === 'update' ? 'CUS-FIXTURE' : null);
        assert.match(f.element('customerSaveStatus').textContent, mode === 'insert' ? /ลูกค้าใหม่/ : /แก้ไข/);
        await f.submit();
        assert.equal(f.requests.length, 1);
        f.requests[0].resolve({success:true,id:'CUS-FIXTURE'});
        await tick();
        assert.equal(f.drawer.open, false, 'successful save may close the locked drawer');
        assert.equal(f.refreshes.length, 2);
        f.refreshes[1].resolve(true);
        await saving;
        assert.ok(f.buttons.every(button => !button.disabled));
        assert.equal(f.fields.inert, false);
        assert.equal(f.element('customerForm').attributes['aria-busy'], 'false');
        assert.equal(f.element('customerSaveStatus').hidden, true);
        assert.equal(f.bookings.length, mode === 'insert' ? 1 : 0);
        assert.equal(f.alerts.length, mode === 'update' ? 1 : 0);
    });
}

test('failed freshness check restores the form without posting', async () => {
    const f = setup();
    const saving = f.submit();
    f.refreshes[0].resolve(false);
    await saving;
    assert.equal(f.requests.length, 0);
    assert.equal(f.element('customerSaveStatus').dataset.state, 'error');
    assert.equal(f.element('customerSaveStatus').hidden, false);
    assert.equal(f.element('customerSaveButton').disabled, false);
    assert.equal(f.element('note').value, 'Keep this note');
});

test('a duplicate discovered during freshness check unlocks the form and prevents posting', async () => {
    const f = setup();
    const saving = f.submit();
    f.duplicate();
    f.refreshes[0].resolve(true);
    await saving;
    assert.equal(f.requests.length, 0);
    assert.equal(f.fields.inert, false);
    assert.match(f.element('customerSaveStatus').textContent, /ซ้ำ/);
});

for (const failure of ['server','network','cancel-token']) {
    test(`${failure} failure preserves inputs and permits a single retry`, async () => {
        const f = setup('update');
        const saving = f.submit();
        f.refreshes[0].resolve(true);
        await tick();
        if (failure === 'network') f.requests[0].reject(new Error('offline'));
        else f.requests[0].resolve({success:false,error:failure === 'cancel-token' ? 'ยกเลิกการยืนยันสิทธิ์การบันทึก' : 'Server failed'});
        await saving;
        assert.equal(f.drawer.open, true);
        assert.equal(f.fields.inert, false);
        assert.equal(f.element('note').value, 'Keep this note');
        assert.equal(f.element('customerSaveStatus').dataset.state, 'error');
        assert.equal(f.element('customerSaveButton').disabled, false);

        const retry = f.submit();
        await f.submit();
        assert.equal(f.refreshes.length, 2);
        f.refreshes[1].resolve(false);
        await retry;
        assert.equal(f.requests.length, 1);
    });
}

test('client validation leaves the form enabled and makes no request', async () => {
    const f = setup();
    f.element('firstKnown').value = '';
    await f.submit();
    assert.equal(f.refreshes.length, 0);
    assert.equal(f.requests.length, 0);
    assert.ok(f.buttons.every(button => !button.disabled));
});

module.exports = {extractFunction};
