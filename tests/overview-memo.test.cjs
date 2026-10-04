'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function page() {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) {
            const classes = new Set();
            elements.set(id, {value:'', textContent:'', innerHTML:'', style:{}, open:false, isConnected:true, listeners:{},
                addEventListener(type, listener) { this.listeners[type] = listener; },
                showModal() { this.open = true; },
                close() { this.open = false; this.listeners.close?.(); },
                focus() { context.document.activeElement = this; },
                classList:{
                add: name => classes.add(name), remove: name => classes.delete(name),
                contains: name => classes.has(name), toggle: (name, force) => force ? classes.add(name) : classes.delete(name)
            }});
        }
        return elements.get(id);
    };
    const requests = [];
    let response = {ok:true, text:async()=> 'Memo_ID,วันที่,สถานะงาน,รายละเอียด\nm1,1/6/69,ON,Promotion'};
    const context = vm.createContext({
        Date, URL, AbortSignal, console:{warn(){},error(){}},
        document:{getElementById:element,addEventListener(){},body:element('body')},
        Papa:{parse(text, options) {
            const [headers, ...rows] = text.trim().split('\n').map(row => row.split(','));
            options.complete({data: rows.map(row => Object.fromEntries(headers.map((key,i)=>[key,row[i]]))),meta:{fields:headers}});
        }},
        fetch:async (url,options)=> {requests.push({url,options}); return response;}
    });
    context.window = context;
    const html = fs.readFileSync(path.join(__dirname,'../overview.html'),'utf8');
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (!/\bsrc=/.test(script[1])) vm.runInContext(script[2],context);
    }
    const run = code => vm.runInContext(code,context);
    run('cacheDom()');
    return {element,requests,run,setResponse:value=> {response=value;}};
}

test('active memo rules match the booking page, including legacy blank status and Thai dates',()=>{
    const p = page();
    const rows = [
        {Memo_ID:'1',วันที่:'20/8/69',สถานะงาน:'ON',รายละเอียด:'Third'},
        {Memo_ID:'2',วันที่:'1/6/2569',สถานะงาน:'',รายละเอียด:'First'},
        {Memo_ID:'3',วันที่:'2026-07-30',สถานะงาน:'เปิดใช้งาน',รายละเอียด:'Second'},
        {Memo_ID:'4',วันที่:'1/1/69',สถานะงาน:'OFF',รายละเอียด:'Hidden'},
        {Memo_ID:'5',วันที่:'',สถานะงาน:'true',รายละเอียด:'Undated'},
        {Memo_ID:'',วันที่:'',สถานะงาน:'',รายละเอียด:''}
    ];
    const result = p.run(`buildOverviewMemos(${JSON.stringify(rows)})`);
    assert.deepEqual(Array.from(result, row=>row.title),['Third','Second','First','Undated']);
    assert.equal(result[0].date.getFullYear(),2026);
    assert.equal(p.run("parseOverviewMemoDate('31/2/2569')"),null);
});

test('manager retains hidden notices and their stable IDs independently of the dashboard preview', async()=>{
    const p = page();
    p.setResponse({ok:true,text:async()=> 'ID,วันที่บันทึกรายการ,หัวข้อ,รายละเอียด,วันที่แจ้งเตือน,สถานะงาน\nA,1/1/69,แจ้งเตือน,Visible,1/6/69,on\nB,1/1/69,แจ้งเตือน,Hidden,2/6/69,off'});
    await p.run('fetchOverviewMemos()');
    assert.deepEqual(Array.from(p.run('overviewMemoRecords'),item=>item.recordId),['B','A']);
    assert.equal(p.run('overviewMemos.length'),1);
    assert.equal(p.run('overviewMemoRecords[0].active'),false);
    assert.match(p.element('overviewMemoViewDetails').innerHTML,/Visible/);
    assert.doesNotMatch(p.element('overviewMemoViewDetails').innerHTML,/Hidden/);
});

test('malformed memo headers are rejected before management receives any rows',async()=>{
    const p = page();
    p.setResponse({ok:true,text:async()=> 'Wrong,Sheet\nNot,a memo'});
    await assert.rejects(p.run('loadOverviewMemoRecords()'),/โครงสร้างชีต/);
});

test('preview has five entries, full details preserve escaped text, and notices ignore month filter',()=>{
    const p = page();
    const title = '<img src=x onerror=alert(1)> & message\nFull details';
    const rows = Array.from({length:7},(_,i)=>({วันที่:'1/6/69',รายละเอียด:title+i}));
    p.run(`overviewMemos=buildOverviewMemos(${JSON.stringify(rows)}); memoLoaded=true; renderOverviewMemos()`);
    assert.equal((p.element('overviewMemoList').innerHTML.match(/<li>/g)||[]).length,5);
    assert.equal((p.element('overviewMemoViewDetails').innerHTML.match(/<li>/g)||[]).length,7);
    assert.equal(p.element('overviewMemoBadge').textContent,'7');
    assert.match(p.element('overviewMemoMore').innerHTML,/อีก 2 รายการ/);
    assert.match(p.element('overviewMemoViewDetails').innerHTML,/&lt;img src=x onerror=alert\(1\)&gt; &amp;/);
    assert.match(p.element('overviewMemoViewDetails').innerHTML,/message\nFull details6/);
    assert.doesNotMatch(p.element('overviewMemoList').innerHTML,/<img/);
    p.element('monthFilter').value='2026-10';
    p.run('renderDashboard()');
    assert.equal(p.element('overviewMemoCount').textContent,'7 รายการ');
});

test('view all and notice previews open a read-only dialog and return focus without requests',()=>{
    const p = page();
    p.run('fetchOverviewData = () => {}; initApp()');
    p.element('overviewMemoViewDetails').scrollTop = 200;
    p.element('overviewMemoMore').focus();
    p.element('overviewMemoMore').listeners.click();
    assert.equal(p.element('overviewMemoViewDialog').open,true);
    assert.equal(p.element('overviewMemoViewDetails').scrollTop,0);
    assert.equal(p.element('overviewMemoDialog').open,false);
    assert.equal(p.element('body').classList.contains('overview-memo-open'),true);
    p.element('overviewMemoViewClose').listeners.click();
    assert.equal(p.element('overviewMemoViewDialog').open,false);
    assert.equal(p.run('document.activeElement === dom.overviewMemoMore'),true);
    assert.equal(p.element('body').classList.contains('overview-memo-open'),false);
    p.element('overviewMemoList').listeners.click({target:{closest:()=>true}});
    assert.equal(p.element('overviewMemoViewDialog').open,true);
    assert.equal(p.element('overviewMemoDialog').open,false);
    assert.equal(p.requests.length,0);
});

test('reader has only a close button, readable full text, and management remains a separate entry',()=>{
    const html = fs.readFileSync(path.join(__dirname,'../overview.html'),'utf8');
    const css = fs.readFileSync(path.join(__dirname,'../overview-ui.css'),'utf8');
    const reader = html.match(/<dialog id="overviewMemoViewDialog"[\s\S]*?<\/dialog>/)[0];
    assert.equal((reader.match(/<button\b/g)||[]).length,1);
    assert.match(reader,/id="overviewMemoViewClose"/);
    assert.doesNotMatch(reader,/<(?:form|input|textarea)\b|memoAdd|data-memo-toggle|data-memo-edit|data-memo-delete/);
    assert.match(html,/<button id="overviewMemoManage"[^>]+onclick="openOverviewMemoDialog\(\)"/);
    assert.match(html,/<button id="overviewMemoBell"[^>]+onclick="openOverviewMemoViewDialog\(\)"/);
    assert.match(css,/\.overview-memo-reader \.overview-memo-detail-text\s*\{[^}]*font-size:\s*14px/);
    assert.match(css,/\.overview-memo-detail-text\s*\{[^}]*white-space:\s*pre-wrap/);
});

test('reader separates compact notices and scrolls the list without covering it with the header',()=>{
    const css = fs.readFileSync(path.join(__dirname,'../overview-ui.css'),'utf8');
    assert.match(css,/\.overview-memo-reader\[open\]\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column/);
    assert.match(css,/\.overview-memo-reader > \.overview-memo-header\s*\{[^}]*position:\s*relative;[^}]*flex-shrink:\s*0/);
    assert.match(css,/\.overview-memo-reader \.overview-memo-details\s*\{[^}]*gap:\s*8px;[^}]*overflow:\s*auto/);
    assert.match(css,/\.overview-memo-reader \.overview-memo-details li\s*\{[^}]*grid-template-columns:\s*32px minmax\(0, 1fr\);[^}]*border:\s*1px solid[^}]*border-radius:\s*8px/);
    assert.match(css,/@media \(max-width: 640px\)[\s\S]*\.overview-memo-reader \.overview-memo-details li\s*\{[^}]*grid-template-columns:\s*26px minmax\(0, 1fr\)/);
});

test('reader dates retain full accessible dates, local ISO dates, and escaped missing-date labels',()=>{
    const p = page();
    const rendered = p.run("renderOverviewMemoDate({date: parseOverviewMemoDate('1/6/2569')})");
    assert.match(rendered, /<time[^>]+datetime="2026-06-01"[^>]+aria-label="1 มิถุนายน 2569"/);
    assert.match(rendered, /ph-calendar-blank/);
    assert.match(rendered, /1 มิ\.ย\. 2569/);
    assert.match(p.run("renderOverviewMemoDate({date: null, dateText: '<unknown>'})"), /&lt;unknown&gt;/);
    assert.match(p.run("renderOverviewMemoDate({date: null})"), /ไม่ระบุวันที่/);
});

test('both preview and reader show newest dates first, including ties and undated notices',()=>{
    const p = page();
    const rows = [
        {วันที่:'',รายละเอียด:'Undated'},
        {วันที่:'1/6/2569',รายละเอียด:'Old notice'},
        {วันที่:'2/9/2569',รายละเอียด:'Latest date'},
        {วันที่:'2/9/2569',รายละเอียด:'Latest same-day entry'}
    ];
    p.run(`overviewMemos=buildOverviewMemos(${JSON.stringify(rows)}); memoLoaded=true; renderOverviewMemos()`);
    const expected = ['Latest same-day entry', 'Latest date', 'Old notice', 'Undated'];
    assert.deepEqual(Array.from(p.run('overviewMemos'),item=>item.title),expected);
    for (const id of ['overviewMemoList','overviewMemoViewDetails']) {
        const positions = expected.map(text=>p.element(id).innerHTML.indexOf(text));
        assert.ok(positions.every((position,index)=>position>=0 && (!index || position>positions[index-1])));
    }
    assert.equal((p.element('overviewMemoViewDetails').innerHTML.match(/ph-megaphone/g)||[]).length,4);
    assert.equal((p.element('overviewMemoViewDetails').innerHTML.match(/ph-calendar-blank/g)||[]).length,4);
});

test('memo loading is read-only, uncached and refresh failure retains the last good notices',async()=>{
    const p = page();
    await p.run('fetchOverviewMemos()');
    assert.equal(new URL(p.requests[0].url).searchParams.get('sheet'),'memo');
    assert.equal(p.requests[0].options.cache,'no-store');
    assert.equal(p.requests[0].options.method,undefined);
    assert.equal(p.element('overviewMemoCount').textContent,'1 รายการ');
    p.setResponse({ok:false,status:503});
    await p.run('fetchOverviewMemos()');
    assert.equal(p.element('overviewMemoCount').textContent,'1 รายการ');
    assert.match(p.element('overviewMemoStatus').textContent,/อัปเดตแจ้งเตือนไม่สำเร็จ/);
    assert.equal(p.element('overviewMemoRetry').hidden,false);
    assert.match(p.element('overviewMemoList').innerHTML,/Promotion/);
});

test('initial failure is not presented as zero alerts, and empty success is explicit',async()=>{
    const p = page();
    p.setResponse({ok:true,text:async()=>'<html>Access denied</html>'});
    await p.run('fetchOverviewMemos()');
    assert.equal(p.element('overviewMemoCount').textContent,'ยังไม่พร้อม');
    assert.match(p.element('overviewMemoStatus').textContent,/โหลดแจ้งเตือนไม่สำเร็จ/);
    assert.equal(p.element('overviewMemoMore').hidden,true);
    p.setResponse({ok:true,text:async()=> 'Memo_ID,วันที่,สถานะงาน,รายละเอียด\n'});
    await p.run('fetchOverviewMemos()');
    assert.equal(p.element('overviewMemoCount').textContent,'0 รายการ');
    assert.match(p.element('overviewMemoStatus').textContent,/ไม่มีรายการแจ้งเตือนที่เปิดใช้งาน/);
    assert.equal(p.element('overviewMemoRetry').hidden,true);
});

test('a stale memo response cannot replace a newer refresh',async()=>{
    const p = page();
    let resolveOld;
    p.setResponse({ok:true,text:()=>new Promise(resolve=>{resolveOld=resolve;})});
    const oldRequest = p.run('fetchOverviewMemos()');
    await Promise.resolve();
    p.setResponse({ok:true,text:async()=> 'Memo_ID,วันที่,สถานะงาน,รายละเอียด\nm2,2/10/69,ON,Latest'});
    await p.run('fetchOverviewMemos()');
    resolveOld('Memo_ID,วันที่,สถานะงาน,รายละเอียด\nm1,1/6/69,ON,Outdated');
    await oldRequest;
    assert.match(p.element('overviewMemoList').innerHTML,/Latest/);
    assert.doesNotMatch(p.element('overviewMemoList').innerHTML,/Outdated/);
});
