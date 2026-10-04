'use strict';
const core = require('./lead-data-core.js');
function sheetDate(value) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})$/.exec(String(value).trim());
    if (!m) throw new Error('รูปแบบวันที่ในชีต LINE ไม่ถูกต้อง');
    const [,d,mo,y,h,mi,s] = m;
    const year = Number(y)>2400 ? Number(y)-543 : Number(y);
    const iso = `${year}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}T${h.padStart(2,'0')}:${mi}:${s}+07:00`;
    const time = Date.parse(iso);
    if (!Number.isFinite(time) || Number(h)>23 || Number(mi)>59 || Number(s)>59 || new Date(time+7*3600000).toISOString().slice(0,10)!==iso.slice(0,10)) throw new Error('วันที่ในชีต LINE ไม่ถูกต้อง');
    return new Date(time).toISOString();
}
async function read(fetchImpl=fetch) {
    const url = new URL('https://docs.google.com/spreadsheets/d/1doIr2kXj0C3HCen7OxNVOsTK95eE45rolbfWtgKYaTg/gviz/tq');
    url.searchParams.set('tqx','out:csv'); url.searchParams.set('sheet','Line');
    url.searchParams.set('tq','select B,C,D,E,F,G where F = 1657810104');
    const response = await fetchImpl(url,{signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('อ่านชีต LINE ไม่สำเร็จ');
    const text = await response.text();
    if (/^\s*</.test(text)) throw new Error('ไม่มีสิทธิ์อ่านชีต LINE');
    return core.csv(text).map(row => {
        if (row.account_id !== '1657810104' || row.platform !== 'LINE' || !/^U[0-9a-f]{32}$/i.test(row.customer_id)) throw new Error('ข้อมูลในชีตไม่ตรงบัญชี LINE CAR');
        return {line_user_id:row.customer_id,first_seen_at:sheetDate(row.first_seen),last_seen_at:sheetDate(row.latest_at)};
    });
}
async function readDaily(fetchImpl=fetch) {
    const url = new URL('https://docs.google.com/spreadsheets/d/1doIr2kXj0C3HCen7OxNVOsTK95eE45rolbfWtgKYaTg/gviz/tq');
    url.searchParams.set('tqx','out:csv'); url.searchParams.set('sheet','CAR_Line_Daily');
    url.searchParams.set('tq','select A,B,C,D,E,F');
    const response = await fetchImpl(url,{signal:AbortSignal.timeout(15000),cache:'no-store'});
    if (!response.ok) throw new Error('อ่านประวัติ LINE รายวันไม่ได้');
    const rows = core.csv(await response.text());
    const coverage = rows.find(row => row.kind === 'coverage' && row.account_id === '1657810104');
    if (!coverage || !Number.isFinite(Date.parse(coverage.first_at))) throw new Error('ยังไม่พบบันทึกประวัติรายวันของ LINE CAR');
    const items = rows.filter(row => row.kind === 'message').map(row => {
        const at = Date.parse(row.last_at), first = Date.parse(row.first_at);
        if (row.account_id !== '1657810104' || !/^U[0-9a-f]{32}$/i.test(row.customer_id)
            || !Number.isFinite(at) || !Number.isFinite(first) || first>at
            || new Date(at+7*3600000).toISOString().slice(0,10)!==row.day
            || new Date(first+7*3600000).toISOString().slice(0,10)!==row.day) throw new Error('ประวัติ LINE รายวันไม่ตรงรูปแบบ CAR');
        return {line_user_id:row.customer_id,first_seen_at:new Date(first).toISOString(),last_seen_at:new Date(at).toISOString()};
    });
    return {startedAt:new Date(coverage.first_at).toISOString(),items};
}
module.exports = {read,readDaily,sheetDate};
