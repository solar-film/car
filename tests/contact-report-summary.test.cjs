'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {summarize} = require('../contact-report-summary.js');
const lead = (date,channel,status='') => ({status,sheetData:{date,channel}});
test('daily counts include every report row regardless of status and preserve all channels',()=>{
    const rows = summarize([lead('2026-10-01','Line','ปิดการขายสำเร็จ'),lead('2026-10-01','LINE OA'),lead('2026-10-01','FB'),lead('2026-10-01','Tel'),lead('2026-10-01','Tiktok'),lead('2026-10-01','WalkIn'),lead('2026-10-01','Email'),lead('2026-10-01','Other'),lead('2026-09-30','Facebook')]);
    assert.equal(rows.length,2);
    assert.equal(rows[0].dateRaw,'2026-10-01');
    assert.equal(rows[0].monthKey,'2026-10');
    assert.deepEqual(['phone','line','fb','tiktok','walkin','other','total'].map(key=>rows[0][key]),[1,2,1,1,1,2,8]);
    assert.equal(rows[1].total,1);
});
test('missing or invalid report dates fail instead of producing incomplete totals',()=>{
    assert.throws(()=>summarize([lead('','Line')]));
    assert.throws(()=>summarize([lead('2026-02-30','Line')]));
    assert.deepEqual(summarize([]),[]);
});

test('legacy daily totals take priority without adding overlapping report totals',()=>{
    const {mergeDailyRows}=require('../contact-report-summary.js');
    const report=summarize([lead('2026-10-01','Line'),lead('2026-09-30','Line')]);
    const legacy=[{date:new Date(2026,8,30,12),monthKey:'2026-09',phone:3,line:8,fb:2},{date:new Date(2026,8,30,12),monthKey:'2026-09',phone:1,line:0,fb:0}];
    const merged=mergeDailyRows(report,legacy);
    assert.equal(merged.length,2);
    assert.equal(merged[0].total,1);
    assert.equal(merged[0].source,'report');
    assert.equal(merged[1].total,14);
    assert.equal(merged[1].line,8);
    assert.equal(merged[1].source,'legacy');
    assert.equal(mergeDailyRows(report,[{...legacy[0],phone:0,line:0,fb:0}])[1].total,0);
});
