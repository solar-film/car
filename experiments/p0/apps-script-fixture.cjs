'use strict';
// Memory-only Apps Script services. No HTTP, credentials, or production writes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const columns = ['วันที่','Admin','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ','ชื่อลูกค้า','เบอร์โทร','ยี่ห้อรถยนต์','รุ่นรถยนต์','ตำแหน่งติดตั้ง * (เลือกได้หลายตำแหน่ง)','ยี่ห้อที่สนใจ','รุ่นที่สนใจ','งบประมาณ','ประเภทลูกค้า','รู้จักเราจาก','สถานะการติดตาม','*หมายเหตุ'];
function fixture(options = {}) {
  const tables = options.tables || {
    lead: [[...columns, 'Lead ID', 'unrelated'], ['2026-10-01','','Line','synthetic-old','ข้อมูลสมมติ','','','','','','','','','','','','L-261001-001','=KEEP()']],
    Customer: [['CustID','เบอร์โทรศัพท์','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ']],
    Bookings: [['JobID','CustID','วันที่ติดตั้ง','เวลานัด','Status','Lead ID']],
    'ประวัติการติดต่อ': [['Contact ID','Lead ID','Customer ID','วันเวลาติดต่อ','ช่องทาง','เรื่องที่คุย','ผลการติดต่อ','ผู้ดูแล']]
  };
  const notes = new Map(), formats = new Map(), cache = new Map(), writes = [], state = {failWrite:false, corruptReadback:false, lockAvailable:true, locked:false, releases:0, opens:0};
  const display = value => value instanceof Date ? format(value, 'yyyy-MM-dd HH:mm:ss') : String(value ?? '');
  const sheets = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, {
    getSheetId: () => name === 'lead' ? 1814698691 : 101,
    getLastRow: () => Math.max(rows.length, ...[...notes.keys()].filter(k => k.startsWith(name+':')).map(k => +k.split(':')[1])),
    getLastColumn: () => rows[0].length,
    getMaxRows: () => Math.max(1000,rows.length),
    appendRow(values) { this.getRange(this.getLastRow()+1,1,1,values.length).setValues([values]); return this; },
    getDataRange() { return this.getRange(1,1,this.getLastRow(),this.getLastColumn()); },
    deleteRow(row) { writes.push({name,row,delete:true}); rows.splice(row-1,1); },
    getRange(row,col,height=1,width=1) {
      const range = {
        getValues: () => Array.from({length:height},(_,r) => Array.from({length:width},(_,c) => {
          if (state.corruptReadback && col+c===5 && writes.some(w => w.name===name && w.row===row+r && w.col===5 && !w.note)) return 'CORRUPTED';
          return rows[row+r-1]?.[col+c-1] ?? '';
        })),
        getDisplayValues: () => range.getValues().map(r => r.map(value => state.corruptReadback && row > 1 ? 'CORRUPTED' : display(value))),
        getDisplayValue: () => range.getDisplayValues()[0][0],
        getValue: () => range.getValues()[0][0],
        getFormula: () => '',
        getNotes: () => Array.from({length:height},(_,r) => Array.from({length:width},(_,c) => notes.get(`${name}:${row+r}:${col+c}`) || '')),
        getNote: () => notes.get(`${name}:${row}:${col}`) || '',
        setNote(value) { writes.push({name,row,col,note:true}); notes.set(`${name}:${row}:${col}`,value); return range; },
        setNumberFormat(value) { for(let r=0;r<height;r++)for(let c=0;c<width;c++)formats.set(`${name}:${row+r}:${col+c}`,value);return range; },
        setNumberFormats(values) { values.forEach((r,j)=>r.forEach((v,i)=>formats.set(`${name}:${row+j}:${col+i}`,v)));return range; },
        setValues(values) { values.forEach((r,j) => r.forEach((v,i) => thisSheet.getRange(row+j,col+i).setValue(v))); return range; },
        setValue(value) {
          if (state.failWrite && name === 'lead' && col === 5) { state.failWrite=false; throw Error('synthetic interrupted write'); }
          writes.push({name,row,col}); rows[row-1] ||= [];
          rows[row-1][col-1] = typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value;
          return range;
        }
      };
      const thisSheet = sheets[name];
      return range;
    }
  }]));
  const book = {getSheetByName:name => sheets[name]};
  const content = {MimeType:{JSON:'JSON'}, createTextOutput:text => ({text,setMimeType() { return this; }})};
  function format(date, pattern) {
    const iso = new Date(date.getTime()+7*3600000).toISOString();
    if (pattern === 'yyMMdd') return iso.slice(2,10).replaceAll('-','');
    if (pattern === 'HH:mm:ss') return iso.slice(11,19);
    if (pattern === 'yyyy-MM-dd HH:mm:ss') return iso.slice(0,19).replace('T',' ');
    return iso.slice(0,10);
  }
  const context = vm.createContext({Date, console:{log(){},error(){}},
    CacheService:{getScriptCache:() => ({get:key=>cache.get(key)||null,put:(key,value)=>cache.set(key,value),remove:key=>cache.delete(key)})},
    PropertiesService:{getScriptProperties:() => ({getProperty:() => 'synthetic-write-token'})},
    ContentService:content,
    LockService:{getScriptLock:() => ({tryLock:() => (state.locked=state.lockAvailable),hasLock:() => state.locked,releaseLock() { state.locked=false; state.releases++; }})},
    SpreadsheetApp:{openById:() => {state.opens++;return book;},flush(){}},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
      computeDigest:(_,value) => Array.from(crypto.createHash('sha256').update(value).digest()),
      parseDate:value => new Date(value.replace(' ','T')+(value.length===10?'T00:00:00':'')+'+07:00'),formatDate:(date,_tz,pattern) => format(date,pattern)}
  });
  if(options.bundleSource)vm.runInContext(options.bundleSource,context,{filename:'authorized-source-snapshot.gs'});
  else for (const file of ['Code.gs','CarContactHistory.gs','CarBookingStatusSync.gs','LeadSheet.gs']) vm.runInContext(read(file),context,{filename:file});
  return {tables,notes,formats,cache,sheets,writes,state,context,
    save:body => JSON.parse(context.doPost({postData:{contents:JSON.stringify(body)}}).text),
    plan:(leads,customers,bookings) => JSON.parse(JSON.stringify(context.carBookingStatusPlan_(leads,customers,bookings)))};
}
const payload = () => ({action:'upsertLead',sheetName:'lead',token:'synthetic-write-token',leadKey:'line:synthetic:person-1',
  data:Object.fromEntries(columns.map(c => [c, ({'วันที่':'2026-10-27','ชื่อลูกค้า':'ข้อมูลสมมติ','ช่องทางติดต่อ':'Line','ชื่อช่องทางติดต่อ':'synthetic-person','รู้จักเราจาก':'ไม่ทราบ','เบอร์โทร':'0000000000'})[c] || '']))});
module.exports = {fixture,payload,columns,read};
