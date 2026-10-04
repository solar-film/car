const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'lead-data-app.js'), 'utf8');
const sheetContext = vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'lead-sheet.js'), 'utf8'), sheetContext);
const sheetFields = sheetContext.window.CarLeadSheet.fields;
const callbackStart = source.indexOf("        editor('เก็บข้อมูลผู้ติดต่อ', html, async values => {");
const callbackEnd = source.indexOf('        const phoneInput', callbackStart);
assert.ok(callbackStart >= 0 && callbackEnd > callbackStart, 'extract the actual lead editor save callback');
const callback = source.slice(callbackStart, callbackEnd);

function extractFunction(name) {
    const match = new RegExp(`^    (?:async )?function ${name}\\(`, 'm').exec(source);
    assert.ok(match, `the application defines ${name}`);
    const start = match.index;
    let depth = 0, quote = '', lineComment = false, blockComment = false;
    const bodyStart = source.indexOf(') {', start) + 2;
    assert.ok(bodyStart > start, `find ${name}'s body after its complete parameter list`);
    for (let index = bodyStart; index < source.length; index++) {
        const char = source[index], next = source[index + 1];
        if (lineComment) { if (char === '\n') lineComment = false; continue; }
        if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index++; } continue; }
        if (quote) {
            if (char === '\\') index++;
            else if (char === quote) quote = '';
            continue;
        }
        if (char === '/' && next === '/') { lineComment = true; index++; continue; }
        if (char === '/' && next === '*') { blockComment = true; index++; continue; }
        if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
        if (char === '{') depth++;
        if (char === '}' && --depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Unable to extract ${name}`);
}
const helpers = ['applyConfirmedLead', 'refreshAfterLeadSave'].map(extractFunction).join('\n');
function deferred() {
    let resolve, reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const snapshot = value => JSON.parse(JSON.stringify(value));
const values = {
    date: '2026-10-03', name: 'Fixture Lead', phone: '081-234-5678', admin: 'Fixture Sales',
    channel: 'Tel', contact: 'Fixture Contact', note: 'Fixture note', followUp: 'สอบถามใหม่'
};
const confirmed = {success:true, verified:true, historyVerified:true, sheetName:'lead', leadKey:'manual:fixture-key',
    leadId:'L-261003-ABC', rowNumber:10, historyCount:1, action:'insert'};

function setup({ platform = 'manual', contact = null, initialLead = {} } = {}) {
    const sheetRequests = [], localRequests = [], refreshCalls = [], notices = [], renders = [];
    const recordsRefresh = deferred(), contactsRefresh = deferred();
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, {value:'', textContent:'', hidden:false,
            classList:{add(){},remove(){},toggle(){}}, setAttribute(){}, removeAttribute(){}});
        return elements.get(id);
    };
    const context = vm.createContext({
        Date, Promise, console, setTimeout,
        $: element, html:'', platform, contact,
        lead: {source:{platform}, ...initialLead},
        key: confirmed.leadKey, isNewLead: platform !== 'sheet-lead' && !initialLead.id,
        originalSheetData:{followUp:values.followUp}, previous:{followUp:values.followUp}, defaults:{followUp:values.followUp},
        contactHistory:[{id:'fixture-history',at:'2026-10-03T09:00',by:'ระบบ',text:'เริ่มต้นการติดต่อใหม่'}],
        statusChangeId:'fixture-status-change', savedLeadRevision:0,
        sheetLeads:[], records:{leads:[],installations:[]}, sheetContacts:[], sheetChecked:true,
        tab:platform === 'sheet-lead' ? 'leads' : platform, session:{id:'fixture-session'}, service:'http://fixture.test',
        formatLeadPhone:value => value, isNewLeadStatus:() => true, isAutomaticClosedStatus:() => false,
        normalizeFollowUp:value => String(value), customerFollowUp:lead => lead.sheetData?.followUp || lead.status || '',
        notice:(message, warning) => notices.push({message,warning}),
        renderLeads:() => renders.push('leads'), renderInbox:() => renders.push('inbox'),
        renderStatusOptions:() => renders.push('status-options'), updateFollowUpCount:() => renders.push('followup-count'),
        renderInstallations:() => renders.push('installations'),
        loadRecords:(...args) => { refreshCalls.push({action:'records',args}); return recordsRefresh.promise; },
        checkSheetContacts:(...args) => { refreshCalls.push({action:'contacts',args}); return contactsRefresh.promise; },
        loadInbox:() => { throw new Error('Saving a lead must not reload the remote inbox'); },
        api:(action, input) => {
            assert.ok(['lead','select'].includes(action), `only the local lead commit is in the save path: ${action}`);
            const request = {...deferred(),action,input:snapshot(input)};
            localRequests.push(request);
            return request.promise;
        },
        CarLeadSheet:{fields:sheetFields,save:(key, data, previous) => {
            const request = {...deferred(),key,data:snapshot(data),previous:snapshot(previous)};
            sheetRequests.push(request);
            return request.promise;
        }}
    });
    context.window = context;
    context.editor = (_title, _html, save) => { context.saveEditor = save; };
    vm.runInContext(helpers + '\n' + callback, context, {filename:'lead-data-app.js:save'});
    return {context,sheetRequests,localRequests,refreshCalls,recordsRefresh,contactsRefresh,notices,renders,
        save:() => {
            const pending = context.saveEditor({...values});
            pending.catch(() => {});
            return pending;
        }};
}
async function finishSheet(fixture, index = 0, result = confirmed) {
    fixture.sheetRequests[index].resolve({...result});
    await tick();
}
async function finishLocal(fixture, index = 0) {
    const request = fixture.localRequests[index];
    request.resolve({lead:{...(request.input.lead || request.input),id:'fixture-local-id',source:{platform:fixture.context.platform}},duplicate:false});
    await tick();
}

test('save waits for verified sheet and local commits, then finishes while refreshes are still pending', {timeout:3000}, async () => {
    const fixture = setup();
    let finished = false;
    const pending = fixture.save().then(() => { finished = true; });
    pending.catch(() => {});
    assert.equal(fixture.sheetRequests.length,1);
    assert.equal(fixture.localRequests.length,0);
    assert.equal(fixture.refreshCalls.length,0);
    assert.equal(finished,false,'no success before the sheet write is verified');
    await finishSheet(fixture);
    assert.equal(fixture.localRequests.length,1);
    assert.equal(fixture.localRequests[0].action,'lead');
    assert.equal(finished,false,'no success before the local commit is acknowledged');
    assert.equal(fixture.refreshCalls.length,0);
    await finishLocal(fixture);
    assert.equal(finished,true,'report reloads do not delay the save result');
    await pending;
    assert.equal(fixture.context.lead.id,'fixture-local-id');
    assert.equal(fixture.context.lead.leadId,confirmed.leadId);
    assert.equal(fixture.context.lead.sheetKey,confirmed.leadKey);
    assert.equal(fixture.context.lead.sheetRow,confirmed.rowNumber);
    assert.ok(fixture.context.savedLeadRevision > 0);
    assert.ok(fixture.context.sheetLeads.some(lead => lead.leadId === confirmed.leadId), 'confirmed sheet data is visible immediately');
    const confirmedLead = fixture.context.sheetLeads.find(lead => lead.leadId === confirmed.leadId);
    assert.equal(confirmedLead.pendingCustomerCheck,true,'a new confirmed lead still waits for the authoritative customer duplicate check');
    assert.equal(confirmedLead.historyCount,confirmed.historyCount);
    assert.ok(fixture.context.records.leads.some(lead => lead.id === 'fixture-local-id'), 'the acknowledged local ID is retained in the cache');
    assert.ok(fixture.renders.length > 0, 'confirmed data renders before background responses arrive');
    assert.deepEqual(fixture.refreshCalls.map(call => call.action).sort(),['contacts','records']);
    assert.deepEqual(snapshot(fixture.refreshCalls.find(call => call.action === 'records').args),[null,{reportErrors:true}]);
    assert.deepEqual(snapshot(fixture.refreshCalls.find(call => call.action === 'contacts').args),[{refresh:true}]);
    fixture.recordsRefresh.resolve(); fixture.contactsRefresh.resolve();
    await tick();
});

test('failed background reloads report a warning without retrying writes or turning success into save failure', {timeout:3000}, async () => {
    const fixture = setup();
    const pending = fixture.save();
    await finishSheet(fixture); await finishLocal(fixture);
    await pending;
    const committedRevision = fixture.context.savedLeadRevision;
    fixture.recordsRefresh.reject(new Error('records refresh unavailable'));
    fixture.contactsRefresh.reject(new Error('contacts refresh unavailable'));
    await tick();
    assert.equal(fixture.sheetRequests.length,1);
    assert.equal(fixture.localRequests.length,1,'background failures do not repeat the local write');
    assert.equal(fixture.context.lead.id,'fixture-local-id');
    assert.equal(fixture.context.lead.leadId,confirmed.leadId);
    assert.equal(fixture.context.savedLeadRevision,committedRevision);
    assert.ok(fixture.notices.some(item => item.warning && /โหลด|อ่าน|รีเฟรช/.test(item.message)), 'a background failure remains visible as a refresh warning');
});

test('an unverified sheet failure keeps the editor retryable and never commits local data', {timeout:3000}, async () => {
    const fixture = setup();
    const pending = fixture.save();
    const rejected = assert.rejects(pending,/ยังยืนยัน/);
    fixture.sheetRequests[0].reject(new Error('ยังยืนยันการบันทึกลงชีต lead ไม่ได้'));
    await rejected;
    assert.equal(fixture.localRequests.length,0);
    assert.equal(fixture.refreshCalls.length,0);
    assert.equal(fixture.context.savedLeadRevision,0);
});

test('a local commit failure is not false success and a retry keeps the same sheet key and ID', {timeout:3000}, async () => {
    const fixture = setup();
    const pending = fixture.save();
    const rejected = assert.rejects(pending,/แถว 10.*บันทึกซ้ำ/);
    await finishSheet(fixture);
    fixture.localRequests[0].reject(new Error('local commit unavailable'));
    await rejected;
    assert.equal(fixture.refreshCalls.length,0);
    assert.equal(fixture.context.savedLeadRevision,0);
    const retry = fixture.save();
    assert.equal(fixture.sheetRequests[1].key,fixture.sheetRequests[0].key,'retry reuses the editor closure key');
    await finishSheet(fixture,1); await finishLocal(fixture,1);
    await retry;
    assert.equal(fixture.localRequests[1].input.leadId,confirmed.leadId);
    assert.equal(fixture.context.lead.leadId,confirmed.leadId);
    assert.equal(fixture.context.lead.id,'fixture-local-id');
    fixture.recordsRefresh.resolve(); fixture.contactsRefresh.resolve();
    await tick();
});

test('contact selection acknowledges the local selected-lead result without fetching the remote inbox again', {timeout:3000}, async () => {
    const fixture = setup({platform:'line',contact:{id:'fixture-contact-id'}});
    const pending = fixture.save();
    await finishSheet(fixture);
    assert.equal(fixture.localRequests[0].action,'select');
    assert.equal(fixture.localRequests[0].input.contactId,'fixture-contact-id');
    assert.equal(fixture.localRequests[0].input.lead.sheetKey,confirmed.leadKey);
    await finishLocal(fixture);
    await pending;
    assert.equal(fixture.context.lead.id,'fixture-local-id');
    assert.equal(fixture.context.lead.leadId,confirmed.leadId);
    fixture.recordsRefresh.resolve(); fixture.contactsRefresh.resolve();
    await tick();
});

test('editing an existing sheet lead finishes after its verified write without creating a local lead', {timeout:3000}, async () => {
    const fixture = setup({platform:'sheet-lead',initialLead:{id:'sheet-lead:9',leadId:confirmed.leadId,sheetData:{...values}}});
    const pending = fixture.save();
    assert.ok(fixture.sheetRequests[0].previous,'sheet updates keep the original snapshot for stale-row protection');
    await finishSheet(fixture,0,{...confirmed,action:'update'});
    await pending;
    assert.equal(fixture.localRequests.length,0,'sheet-only edits must not create local records');
    assert.ok(fixture.context.savedLeadRevision > 0);
    assert.ok(fixture.context.sheetLeads.some(lead => lead.leadId === confirmed.leadId));
    fixture.recordsRefresh.resolve(); fixture.contactsRefresh.resolve();
    await tick();
});

test('a local response without a committed ID cannot produce a false success', {timeout:3000}, async () => {
    const fixture = setup();
    const pending = fixture.save();
    const rejected = assert.rejects(pending,/แถว 10.*บันทึกซ้ำ/);
    await finishSheet(fixture);
    fixture.localRequests[0].resolve({lead:{name:values.name}});
    await rejected;
    assert.equal(fixture.context.savedLeadRevision,0);
    assert.equal(fixture.refreshCalls.length,0);
});

test('late refresh warnings do not replace messages after switching connection or committing a newer save', {timeout:3000}, async () => {
    for (const change of ['session','service','revision']) {
        const fixture = setup();
        const pending = fixture.save();
        await finishSheet(fixture); await finishLocal(fixture); await pending;
        if (change === 'session') fixture.context.session = {id:'new-session'};
        if (change === 'service') fixture.context.service = 'http://new-service.test';
        if (change === 'revision') fixture.context.applyConfirmedLead({...confirmed,leadId:'L-261003-DEF',rowNumber:11},values,{});
        fixture.recordsRefresh.reject(new Error('old refresh unavailable'));
        fixture.contactsRefresh.resolve();
        await tick();
        assert.equal(fixture.notices.filter(item => item.warning).length,0, `${change} change supersedes a stale warning`);
    }
});

// Exercise the real loader as well as the save callback: an old read must never overwrite newly saved caches.
function recordsLoader() {
    const requests = [], dates = deferred(), renders = [];
    const context = vm.createContext({
        tab:'leads',session:{id:'fixture-session'},service:'http://fixture.test',savedLeadRevision:0,
        records:{leads:[],installations:[]},recordsLoaded:false,sheetLeads:[],
        api:action => {
            const request = {...deferred(),action}; requests.push(request); return request.promise;
        },
        renderInstallations:() => renders.push('installations'),renderInbox:() => renders.push('inbox'),
        renderStatusOptions:() => renders.push('status-options'),renderLeads:() => renders.push('leads'),
        updateFollowUpCount:() => renders.push('followups'),notice:() => renders.push('notice'),
        customerFollowUp:lead => lead.status,loadInstallationDates:() => dates.promise
    });
    vm.runInContext(extractFunction('loadRecords'),context,{filename:'lead-data-app.js:loadRecords'});
    return {context,requests,dates,renders};
}

test('records and sheet responses started before a save cannot overwrite the newly confirmed caches', {timeout:3000}, async () => {
    for (const stage of ['records','sheet','dates']) {
        const fixture = recordsLoader();
        const pending = fixture.context.loadRecords(false,{reportErrors:true});
        if (stage !== 'records') {
            fixture.requests[0].resolve({leads:[{id:'old-local'}],installations:[]});
            await tick();
        }
        if (stage === 'dates') {
            fixture.requests[1].resolve({leads:[{id:'old-sheet',leadId:'old-id',status:'old',customerId:'old-customer'}]});
            await tick();
        }
        fixture.context.savedLeadRevision++;
        const currentRecords = {leads:[{id:'confirmed-local'}],installations:[]};
        const currentSheet = [{id:'confirmed-sheet',leadId:confirmed.leadId,installationDate:'confirmed-date'}];
        fixture.context.records = currentRecords;
        fixture.context.sheetLeads = currentSheet;
        if (stage === 'records') fixture.requests[0].resolve({leads:[{id:'old-local'}],installations:[]});
        if (stage === 'sheet') fixture.requests[1].resolve({leads:[{id:'old-sheet',status:'old'}]});
        if (stage === 'dates') fixture.dates.reject(new Error('old booking dates unavailable'));
        await pending;
        assert.equal(fixture.context.records,currentRecords, `${stage} response preserves current local data`);
        assert.equal(fixture.context.sheetLeads,currentSheet, `${stage} response preserves current sheet data`);
        assert.equal(currentSheet[0].installationDate,'confirmed-date');
    }
});

test('a stale initial records rejection cannot report an error over a newer save or connection', {timeout:3000}, async () => {
    for (const change of ['revision','session','service']) {
        const fixture = recordsLoader();
        const pending = fixture.context.loadRecords(false,{reportErrors:true});
        const currentRecords = {leads:[{id:'confirmed-local'}],installations:[]};
        const currentSheet = [{id:'confirmed-sheet',leadId:confirmed.leadId}];
        fixture.context.records = currentRecords;
        fixture.context.sheetLeads = currentSheet;
        if (change === 'revision') fixture.context.savedLeadRevision++;
        if (change === 'session') fixture.context.session = {id:'new-session'};
        if (change === 'service') fixture.context.service = 'http://new-service.test';
        const finished = assert.doesNotReject(pending, `${change} makes the old initial read irrelevant`);
        fixture.requests[0].reject(new Error('old initial records read unavailable'));
        await finished;
        assert.equal(fixture.context.records,currentRecords);
        assert.equal(fixture.context.sheetLeads,currentSheet);
        assert.equal(fixture.requests.length,1,'an abandoned read does not request more tables');
        assert.equal(fixture.renders.length,0,'an abandoned failure does not render or display an error');
    }
});

test('a reported background sheet failure preserves the confirmed lead instead of clearing the cache', {timeout:3000}, async () => {
    const fixture = recordsLoader();
    const currentSheet = [{id:'confirmed-sheet',leadId:confirmed.leadId}];
    fixture.context.sheetLeads = currentSheet;
    const pending = fixture.context.loadRecords(false,{reportErrors:true});
    const rejected = assert.rejects(pending,/sheet reader unavailable/);
    fixture.requests[0].resolve({leads:[],installations:[]});
    await tick();
    fixture.requests[1].reject(new Error('sheet reader unavailable'));
    await rejected;
    assert.equal(fixture.context.sheetLeads,currentSheet);
    assert.ok(!fixture.renders.includes('notice'),'the save-refresh wrapper owns the warning');
});

test('an old saved-contact response cannot remove the status applied by a newer save or connection', {timeout:3000}, async () => {
    for (const change of ['revision','session','service']) {
        const response = deferred();
        let clears = 0, renders = 0;
        const context = vm.createContext({
            session:{id:'fixture-session'},service:'http://fixture.test',savedLeadRevision:0,
            sheetContacts:[],sheetChecked:false,
            sheetContactCache:{clear:() => { clears++; },get:() => response.promise},
            renderInbox:() => { renders++; }
        });
        vm.runInContext(extractFunction('checkSheetContacts'),context,{filename:'lead-data-app.js:checkSheetContacts'});
        const pending = context.checkSheetContacts({refresh:true});
        assert.equal(clears,1,'post-save status checks force a fresh read');
        const latestContacts = [{channel:'Tel',contact:'Newly saved contact'}];
        context.sheetContacts = latestContacts; context.sheetChecked = true;
        if (change === 'revision') context.savedLeadRevision++;
        if (change === 'session') context.session = {id:'new-session'};
        if (change === 'service') context.service = 'http://new-service.test';
        response.resolve({contacts:[]});
        await pending;
        assert.equal(context.sheetContacts,latestContacts, `${change} prevents stale saved-contact flags replacing the current status`);
        assert.equal(context.sheetChecked,true);
        assert.equal(renders,0,'a stale response does not redraw the inbox');
    }
});

test('editing contact identity preserves known customer facts and keeps customer conversion pending until a fresh check', {timeout:3000}, () => {
    for (const isCustomer of [false,true]) {
        const fixture = setup();
        const oldLead = {id:'sheet-lead:8',leadId:confirmed.leadId,isCustomer,pendingCustomerCheck:false,
            customerId:isCustomer ? 'known-customer' : '',installationDate:'known-date',
            sheetData:{...values,phone:'081-000-0000',contact:'Old identity'},historyCount:2};
        const unrelated = {id:'sheet-lead:7',leadId:'L-261003-111',name:'Unrelated lead'};
        fixture.context.sheetLeads = [oldLead,unrelated];
        const newHistory = [{id:'new-history',at:'2026-10-03T10:00',by:'Fixture Sales',text:'Changed identity'}];
        fixture.context.applyConfirmedLead(confirmed,{...values,contact:'New identity',contactHistory:newHistory},oldLead);
        const current = fixture.context.sheetLeads.find(lead => lead.leadId === confirmed.leadId);
        assert.equal(current.id,oldLead.id);
        assert.equal(current.isCustomer,isCustomer,'known customer facts remain available while refreshing');
        assert.equal(current.installationDate,'known-date');
        assert.equal(current.pendingCustomerCheck,true,'changed identity must not enable customer conversion before checking the sheet');
        assert.equal(current.sheetData.contact,'New identity');
        assert.equal(current.sheetData.phone,values.phone);
        assert.equal(fixture.context.sheetLeads.filter(lead => lead.leadId === confirmed.leadId).length,1);
        assert.ok(fixture.context.sheetLeads.includes(unrelated));
        assert.ok(fixture.context.sheetContacts.some(contact => contact.contact === 'New identity'));
        newHistory[0].text = 'Changed after commit';
        assert.equal(current.contactHistory[0].text,'Changed identity','confirmed history is copied rather than sharing the editable form object');
    }
});

test('server-confirmed booking status and history appear immediately for new and edited leads', {timeout:3000}, async () => {
    const serverHistory=[{id:'CAR-BOOKING:L-1:JOB-1:คิวใหม่',at:'2026-10-03T12:00:00',by:'ระบบ',text:'นัดคิวติดตั้งแล้ว'}];
    for(const platform of ['manual','sheet-lead']) {
        const f=setup({platform,initialLead:platform==='sheet-lead'?{id:'sheet-lead:9',leadId:confirmed.leadId}:{}});
        const pending=f.save();
        await finishSheet(f,0,{...confirmed,followUp:'🟢 มัดจำ/นัดติดตั้งแล้ว',contactHistory:serverHistory,historyCount:1});
        if(platform==='manual') {
            assert.equal(f.localRequests[0].input.sheetData.followUp,'🟢 มัดจำ/นัดติดตั้งแล้ว');
            await finishLocal(f);
        }
        await pending;
        const lead=f.context.sheetLeads.find(l=>l.leadId===confirmed.leadId);
        assert.equal(lead.status,'🟢 มัดจำ/นัดติดตั้งแล้ว');
        assert.deepEqual(snapshot(lead.contactHistory),serverHistory);
        f.recordsRefresh.resolve();f.contactsRefresh.resolve();await tick();
    }
});
