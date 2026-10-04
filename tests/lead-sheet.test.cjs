const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {store} = require('../lead-data-server.cjs');
const columns = ['วันที่','Admin','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ','ชื่อลูกค้า','เบอร์โทร','ยี่ห้อรถยนต์','รุ่นรถยนต์','ตำแหน่งติดตั้ง * (เลือกได้หลายตำแหน่ง)','ยี่ห้อที่สนใจ','รุ่นที่สนใจ','งบประมาณ','ประเภทลูกค้า','รู้จักเราจาก','สถานะการติดตาม','*หมายเหตุ'];
function setup() {
    const rows = [[...columns, 'Lead ID'],['เดิม','','','','ลูกค้าเดิม']];
    const customers = [['CustID','ชื่อลูกค้า','เบอร์โทรศัพท์','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ']];
    const bookings = [['JobID','CustID','วันที่ติดตั้ง','เวลานัด','Status']];
    const histories = [['Contact ID','Lead ID','Customer ID','วันเวลาติดต่อ','ช่องทาง','เรื่องที่คุย','ผลการติดต่อ','ผู้ดูแล']];
    const notes = new Map();
    let fail = false;
    function makeSheet(data, cellNotes = new Map(), sheetId = 0) { return {
        getSheetId:() => sheetId, getLastColumn:() => data[0].length,
        getLastRow:() => Math.max(data.length,...[...cellNotes.keys()].map(k => Number(k.split(':')[0]))),
        getDataRange() { return this.getRange(1,1,this.getLastRow(),this.getLastColumn()); },
        getRange(r,c,height=1,width=1) {
            const range = {
                getDisplayValues:() => range.getValues().map(row => row.map(value => value instanceof Date ? value.toISOString().slice(0,19).replace('T',' ') : String(value))),
                getDisplayValue:() => range.getDisplayValues()[0][0],
                getValues:() => Array.from({length:height},(_,j) => Array.from({length:width},(_,i) => data[r+j-1]?.[c+i-1] ?? '')),
                getFormula:() => '',
                getNotes:() => Array.from({length:height},(_,i) => [cellNotes.get(`${r+i}:${c}`) || '']),
                getNote:() => cellNotes.get(`${r}:${c}`) || '',
                setNote:note => {cellNotes.set(`${r}:${c}`,note); return range;},
                setNumberFormat:() => range,
                setValues:values => { values.forEach((row,j) => row.forEach((value,i) => this.getRange(r+j,c+i).setValue(value))); return range; },
                setValue:value => {
                    if (fail && data === rows && c === 5) {fail=false; throw new Error('network interrupted');}
                    data[r-1] ||= [];
                    data[r-1][c-1] = typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value;
                    return range;
                }
            };
            return range;
        }
    }; }
    const sheets = {lead:makeSheet(rows,notes,1814698691),Customer:makeSheet(customers),Bookings:makeSheet(bookings),'ประวัติการติดต่อ':makeSheet(histories)};
    const context = vm.createContext({Date,SHEET_ID:'CAR',SpreadsheetApp:{openById:() => ({getSheetByName:name => sheets[name]}),flush() {}},
        Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(algorithm,value) => Array.from(require('node:crypto').createHash('sha256').update(value).digest()),parseDate:s => new Date(s.includes(' ') ? s.replace(' ','T')+'Z' : s+'T00:00:00Z'),formatDate:(d,tz,fmt) => fmt === 'yyMMdd' ? d.toISOString().slice(2,10).replaceAll('-','') : fmt === 'HH:mm:ss' ? d.toISOString().slice(11,19) : fmt === 'yyyy-MM-dd HH:mm:ss' ? d.toISOString().slice(0,19).replace('T',' ') : d.toISOString().slice(0,10)},jsonOutput_:x => x});
    vm.runInContext(fs.readFileSync(require.resolve('../CarContactHistory.gs'),'utf8'),context);
    const syncHistory = context.syncCarContactHistory_;
    context.syncCarContactHistory_ = (book,id,data) => { context.lastHistory = data.contactHistory; return syncHistory(book,id,data); };
    vm.runInContext(fs.readFileSync(require.resolve('../CarBookingStatusSync.gs'),'utf8'),context);
    vm.runInContext(fs.readFileSync(require.resolve('../LeadSheet.gs'),'utf8'),context);
    return {rows,notes,context,customers,bookings,histories,sheets,save:body => context.upsertCarLeadSheet_(JSON.parse(JSON.stringify(body))),interrupt:() => {fail=true;}};
}
const payload = {sheetName:'lead',leadKey:'line:car:U1',data:{'วันที่':'2026-10-01','ชื่อลูกค้า':'ทดสอบ','ชื่อช่องทางติดต่อ':'Weerachon','เบอร์โทร':'001234','*หมายเหตุ':'=HYPERLINK("bad")'}};
test('Instagram uses the existing lead save contract and preserves its ID on retries without altering old rows', () => {
    const fixture = setup(), before = JSON.stringify(fixture.rows.slice(0,2));
    const input = {...payload,leadKey:'instagram:car-ig-17841458662245781:987654321',
        data:{...payload.data,'ช่องทางติดต่อ':'IG','ชื่อช่องทางติดต่อ':'instagram_test_profile','รู้จักเราจาก':'Instagram'}};
    const first = fixture.save(input);
    assert.equal(first.verified,true);
    assert.equal(fixture.save(input).leadId,first.leadId);
    assert.equal(fixture.rows.length,3);
    assert.equal(fixture.rows[2][2],'IG');
    assert.equal(fixture.rows[2][3],'instagram_test_profile');
    assert.equal(fixture.rows[2][13],'Instagram');
    assert.equal(JSON.stringify(fixture.rows.slice(0,2)),before);
});
test('new leads get unique IDs and retries and edits preserve the original ID', () => {
    const fixture = setup();
    const first = fixture.save(payload);
    assert.match(first.leadId, /^L-\d{6}-[0-9A-F]{3}$/);
    assert.equal(fixture.save(payload).leadId,first.leadId);
    const second = fixture.save({...payload,leadKey:'line:car:U2'});
    assert.notEqual(second.leadId,first.leadId);
    assert.equal(fixture.save({...payload,action:'updateLeadSheet',previous:Object.fromEntries(columns.map(name => [name,payload.data[name] || '']))}).leadId,first.leadId);
    assert.equal(fixture.rows[2][16],first.leadId);
});
test('lead saves verified columns, preserves old rows and retries the same row', () => {
    const fixture = setup();
    const saved = fixture.save(payload);
    assert.equal(saved.verified,true); assert.equal(saved.rowNumber,3);
    const savedTimestamp = fixture.rows[2][0].getTime();
    assert.equal(fixture.rows[2][3],'Weerachon');
    assert.equal(fixture.rows[2][5],'001234');
    assert.equal(fixture.rows[2][15],payload.data['*หมายเหตุ']);
    fixture.save({...payload,previous:Object.fromEntries(columns.map(name => [name,payload.data[name] || ''])),data:{...payload.data,'ชื่อลูกค้า':'แก้ไข'}});
    assert.equal(fixture.rows[2][0].getTime(),savedTimestamp);
    assert.equal(fixture.rows.length,3); assert.equal(fixture.rows[2][4],'แก้ไข');
    assert.equal(fixture.rows[1][4],'ลูกค้าเดิม');
});
test('interrupted writes reserve a row and retry without creating duplicates', () => {
    const fixture = setup(); fixture.interrupt();
    assert.throws(() => fixture.save(payload),/interrupted/);
    assert.equal(fixture.save(payload).rowNumber,3);
    assert.equal(fixture.rows.length,3);
});
test('invalid worksheet, schema and dates fail before writing', () => {
    const fixture = setup();
    assert.throws(() => fixture.save({...payload,sheetName:'Customer'}),/เฉพาะชีต lead/);
    assert.throws(() => fixture.save({...payload,data:{...payload.data,'วันที่':'2026-02-30'}}),/วันที่ไม่ถูกต้อง/);
    fixture.rows[0][0]='renamed';
    assert.throws(() => fixture.save(payload),/หัวคอลัมน์/);
    assert.equal(fixture.notes.size,0); assert.equal(fixture.rows.length,2);
});
test('local lead keeps its worksheet reference across edits', () => {
    const database = store(':memory:');
    try {
        const saved = database.saveLead({name:'ทดสอบ',sheetKey:payload.leadKey,sheetRow:3,sheetData:{admin:'ผู้ดูแล'},sheetSavedAt:'now'},'CAR-local').lead;
        const updated = database.saveLead({id:saved.id,name:'แก้ไข'},'CAR-local').lead;
        assert.equal(updated.sheetRow,3); assert.equal(updated.sheetKey,payload.leadKey);
        assert.equal(updated.sheetData.admin,'ผู้ดูแล');
    } finally {database.db.close();}
});
test('sheet edits update the matching original row and reject stale or ambiguous snapshots', () => {
    const fixture = setup();
    fixture.save(payload);
    const previous = Object.fromEntries(columns.map(name => [name,payload.data[name] || '']));
    const edit = {...payload,action:'updateLeadSheet',leadKey:'sheet-edit:unique',previous,data:{...payload.data,'ชื่อลูกค้า':'แก้ไขรายการเดิม'}};
    const saved = fixture.save(edit);
    assert.equal(saved.rowNumber,3); assert.equal(saved.action,'update');
    assert.equal(fixture.rows.length,3); assert.equal(fixture.rows[2][4],'แก้ไขรายการเดิม');
    assert.equal(fixture.save(edit).rowNumber,3);
    assert.throws(() => fixture.save({...edit,leadKey:'sheet-edit:stale'}),/ข้อมูลเดิมเปลี่ยน/);
    const duplicate = setup(); duplicate.save(payload); duplicate.rows.push(duplicate.rows[2].slice());
    assert.throws(() => duplicate.save(edit),/ซ้ำหลายแถว/);
    assert.equal(duplicate.notes.size,1);
});


test('legacy history is separated from plain note before worksheet write',()=>{
 const f=setup(), history=[{id:'H1',at:'2026-10-01T12:00',by:'ระบบ',text:'เริ่มต้น'}];
 const result=f.save({...payload,data:{...payload.data,'*หมายเหตุ':'หมายเหตุเดิม\n\n[CAR_CONTACT_HISTORY_V1]\n'+JSON.stringify(history)}});
 assert.equal(f.rows[result.rowNumber-1][15],'หมายเหตุเดิม');
 assert.equal(f.context.lastHistory.length,1);
 assert.equal(result.historyVerified,true);
});

test('column P notes support adding editing and clearing without changing other columns',()=>{
 const f=setup(); f.save(payload);
 let previous=Object.fromEntries(columns.map(name=>[name,payload.data[name] || '']));
 for(const [index,note] of ['หมายเหตุใหม่','แก้ไข "ข้อความ"\nอีกบรรทัด',''].entries()) {
   const before=f.rows[2].slice();
   const result=f.save({...payload,action:'updateLeadSheet',leadKey:'sheet-edit:note-'+index,previous,data:{...previous,'*หมายเหตุ':note}});
   assert.equal(result.verified,true);
   assert.equal(f.rows[2][15],note);
   assert.deepEqual(f.rows[2].slice(0,15),before.slice(0,15));
   previous={...previous,'*หมายเหตุ':note};
 }
});

test('a lead created after its booking gets verified automatic status and one history entry on retries', () => {
    const f=setup();
    f.customers.push(['C-1','Customer','001234','Line','Weerachon']);
    f.bookings.push(['JOB-1','C-1','3/10/2569','8:15','คิวใหม่']);
    const input={...payload,data:{...payload.data,'สถานะการติดตาม':'🟡 สอบถามใหม่'}};
    const saved=f.save(input);
    assert.equal(saved.followUp,'🟢 มัดจำ/นัดติดตั้งแล้ว');
    assert.equal(f.rows[2][14],saved.followUp);
    assert.equal(saved.historyCount,1);
    assert.equal(saved.contactHistory[0].text,'นัดคิวติดตั้งแล้ว');
    assert.equal(saved.contactHistory[0].by,'ระบบ');
    assert.equal(f.histories[1][2],'C-1');
    const historyId=saved.contactHistory[0].id;
    const retry=f.save(input);
    assert.equal(retry.leadId,saved.leadId);
    assert.equal(retry.contactHistory[0].id,historyId);
    assert.equal(f.histories.length,2);
});

test('editing a lead checks only that lead and uses the latest queue, including a cancelled latest queue', () => {
    const f=setup(), input={...payload,data:{...payload.data,'สถานะการติดตาม':'🟡 สอบถามใหม่'}};
    const first=f.save(input);
    f.save({...input,leadKey:'manual:other-lead'});
    f.customers.push(['C-1','Customer','001234','Line','Weerachon']);
    f.bookings.push(['JOB-OLD','C-1','19/9/2569','13:00','เสร็จสิ้น'],['JOB-LATEST','C-1','9/10/2569','8:15','คิวใหม่']);
    const snapshot = () => Object.fromEntries(columns.map((name,i) => [name,i===0?f.rows[2][i].toISOString().slice(0,10):String(f.rows[2][i] || '')]));
    const saved=f.save({...input,action:'updateLeadSheet',previous:snapshot()});
    assert.equal(saved.leadId,first.leadId);
    assert.equal(saved.followUp,'🟢 มัดจำ/นัดติดตั้งแล้ว');
    assert.match(saved.contactHistory[0].id,/JOB-LATEST:คิวใหม่$/);
    assert.equal(f.rows[3][14],'🟡 สอบถามใหม่','saving one lead must not change another lead');
    f.bookings[2][4]='เสร็จสิ้น';
    const completed=f.save({...input,action:'updateLeadSheet',previous:snapshot()});
    assert.equal(completed.followUp,'✅ ปิดการขายสำเร็จ');
    assert.equal(completed.contactHistory.at(-1).text,'ติดตั้งเรียบร้อย ปิดการขายสำเร็จ');
    assert.equal(completed.historyCount,2);
    f.bookings.push(['JOB-CANCELLED','C-1','10/10/2569','10:00','ยกเลิก']);
    const cancelled=f.save({...input,action:'updateLeadSheet',previous:snapshot(),data:{...input.data,'สถานะการติดตาม':'⏰ เลื่อนติดตั้ง'}});
    assert.equal(cancelled.followUp,'⏰ เลื่อนติดตั้ง','do not fall back to an older completed queue');
    assert.equal(cancelled.historyCount,2);
});

test('booking sync uses phone or channel identity, never name-only or ambiguous matches', () => {
    for(const mode of ['channel','same-name','ambiguous','missing-date']) {
        const f=setup();
        const input={...payload,data:{...payload.data,'ช่องทางติดต่อ':'Line','สถานะการติดตาม':'🟡 สอบถามใหม่'}};
        f.customers.push(['C-1','ทดสอบ',mode==='channel'||mode==='same-name'?'different-phone':'001234','Line',mode==='same-name'?'different-contact':'Weerachon']);
        if(mode==='ambiguous') f.customers.push(['C-2','Another','001234','Tel','Other']);
        f.bookings.push(['JOB-1','C-1',mode==='missing-date'?'':'3/10/2569','10:00','คิวใหม่']);
        const saved=f.save(input);
        assert.equal(saved.followUp,mode==='channel'?'🟢 มัดจำ/นัดติดตั้งแล้ว':'🟡 สอบถามใหม่',mode);
        assert.equal(saved.historyCount,mode==='channel'?1:0,mode);
    }
});

test('failed booking sync cannot report full success and retries preserve the saved lead and histories', () => {
    const f=setup();
    f.customers.push(['C-1','Customer','001234','Line','Weerachon']);
    f.bookings.push(['JOB-1','C-1','3/10/2569','10:00','คิวใหม่']);
    const original=f.context.syncCarBookingStatuses_;
    f.context.syncCarBookingStatuses_=()=>{throw Error('read failed');};
    assert.throws(()=>f.save(payload),/บันทึกลีดแล้ว.*ตรวจคิวติดตั้ง/);
    const id=f.rows[2][16];
    f.context.syncCarBookingStatuses_=original;
    const saved=f.save(payload);
    assert.equal(saved.leadId,id);
    assert.equal(f.rows.length,3);
    assert.equal(saved.followUp,'🟢 มัดจำ/นัดติดตั้งแล้ว');
    assert.equal(saved.historyCount,1);
});


test('known lead key rejects stale edits and accepts only the exact retry of the latest committed snapshot',()=>{
 const f=setup(),first=f.save(payload);
 const previous=Object.fromEntries(columns.map((name,i)=>[name,i===0?f.rows[2][i].toISOString().slice(0,10):String(f.rows[2][i]||'')]));
 const firstEdit={...payload,action:'updateLeadSheet',previous,data:{...payload.data,'*หมายเหตุ':'newer note'}};
 f.save(firstEdit); const before=JSON.stringify(f.rows);
 assert.throws(()=>f.save({...firstEdit,data:{...payload.data,'*หมายเหตุ':'stale overwrite'}}),/ข้อมูลเดิมเปลี่ยน/);
 assert.equal(JSON.stringify(f.rows),before);
 assert.equal(f.save(firstEdit).leadId,first.leadId);
 f.rows[2][15]='external change';
 assert.throws(()=>f.save(firstEdit),/ข้อมูลเดิมเปลี่ยน/);
 assert.equal(f.rows[2][15],'external change');
});
