const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {readDaily}=require('../lead-data-line-sheet.cjs');
const {store}=require('../lead-data-server.cjs');
const core=require('../lead-data-core.js');
test('CAR ledger ignores other accounts and non-messages; retries and Thai days merge safely',()=>{
 const rows=[];let created=0,released=0;
 const sheet={getLastRow:()=>rows.length,getDataRange:()=>({getDisplayValues:()=>rows.map(r=>r.slice())}),setFrozenRows(){},getRange(r,c,h,w){return {setNumberFormat(){return this;},setValues(values){values.forEach((v,i)=>rows[r+i-1]=v.slice());return this;}}}};
 const ctx=vm.createContext({Date,Map,Number,SPREADSHEET_ID:'test',Logger:{log(){}},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){released++;}})},SpreadsheetApp:{openById:()=>({getSheetByName:()=>created?sheet:null,insertSheet:()=>{created++;return sheet;}}),flush(){}},Utilities:{formatDate:d=>new Date(d.getTime()+7*3600000).toISOString().slice(0,10)}});
 vm.runInContext(fs.readFileSync('CarLineDaily.gs','utf8'),ctx);
 const event=(time,type='message')=>({type,timestamp:Date.parse(time),source:{type:'user',userId:'U'+'a'.repeat(32)},message:{text:'must not be stored'}});
 ctx.recordCarLineDaily_({events:[event('2026-10-01T16:59:00Z')]},'OTHER');assert.equal(created,0);
 ctx.initializeCarDaily();
 const events=[event('2026-10-01T16:59:00Z'),event('2026-10-01T17:01:00Z'),event('2026-10-01T18:01:00Z'),event('2026-10-02T18:01:00Z','follow')];
 ctx.recordCarLineDaily_({events},'1657810104');ctx.recordCarLineDaily_({events:events.slice().reverse()},'1657810104');
 assert.equal(rows.length,4);assert.equal(rows[2][3],'2026-10-01');assert.equal(rows[3][3],'2026-10-02');assert.equal(rows[3][5],'2026-10-01T18:01:00.000Z');assert.ok(!JSON.stringify(rows).includes('must not be stored'));assert.equal(released,3);
});
test('daily reader validates coverage and confirmed message days exclude old snapshot-only activity',async()=>{
 const id='U'+'b'.repeat(32),csv='kind,account_id,customer_id,day,first_at,last_at\ncoverage,1657810104,,,2026-10-01T06:00:00Z,2026-10-01T06:00:00Z\nmessage,1657810104,'+id+',2026-10-02,2026-10-01T18:00:00Z,2026-10-01T19:00:00Z';
 const result=await readDaily(async()=>({ok:true,text:async()=>csv}));assert.equal(result.items.length,1);
 await assert.rejects(readDaily(async()=>({ok:true,text:async()=>csv.replace(/1657810104/g,'other')})));
 const db=store(':memory:');try {db.syncLineSheet([{line_user_id:id,first_seen_at:'2026-09-01T00:00:00Z',last_seen_at:'2026-10-01T00:00:00Z'}]);db.syncLineDaily(result.items);db.syncLineDaily(result.items);const row=db.lineMessageDays(db.inbox('line',core.LINE_ACCOUNT,0)[0]);assert.deepEqual(row.daily_activity,['2026-10-01T19:00:00.000Z']);const mixed=db.lineMessageDays(row,'2026-10-01T06:00:00Z');assert.ok(mixed.legacy_activity.includes('2026-10-01T00:00:00Z'));assert.ok(!mixed.legacy_activity.includes('2026-10-01T19:00:00.000Z'));assert.deepEqual(mixed.daily_activity,row.daily_activity);}finally{db.db.close();}
});
