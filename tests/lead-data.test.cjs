'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const core = require('../lead-data-core.js');
const { store, createServer, authorize, signature, parseEvents } = require('../lead-data-server.cjs');
const crypto = require('node:crypto');

test('CSV preserves Thai text, multiline notes, quotes and zero amounts', () => {
    const rows = core.csv('\uFEFFJobID,หมายเหตุ,ยอดขาย\r\nJ1,"บรรทัดแรก\r\n""ฟิล์ม""",0\r\n');
    assert.deepEqual(rows, [{ JobID:'J1',หมายเหตุ:'บรรทัดแรก\r\n"ฟิล์ม"',ยอดขาย:'0' }]);
    assert.throws(() => core.csv('JobID,หมายเหตุ\nJ1,"ไม่จบ'), /คำพูด/);
});

test('legacy import keeps cancelled jobs, every original column and related installation data', () => {
    const database = store(':memory:');
    try {
        const customer = { CustID:'C1',ชื่อลูกค้า:'ลูกค้าทดสอบ',เบอร์โทรศัพท์:'0812345678',ที่อยู่:'กรุงเทพฯ' };
        const job = { JobID:'J1',CustID:'C1',Status:'ยกเลิก',ยอดขาย:'0',คอลัมน์เพิ่มเติม:'เก็บทั้งหมด' };
        const related = { data:[{JobID:' j1 ',ทีมช่าง:'ทีมเอ'}],Detail_film:[{JobID:'J1',ฟิล์ม:'3M'}],PayIn:[{JobID:'J1',หลักฐาน_1:'proof.jpg'}] };
        const preview = core.legacyPreview([customer],[job],related);
        assert.equal(preview[0].related.data.length,1);
        assert.deepEqual(database.importLegacy(preview,'admin'),{added:1,skipped:0});
        assert.deepEqual(database.importLegacy(preview,'admin'),{added:0,skipped:1});
        const records = database.rows('installations');
        assert.equal(records[0].status,'ยกเลิก'); assert.equal(records[0].amount,'0');
        assert.deepEqual(records[0].raw,job); assert.deepEqual(records[0].related.PayIn,related.PayIn);
        assert.deepEqual(database.rows('leads')[0].rawCustomer,customer);
    } finally { database.db.close(); }
});

test('legacy import rolls back the entire batch if any job is invalid', () => {
    const database = store(':memory:');
    try {
        assert.throws(() => database.importLegacy([{jobId:'J1',custId:'C1',customerName:'ลูกค้า'}, {jobId:'',customerName:'ไม่ถูกต้อง'}],'admin'),/JobID/);
        assert.equal(database.rows('leads').length,0); assert.equal(database.rows('installations').length,0);
        assert.equal(database.db.prepare('SELECT count(*) AS n FROM audit').get().n,0);
    } finally { database.db.close(); }
});

test('selecting the same LINE identity twice reuses its CAR lead and preserves edits', () => {
    const database = store(':memory:');
    try {
        const source = {platform:'line',account:core.LINE_ACCOUNT,userId:'U123'};
        const first = database.transaction(() => database.saveLead({name:'ชื่อแรก'},'admin',source));
        database.transaction(() => database.saveLead({id:first.lead.id,name:'ชื่อที่แก้',note:'ติดตามแล้ว'},'admin'));
        const second = database.transaction(() => database.saveLead({name:'ชื่อจากโปรไฟล์'},'admin',source));
        assert.equal(second.duplicate,true); assert.equal(second.lead.id,first.lead.id);
        assert.equal(second.lead.name,'ชื่อที่แก้'); assert.equal(second.lead.note,'ติดตามแล้ว');
        assert.equal(database.rows('leads').length,1);
    } finally { database.db.close(); }
});

test('one lead can have many installation records; editing keeps original references', () => {
    const database = store(':memory:');
    try {
        const lead = database.saveLead({name:'ลูกค้า'},'admin').lead;
        assert.throws(() => database.saveInstallation({leadId:'missing',date:'2026-09-30'},'admin'),/เลือกลีด/);
        assert.throws(() => database.saveInstallation({leadId:lead.id,date:'2026-09-30',amount:'abc'},'admin'),/ยอดเงิน/);
        const first = database.saveInstallation({leadId:lead.id,date:'2026-09-30',carModel:'Toyota',amount:'0'},'admin');
        database.saveInstallation({leadId:lead.id,date:'2026-10-01',amount:'12000'},'admin');
        database.saveInstallation({...first,plate:'กข 1234',status:'เสร็จสิ้น'},'admin');
        assert.equal(database.rows('installations').length,2);
        assert.equal(database.rows('installations').find(i => i.id === first.id).plate,'กข 1234');
    } finally { database.db.close(); }
});

test('CAR access is independent; remote access cannot silently fall back to local mode', () => {
    const request = {headers:{host:'localhost:3092'},socket:{remoteAddress:'127.0.0.1'}};
    assert.equal(authorize({host:'127.0.0.1'},request).mode,'local');
    assert.throws(() => authorize({host:'0.0.0.0'},request),/CAR_LEAD_ACCESS_KEY/);
    assert.throws(() => authorize({host:'127.0.0.1'}, {...request,headers:{host:'untrusted.example'}}),/CAR_LEAD_ACCESS_KEY/);
    assert.throws(() => authorize({accessKey:'correct'},request),/Access Key/);
    assert.equal(authorize({accessKey:'correct'},{...request,headers:{'x-car-lead-key':'correct'}}).mode,'key');
});

test('CAR service guards API access, filters CAR account, and deduplicates native webhook deliveries', async () => {
    const database = store(':memory:');
    const settings = {host:'127.0.0.1',accessKey:'valid',facebookPage:'',allowedOrigin:'',lineSecret:'line-secret',lineBotId:'CAR-bot'};
    const server = createServer(settings,database);
    server.listen(0,'127.0.0.1'); await once(server,'listening');
    const base = `http://127.0.0.1:${server.address().port}/api/lead-data/`;
    const headers = {'X-Car-Lead-Key':'valid','Content-Type':'application/json'};
    try {
        assert.equal((await fetch(base+'records')).status,401);
        assert.equal((await fetch(base+'records',{headers:{...headers,Origin:'https://evil.example'}})).status,403);
        assert.equal((await fetch(base+'inbox?platform=facebook',{headers})).status,503);
        const raw = JSON.stringify({destination:'CAR-bot',events:[{type:'message',source:{type:'user',userId:'U'+'a'.repeat(32)},timestamp:Date.now(),webhookEventId:'event-1'}]});
        const hook = base.replace('/api/lead-data/','/lead-webhooks/')+'line';
        const webhookHeaders = {'Content-Type':'application/json','x-line-signature':crypto.createHmac('sha256',settings.lineSecret).update(raw).digest('base64')};
        assert.equal((await fetch(hook,{method:'POST',headers:{'x-line-signature':'invalid'},body:raw})).status,401);
        assert.equal((await fetch(hook,{method:'POST',headers:webhookHeaders,body:raw})).status,200);
        assert.equal((await fetch(hook,{method:'POST',headers:webhookHeaders,body:raw})).status,200);
        const inbox = await fetch(base+'inbox?platform=line&account=gfs-line-249izgyn',{headers});
        assert.equal(inbox.status,200);
        const result = await inbox.json(); assert.equal(result.contacts.length,1);
        const row = result.contacts[0]; assert.equal(row.account_key,core.LINE_ACCOUNT);
        const selected = await fetch(base+'select',{method:'POST',headers,body:JSON.stringify({platform:'line',contactId:row.id,lead:{name:'ชื่อยืนยัน'}})});
        assert.equal(selected.status,200); assert.equal(database.rows('leads').length,1);
        assert.equal(database.db.prepare('SELECT count(*) AS n FROM inbox_events').get().n,1);
        assert.equal((await fetch(base+'inbox?platform=line&page=-1',{headers})).status,400);
        assert.equal((await fetch(base.replace('/api/lead-data/','/')+'lead-data.env')).status,404);
        assert.equal((await fetch(base.replace('/api/lead-data/','/')+'lead-data-app.js')).status,200);
        const qr = await fetch(base.replace('/api/lead-data/','/')+'images/qrcode_mhl.png');
        assert.equal(qr.status,200);
        assert.equal(qr.headers.get('content-type'),'image/png');
        assert.deepEqual(Buffer.from(await qr.arrayBuffer()),require('node:fs').readFileSync(require('node:path').join(__dirname,'../images/qrcode_mhl.png')));
        assert.equal((await fetch(base.replace('/api/lead-data/','/')+'images/%2e%2e%2flead-data.env')).status,404);
    } finally { await new Promise(resolve => server.close(resolve)); database.db.close(); }
});

test('native webhook validation restricts LINE destination and Facebook page, and accepts standby messages', () => {
    const settings = {lineBotId:'CAR',facebookPage:'12345'};
    assert.throws(() => parseEvents('line',{destination:'GFS',events:[]},settings),/destination/);
    const event = {sender:{id:'67890'},recipient:{id:'12345'},timestamp:Date.now(),message:{mid:'message-1'}};
    const facebook = {object:'page',entry:[{id:'GFS',messaging:[event]},{id:'12345',standby:[event,{...event,message:{mid:'echo',is_echo:true}}]}]};
    assert.equal(parseEvents('facebook',facebook,settings).length,1);
    assert.throws(() => parseEvents('facebook',{object:'page',entry:[{id:'12345',messaging:[{...event,recipient:{id:'GFS'}}]}]},settings),/recipient|sender/);
    const raw = Buffer.from('{}');
    const line = crypto.createHmac('sha256','secret').update(raw).digest('base64');
    const fb = 'sha256='+crypto.createHmac('sha256','secret').update(raw).digest('hex');
    assert.equal(signature(raw,line,'secret','line'),true); assert.equal(signature(raw,fb,'secret','facebook'),true);
    assert.equal(signature(Buffer.from('{"changed":true}'),line,'secret','line'),false);
});

test('daily statistics count people across all pages, repeated messages and Thai midnight', () => {
    const database = store(':memory:');
    try {
        database.receive('line',core.LINE_ACCOUNT,[{eventId:'e1',userId:'old',at:'2026-09-29T16:59:59Z'}, {eventId:'e2',userId:'old',at:'2026-09-29T17:00:00Z'}, {eventId:'e3',userId:'old',at:'2026-09-30T02:00:00Z'}, {eventId:'e4',userId:'new',at:'2026-09-30T02:00:00Z'}]);
        assert.deepEqual(database.daily('line',core.LINE_ACCOUNT,'2026-09-30'),{total:2,fresh:1,selected:0});
        assert.deepEqual(database.daily('line',core.LINE_ACCOUNT,'2026-09-29'),{total:1,fresh:1,selected:0});
    } finally { database.db.close(); }
});

test('source archive preserves orphan rows and survives edits of imported jobs', () => {
    const database = store(':memory:');
    try {
        const sources = {Customer:[],Bookings:[{JobID:'J1',วันที่ติดตั้ง:'30/9/2026'}],data:[],Detail_film:[{JobID:'orphan',ฟิล์ม:'ต้นฉบับ'}],PayIn:[]};
        const items = core.legacyPreview(sources.Customer,sources.Bookings,{Detail_film:sources.Detail_film});
        database.importLegacy(items,'CAR',sources);
        assert.deepEqual(database.archive().Detail_film.rows,sources.Detail_film);
        const item = database.rows('installations')[0];
        database.saveInstallation({...item,date:'2026-09-30',note:'แก้ไขใน CAR'},'CAR');
        assert.deepEqual(database.rows('installations')[0].raw,sources.Bookings[0]);
        assert.deepEqual(database.rows('installations')[0].related,item.related);
    } finally { database.db.close(); }
});
