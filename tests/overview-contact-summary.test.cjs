'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function overview({zeroLegacy = false, failedSheet = ''} = {}) {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) {
            const classes = new Set();
            elements.set(id, {value:'', innerText:'', innerHTML:'', style:{}, classList:{
                add: name => classes.add(name), remove: name => classes.delete(name),
                contains: name => classes.has(name), toggle: (name, force) => force ? classes.add(name) : classes.delete(name)
            }});
        }
        return elements.get(id);
    };
    const requests = [];
    const leads = [['2026-09-30','FB'],['2026-10-01','Line'],['2026-10-01','Line'],['2026-10-01','Tel'],['2026-10-01','FB'],['2026-10-01','Email'],['2026-10-02','LINE OA'],['2026-10-02','Email']];
    const context = vm.createContext({
        Date, URL, AbortSignal, console:{warn(){},error(){}},
        document:{getElementById:element,addEventListener(){}},
        Papa:{parse(text,options) {
            const rows = text.trim().split('\n').map(row=>row.split(','));
            options.complete({data:options.header ? rows.slice(1).map(row=>Object.fromEntries(rows[0].map((name,i)=>[name,row[i]]))) : rows});
        }},
        fetch:async url => {
            const sheet = new URL(url).searchParams.get('sheet');
            requests.push(sheet);
            if (sheet === failedSheet) return {ok:false,status:503};
            const legacyCounts = zeroLegacy ? '0,0,0,0,0' : '1,4,2,0,1';
            const data = {
                Bookings:'JobID,CustID,วันที่ติดตั้ง,Status\n',
                'เป้ายอดขาย':'เดือน,เป้ายอดขาย\n',
                memo:'Memo_ID,วันที่,สถานะงาน,รายละเอียด\n',
                'สถิตการติดต่อ':'วันที่,โทร,Line,FB,Tiktok,WalkIn\n30/9/2569,3,7,0,0,0\n1/10/2569,'+legacyCounts,
                lead:'google.visualization.Query.setResponse('+JSON.stringify({status:'ok',table:{
                    cols:[{label:'วันที่'},{label:'ช่องทางติดต่อ'}],
                    rows:leads.map(([date,channel])=>({c:[{v:date},{v:channel}]}))
                }})+');'
            };
            assert.ok(Object.hasOwn(data,sheet),'unexpected sheet '+sheet);
            return {ok:true,text:async()=>data[sheet]};
        }
    });
    context.window = context;
    const html = fs.readFileSync(path.join(__dirname,'../overview.html'),'utf8');
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (!/\bsrc=/.test(script[1])) vm.runInContext(script[2],context);
    }
    vm.runInContext('cacheDom()',context);
    element('monthFilter').value = '2026-10';
    return {element,requests,run:code=>vm.runInContext(code,context)};
}

test('overview merges legacy days with lead-only days for totals, channels and selected month',async()=>{
    const page=overview();
    await page.run('fetchOverviewData()');
    assert.equal(page.element('errorMessage').classList.contains('hidden'),true);
    assert.equal(page.element('kpiContacts').innerText,'10');
    assert.equal(page.run('contacts.reduce((n,row)=>n+row.count,0)'),20);
    assert.equal(page.run('contactStatsRows.length'),3);
    assert.match(page.element('contactChannels').innerHTML,/อื่น ๆ/);
    assert.match(page.element('salesSummaryContactChannels').innerHTML,/อื่น ๆ/);
    assert.equal(page.requests.includes('PayIn'),false);
    assert.ok(page.requests.includes('lead'));
    assert.ok(page.requests.includes('สถิตการติดต่อ'));
    page.element('monthFilter').value='2026-09';
    page.run('renderDashboard()');
    assert.equal(page.element('kpiContacts').innerText,'10');
});

test('explicit zero legacy counts override overlapping leads',async()=>{
    const page=overview({zeroLegacy:true});
    await page.run('fetchOverviewData()');
    assert.equal(page.element('kpiContacts').innerText,'2');
});

test('a memo failure does not prevent the business dashboard from loading',async()=>{
    const page=overview({failedSheet:'memo'});
    await page.run('fetchOverviewData()');
    assert.equal(page.element('errorMessage').classList.contains('hidden'),true);
    assert.equal(page.element('dashboardContent').classList.contains('hidden'),false);
    assert.equal(page.element('kpiContacts').innerText,'10');
    assert.match(page.element('overviewMemoStatus').textContent,/โหลดแจ้งเตือนไม่สำเร็จ/);
});

for (const failedSheet of ['lead','สถิตการติดต่อ']) {
    test('overview shows a loading error instead of partial totals when '+failedSheet+' fails',async()=>{
        const page=overview({failedSheet});
        await page.run('fetchOverviewData()');
        assert.equal(page.element('errorMessage').classList.contains('hidden'),false);
        assert.equal(page.element('dashboardContent').classList.contains('hidden'),true);
        assert.equal(page.element('kpiContacts').innerText,'');
    });
}
