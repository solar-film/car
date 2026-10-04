const test = require('node:test');
const assert = require('node:assert/strict');
const {read,sheetDate} = require('../lead-data-line-sheet.cjs');
const {store} = require('../lead-data-server.cjs');
const core = require('../lead-data-core.js');
test('LINE sheet reads CAR metadata only and validates account and Thai dates',async()=>{
 const header='first_seen,latest_at,brand,platform,account_id,customer_id\n';
 const record='"30/9/2026, 23:59:00","1/10/2026, 0:01:00",CAR,LINE,1657810104,U'+'a'.repeat(32);
 const rows=await read(async url=>{assert.equal(url.hostname,'docs.google.com');assert.equal(url.searchParams.get('tq'),'select B,C,D,E,F,G where F = 1657810104');return {ok:true,text:async()=>header+record};});
 assert.equal(rows[0].last_seen_at,'2026-09-30T17:01:00.000Z');
 assert.throws(()=>sheetDate('31/2/2026, 8:00:00'));
 await assert.rejects(read(async()=>({ok:true,text:async()=>header+record.replace('1657810104','1654307361')})));
 const d=store(':memory:');try{
 d.syncLineSheet(rows);const c=d.inbox('line',core.LINE_ACCOUNT,0)[0];d.name(c.id,'Name');
 d.saveLead({name:'Name'},'test',{platform:'line',account:core.LINE_ACCOUNT,userId:c.line_user_id});
 d.syncLineSheet(rows);const again=d.inbox('line',core.LINE_ACCOUNT,0);
 assert.equal(again.length,1);assert.equal(again[0].id,c.id);assert.equal(again[0].display_name,'Name');
 assert.equal(d.db.prepare('SELECT count(*) n FROM inbox_events').get().n,0);
 assert.equal(d.rows('leads').length,1);
 }finally{d.db.close();}
});
test('daily LINE observations persist across days and collapse repeated activity within a Thai day',()=>{
 const d=store(':memory:');try {
 const base={line_user_id:'U'+'b'.repeat(32),first_seen_at:'2026-09-29T18:00:00.000Z',last_seen_at:'2026-09-30T18:00:00.000Z'};
 d.syncLineSheet([base]);
 d.syncLineSheet([{...base,last_seen_at:'2026-09-30T20:00:00.000Z'}]);
 d.syncLineSheet([{...base,last_seen_at:'2026-10-01T18:00:00.000Z'}]);
 const row=d.activityDays(d.inbox('line',core.LINE_ACCOUNT,0)[0]);
 assert.deepEqual(row.daily_activity,['2026-10-01T18:00:00.000Z','2026-09-30T20:00:00.000Z','2026-09-29T18:00:00.000Z']);
 }finally{d.db.close();}
});

test('LINE inbox pages share a sheet sync and explicit refresh reads updated data', async () => {
 const {createServer}=require('../lead-data-server.cjs');
 const database=store(':memory:');
 const calls={line:0,daily:0};
 let lastDay=2, fail=false;
 const userId=i=>'U'+i.toString(16).padStart(32,'0');
 const fetchSheet=async url=>{
  const daily=new URL(url).searchParams.get('sheet')==='CAR_Line_Daily';
  calls[daily?'daily':'line']++;
  if(fail) throw new Error('test offline');
  const text=daily
   ? 'kind,account_id,customer_id,day,first_at,last_at\ncoverage,1657810104,,,2026-09-01T00:00:00Z,\n'+Array.from({length:31},(_,i)=>`message,1657810104,${userId(i)},2026-10-0${lastDay},2026-10-0${lastDay}T02:00:00Z,2026-10-0${lastDay}T02:00:00Z`).join('\n')
   : 'first_seen,latest_at,brand,platform,account_id,customer_id\n'+Array.from({length:31},(_,i)=>`"1/10/2026, 09:00:00","${lastDay}/10/2026, 09:00:00",CAR,LINE,1657810104,${userId(i)}`).join('\n');
  return {ok:true,text:async()=>text};
 };
 const server=createServer({host:'127.0.0.1',lineSheetEnabled:true},database,{lineSheetFetch:fetchSheet});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api/lead-data/inbox?platform=line`;
 try {
  const [first,second]=await Promise.all([fetch(base+'&page=0'),fetch(base+'&page=1')]);
  assert.equal(first.status,200); assert.equal(second.status,200);
  assert.equal((await first.json()).contacts.length,30);
  assert.equal((await second.json()).contacts.length,1);
  assert.deepEqual(calls,{line:1,daily:1});
  lastDay=3;
  const refreshed=await (await fetch(base+'&page=0&refresh=1')).json();
  assert.equal(refreshed.contacts[0].last_seen_at,'2026-10-03T02:00:00.000Z');
  await fetch(base+'&page=1');
  assert.deepEqual(calls,{line:2,daily:2});
  fail=true;
  assert.equal((await fetch(base+'&page=0&refresh=1')).status,502);
  fail=false;
  assert.equal((await fetch(base+'&page=0')).status,200);
  assert.deepEqual(calls,{line:4,daily:4});
 } finally { await new Promise(resolve=>server.close(resolve)); database.db.close(); }
});
