'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createInboxLoader,inboxActivities,dayKey} = require('../lead-data-core.js');
const query = {platform:'facebook',start:'2026-09-27',end:'2026-10-03'};
const contact = (id,at='2026-10-03T02:00:00Z') => ({id,last_seen_at:at,daily_activity:[at],history_earliest:at,history_complete:true});
const result = (contacts,nextCursor=null,source='facebook-conversations') => ({contacts,nextCursor,source,account:'test-account',configured:true});
function deferred() { let resolve; const promise = new Promise(done => { resolve=done; }); return {promise,resolve}; }

test('the first page is visible before the next page finishes; final rows remain unique', async () => {
    const next = deferred(), firstShown = deferred();
    const seen = [];
    const loader = createInboxLoader(({page}) => page ? next.promise : result([contact('a')],'next'));
    let finished = false;
    const pending = loader.load({...query,onPage:(value,state) => {
        seen.push({ids:value.contacts.map(row=>row.id),complete:state.complete});
        firstShown.resolve();
    }}).then(value => { finished=true; return value; });
    await firstShown.promise;
    assert.equal(finished,false);
    assert.deepEqual(seen,[{ids:['a'],complete:false}]);
    next.resolve(result([contact('a'),contact('b')]));
    assert.deepEqual((await pending).contacts.map(row=>row.id),['a','b']);
    assert.deepEqual(seen.at(-1),{ids:['a','b'],complete:true});
});

test('switching away stops further pagination and cannot repaint the old channel', async () => {
    const oldPage = deferred();
    let current = true, oldRenders=0, oldRequests=0;
    const loader = createInboxLoader(({platform}) => {
        if(platform==='line') { oldRequests++; return oldPage.promise; }
        return result([contact('fb')]);
    });
    const old = loader.load({...query,platform:'line',isCurrent:()=>current,onPage:()=>oldRenders++});
    current=false;
    const fresh=await loader.load(query);
    oldPage.resolve(result(Array.from({length:30},(_,i)=>contact('line-'+i)),null,'line-daily'));
    assert.equal(await old,null);
    assert.equal(oldRequests,1);
    assert.equal(oldRenders,0);
    assert.equal(fresh.contacts[0].id,'fb');
});

test('reopening a channel shares pending pages and reuses recent results; refresh bypasses them', async () => {
    const pending=deferred(), requests=[];
    let time=0;
    const loader=createInboxLoader(value=>{requests.push(value);return pending.promise;},{now:()=>time,ttlMs:60000});
    const first=loader.load(query), second=loader.load(query);
    await Promise.resolve();
    assert.equal(requests.length,1);
    pending.resolve(result([contact('a')]));
    await Promise.all([first,second]);
    await loader.load(query);
    assert.equal(requests.length,1);
    await loader.load({...query,refresh:true});
    assert.equal(requests.length,2);
    assert.equal(requests[1].refresh,true);
    time=60001;
    await loader.load(query);
    assert.equal(requests.length,3);
});

test('channel results are isolated and changing the period reuses pages while extending coverage', async () => {
    const reads=[];
    const loader=createInboxLoader(value=>{
        reads.push(value);
        return value.page ? result([contact('old','2026-09-20T02:00:00Z')]) : result(Array.from({length:30},(_,i)=>contact(String(i),'2026-09-26T02:00:00Z')),'older');
    });
    await loader.load(query);
    assert.equal(reads.length,1);
    await loader.load({...query,start:'2026-09-01'});
    assert.equal(reads.length,2);
    assert.equal(reads[1].page,1);
    await loader.load({...query,platform:'line'});
    assert.equal(reads.length,3);
});

test('a later-page failure leaves progress available without caching it as complete', async () => {
    const renders=[], requests=[];
    let fail=true;
    const loader=createInboxLoader(({page})=>{
        requests.push(page);
        if(!page) return result([contact('first')],'next');
        if(fail) throw new Error('upstream unavailable');
        return result([contact('second')]);
    });
    await assert.rejects(loader.load({...query,onPage:value=>renders.push(value)}),/upstream unavailable/);
    assert.equal(renders[0].contacts[0].id,'first');
    assert.equal(loader.peek(query),null);
    fail=false;
    assert.equal((await loader.load(query)).contacts.length,2);
    assert.deepEqual(requests,[0,1,1]);
});

test('reset discards pending data from the prior connection', async () => {
    const old=deferred();
    let calls=0, renders=0;
    const loader=createInboxLoader(()=>++calls===1 ? old.promise : result([contact('new')]));
    const previous=loader.load({...query,onPage:()=>renders++});
    await Promise.resolve();
    loader.clear();
    await loader.load(query);
    old.resolve(result([contact('old')]));
    assert.equal(await previous,null);
    assert.equal(renders,0);
    assert.equal(loader.peek(query).contacts[0].id,'new');
});

test('a repeated Facebook cursor fails instead of looping or reporting complete statistics', async () => {
    const loader=createInboxLoader(()=>result([contact('a')],'same-cursor'));
    await assert.rejects(loader.load(query),/หน้าถัดไป/);
    assert.equal(loader.peek(query),null);
});

test('progressive daily rows keep Bangkok dates, new/returning status, and legacy activity distinct', () => {
    assert.equal(dayKey('2026-10-02T17:00:00Z'),'2026-10-03');
    const rows=inboxActivities(result([{...contact('a'),history_earliest:'2026-10-01T17:01:00Z',
        daily_activity:['2026-10-02T18:00:00Z','2026-10-01T18:00:00Z'],legacy_activity:['2026-09-30T12:00:00Z']}])) ;
    assert.deepEqual(rows.map(row=>[dayKey(row.last_seen_at),row.customer_type,row.legacy]),[
        ['2026-10-03','existing',false],['2026-10-02','new',false],['2026-09-30','new',true]
    ]);
    const incomplete=inboxActivities(result([{...contact('unknown'),history_complete:false,history_earliest:null}]));
    assert.equal(incomplete[0].customer_type,'');
});

test('a failed saved-contact refresh does not leave collection enabled with unverified status', async () => {
    const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
    const source=fs.readFileSync(path.join(__dirname,'../lead-data-app.js'),'utf8');
    const start=source.indexOf('    async function checkSheetContacts(');
    const end=source.indexOf('    function existsInLeadSheet(',start);
    const existing=[{channel:'Line',contact:'Already saved'}];
    let rendered=0;
    const context=vm.createContext({session:{id:'test'},service:'http://test',savedLeadRevision:0,
        sheetContacts:existing,sheetChecked:true,renderInbox:()=>rendered++,
        sheetContactCache:{clear(){},get:async()=>{throw new Error('sheet unavailable');}}});
    vm.runInContext(source.slice(start,end),context);
    await assert.rejects(context.checkSheetContacts({refresh:true}),/sheet unavailable/);
    assert.equal(context.sheetChecked,false);
    assert.equal(context.sheetContacts,existing);
    assert.equal(rendered,1);
});
