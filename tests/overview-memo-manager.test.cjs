'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createService, dateInput } = require('../overview-memo-manager.js');

const row = (recordId, title = recordId, active = true) => ({ recordId, title, active, date: new Date(2026, 9, 2) });
const draft = { title:'New notice', date:'2026-10-02', active:false };

function fixture(options = {}) {
    let records = [row('A'),row('B','Hidden',false)];
    const requests = [];
    let reads = 0;
    const service = createService({
        pause:async()=>{},
        load:async()=> { reads++; return options.load ? options.load(records,reads) : structuredClone(records); },
        post:async payload => {
            requests.push(payload);
            if (options.post) return options.post(payload);
            if (payload.action === 'deleteMemo') records = records.filter(item=>item.recordId !== payload.memoId);
            else {
                const next = {recordId:payload.memoId || 'NEW',title:payload.title,active:payload.active,date:new Date(`${payload.date}T00:00:00`)};
                records = payload.memoId ? records.map(item=>item.recordId === payload.memoId ? next : item) : [...records,next];
            }
            if (options.lostResponse) throw new Error('network response lost');
            return {success:true,id:payload.memoId || 'NEW'};
        }
    });
    return { service, requests, getRecords:()=>structuredClone(records), replace:value=> {records=value;} };
}

test('create persists a hidden memo and verifies it without changing existing rows',async()=>{
    const f=fixture(), before=f.getRecords();
    const records=await f.service.mutate(draft);
    assert.deepEqual(records.slice(0,2),before);
    assert.equal(records[2].title,'New notice');
    assert.equal(records[2].active,false);
    assert.deepEqual(f.requests,[{action:'upsertMemo',sheetName:'memo',...draft}]);
    assert.equal(f.service.pending,false);
});

test('editing and toggling address a stable ID, never a sheet row number',async()=>{
    const f=fixture(), before=f.getRecords();
    const records=await f.service.mutate({item:before[0],...draft});
    assert.equal(records[0].recordId,'A');
    assert.equal(records[0].title,draft.title);
    assert.deepEqual(records[1],before[1]);
    assert.equal(f.requests[0].memoId,'A');
    assert.equal('memoRowNumber' in f.requests[0],false);
});

test('delete removes exactly the confirmed ID and rereads the result',async()=>{
    const f=fixture(), before=f.getRecords();
    const result=await f.service.mutate({item:before[1],remove:true});
    assert.deepEqual(result,[before[0]]);
    assert.deepEqual(f.requests,[{action:'deleteMemo',sheetName:'memo',memoId:'B'}]);
});

test('stale edits, deleted targets and duplicate IDs never issue a write',async()=>{
    for (const changed of [[row('A','Changed elsewhere'),row('B')],[row('B')],[row('A'),row('A')]]) {
        const f=fixture();
        const original=f.getRecords()[0];
        f.replace(changed);
        await assert.rejects(f.service.mutate({item:original,...draft}),/แก้ไขหรือลบแล้ว|รหัสแจ้งเตือน/);
        assert.equal(f.requests.length,0);
    }
});

test('invalid dates, empty text and oversized notices fail before POST',async()=>{
    for (const bad of [{date:'2026-02-31'},{date:''},{title:'  '},{title:'x'.repeat(5001)}]) {
        const f=fixture();
        await assert.rejects(f.service.mutate({...draft,...bad}),/กรุณาระบุ/);
        assert.equal(f.requests.length,0);
    }
    assert.equal(dateInput(new Date('invalid')),'');
});

test('a lost POST response is recovered by rereading, without duplicate creation',async()=>{
    const f=fixture({lostResponse:true});
    const records=await f.service.mutate(draft);
    assert.equal(records.length,3);
    assert.equal(f.requests.length,1);
    assert.equal(f.service.pending,false);
});

test('a false success is blocked until a later read confirms persistence',async()=>{
    const f=fixture({post:async()=>({success:true,id:'NEW'})});
    await assert.rejects(f.service.mutate(draft),error=>error.uncertain === true);
    assert.equal(f.service.pending,true);
    await assert.rejects(f.service.mutate(draft),/ก่อนหน้า/);
    assert.equal(f.requests.length,1);
    f.replace([...f.getRecords(),row('NEW',draft.title,false)]);
    assert.equal((await f.service.verifyPending()).length,3);
    assert.equal(f.requests.length,1);
    assert.equal(f.service.pending,false);
});

test('a failed read cannot make a delete appear successful',async()=>{
    const f=fixture({load:(records,reads)=> {if(reads>1)throw new Error('offline');return structuredClone(records);}});
    await assert.rejects(f.service.mutate({item:f.getRecords()[0],remove:true}),error=>error.uncertain === true);
    assert.equal(f.service.pending,true);
    assert.equal(f.requests.length,1);
});

test('explicit API rejection and token cancellation remain errors, not a pending write',async()=>{
    for (const post of [async()=>({success:false,error:'Write Token rejected'}),async()=>{throw Object.assign(new Error('cancelled'),{notSent:true});}]) {
        const f=fixture({post});
        await assert.rejects(f.service.mutate(draft),/Token|cancelled/);
        assert.equal(f.service.pending,false);
        assert.equal(f.getRecords().length,2);
    }
});

test('simultaneous saves cannot produce two requests',async()=>{
    let release;
    const f=fixture({post:()=>new Promise(resolve=>{release=resolve;})});
    const first=f.service.mutate(draft);
    await Promise.resolve();
    await assert.rejects(f.service.mutate(draft),/ก่อนหน้า/);
    release({success:false,error:'stopped'});
    await assert.rejects(first,/stopped/);
    assert.equal(f.requests.length,1);
});

test('page provides labelled management controls and keeps the existing write endpoint',()=>{
    const html=fs.readFileSync(require.resolve('../overview.html'),'utf8');
    const moduleText=fs.readFileSync(require.resolve('../overview-memo-manager.js'),'utf8');
    const booking=fs.readFileSync(require.resolve('../index.html'),'utf8');
    const endpoint=booking.match(/const SCRIPT_URL = '([^']+)'/)[1];
    assert.ok(moduleText.includes(endpoint));
    for(const id of ['memoAdd','memoSearch','memoEditor','memoDate','memoText','memoActive','memoDeleteConfirm','memoVerify','overviewMemoManage','memoTokenForm','memoToken']) assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
    assert.match(moduleText,/escape\(item\.title\)/);
    assert.doesNotMatch(moduleText,/mode:\s*['"]no-cors/);
    assert.doesNotMatch(moduleText,/localStorage\.setItem/);
    assert.doesNotMatch(moduleText,/window\.prompt/);
    assert.match(html,/id="memoToken" type="password"/);
});
