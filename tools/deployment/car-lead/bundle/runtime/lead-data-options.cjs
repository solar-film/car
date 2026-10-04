'use strict';
const {csv} = require('./lead-data-core.js');
const SHEET = '1u__xYWoWZpmrnquc-Fpk19WtpcrckxSd0-_G35NWxXQ';
const SOURCES = [['Car_model','C'],['Car_Brand','B'],['ตำแหน่งกระจก','B'],['film_Brand','B'],['film_series','C'],['รู้จักครั้งแรก','A'],['สถานะการติดตาม','A'],['พนักงานขาย','B']];
async function readOptions(fetcher = fetch) {
    const result = await Promise.all(SOURCES.map(async ([sheet,column]) => {
        const url = `https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}&tq=${encodeURIComponent(column === 'A' ? 'select A' : 'select A,'+column)}`;
        const response = await fetcher(url,{signal:AbortSignal.timeout(20000)});
        if (!response.ok) throw new Error(`อ่านรายการ ${sheet} ไม่สำเร็จ`);
        const text = await response.text();
        if (/^\s*</.test(text)) throw new Error(`ชีต ${sheet} ไม่ได้ส่งข้อมูลตาราง`);
        const values = [...new Set(csv(text,{allowSingleColumn:column === 'A'}).map(row => String(Object.values(row)[column === 'A' ? 0 : 1] || '').trim()).filter(Boolean))];
        if (!values.length) throw new Error(`ไม่พบตัวเลือกใน ${sheet} คอลัมน์ ${column}`);
        return [sheet,values];
    }));
    return Object.fromEntries(result);
}
async function readLeadContacts(fetcher = fetch) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq?tqx=out:csv&sheet=lead&tq=${encodeURIComponent('select C,D,E,F')}&_=${Date.now()}`;
    const response = await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error('ตรวจข้อมูลในชีต lead ไม่สำเร็จ');
    const text = await response.text();
    if (/^\s*</.test(text)) throw new Error('ชีต lead ไม่ได้ส่งข้อมูลตาราง');
    const rows = csv(text);
    if (rows.length && !Object.hasOwn(rows[0],'ชื่อช่องทางติดต่อ')) throw new Error('คอลัมน์ชีต lead เปลี่ยนแปลง');
    return rows.map(row => ({channel:String(row['ช่องทางติดต่อ'] || '').trim(),contact:String(row['ชื่อช่องทางติดต่อ'] || '').trim(),phone:String(row['เบอร์โทร'] || '').trim()}));
}
module.exports = {readOptions,readLeadContacts,SOURCES};
