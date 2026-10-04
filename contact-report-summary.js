(function(root) {
    'use strict';
    function fromGoogleTable(table) {
        if (!table || !Array.isArray(table.cols) || !Array.isArray(table.rows)) throw new Error('ชีต lead ไม่ได้ส่งข้อมูลตาราง');
        const dateIndex = table.cols.findIndex(col => col.label === 'วันที่');
        const channelIndex = table.cols.findIndex(col => col.label === 'ช่องทางติดต่อ');
        if (dateIndex < 0 || channelIndex < 0) throw new Error('หัวคอลัมน์ชีต lead ไม่ตรงกับรายงานข้อมูลการติดต่อ');
        return table.rows.filter(row => row.c.some(cell => cell && String(cell.v ?? cell.f ?? '').trim())).map(row => {
            const cell = row.c[dateIndex];
            const value = String(cell?.v ?? '');
            let date = '';
            const encoded = /^Date\((\d+),(\d+),(\d+)(?:,.*)?\)$/.exec(value);
            if (encoded) date = encoded[1] + '-' + String(Number(encoded[2])+1).padStart(2,'0') + '-' + encoded[3].padStart(2,'0');
            else {
                const raw = String(cell?.f ?? value).split(',')[0].trim().split(' ')[0];
                if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) date = raw;
                else {
                    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(raw);
                    if (match) {
                        let year = Number(match[3]);
                        if (year < 100) year = year >= 40 ? 2500+year-543 : 2000+year;
                        else if (year > 2400) year -= 543;
                        date = year + '-' + match[2].padStart(2,'0') + '-' + match[1].padStart(2,'0');
                    }
                }
            }
            return {sheetData:{date,channel:String(row.c[channelIndex]?.f ?? row.c[channelIndex]?.v ?? '')}};
        });
    }
    function mergeDailyRows(reportRows, legacyRows) {
        const channels = ['phone','line','fb','tiktok','walkin','other'];
        const keyOf = row => row.dateRaw?.match(/^\d{4}-\d{2}-\d{2}$/) ? row.dateRaw : row.date ? row.date.getFullYear()+'-'+String(row.date.getMonth()+1).padStart(2,'0')+'-'+String(row.date.getDate()).padStart(2,'0') : '';
        const days = new Map(reportRows.map(row => [keyOf(row),{...row,source:'report'}]));
        const legacyDays = new Map();
        for (const row of legacyRows) {
            const key = keyOf(row);
            if (!key) continue;
            if (!legacyDays.has(key)) legacyDays.set(key,{...row,other:0,total:0,source:'legacy',...Object.fromEntries(channels.map(channel=>[channel,0]))});
            const daily = legacyDays.get(key);
            for (const channel of channels) daily[channel] += Number(row[channel]) || 0;
            daily.total = channels.reduce((total,channel)=>total+daily[channel],0);
        }
        for (const [key,row] of legacyDays) days.set(key,row);
        return [...days.values()].filter(row=>row.date).sort((a,b)=>b.date-a.date);
    }
    function summarize(leads) {
        const groups = new Map();
        const aliases = {tel:'phone',phone:'phone','โทร':'phone',line:'line',lineoa:'line',fb:'fb',facebook:'fb',tiktok:'tiktok',walkin:'walkin'};
        for (const lead of leads) {
            const data = lead.sheetData || {};
            const raw = String(data.date || '').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error('รายงานข้อมูลการติดต่อมีรายการที่ไม่ระบุวันที่หรือวันที่ไม่ถูกต้อง');
            const date = new Date(raw + 'T12:00:00');
            if (!Number.isFinite(date.getTime()) || date.getFullYear() !== Number(raw.slice(0,4)) || date.getMonth()+1 !== Number(raw.slice(5,7)) || date.getDate() !== Number(raw.slice(8,10))) throw new Error('วันที่ในรายงานข้อมูลการติดต่อไม่ถูกต้อง');
            if (!groups.has(raw)) groups.set(raw,{date,dateRaw:raw,monthKey:raw.slice(0,7),phone:0,line:0,fb:0,tiktok:0,walkin:0,other:0,total:0});
            const row = groups.get(raw);
            const channel = String(data.channel || '').trim().toLowerCase().replace(/[\s._/-]+/g,'');
            row[aliases[channel] || 'other']++;
            row.total++;
        }
        return [...groups.values()].sort((a,b)=>b.date-a.date);
    }
    if (typeof module === 'object' && module.exports) module.exports = {summarize,fromGoogleTable,mergeDailyRows};
    else root.CarContactReportSummary = {summarize,fromGoogleTable,mergeDailyRows};
})(typeof window !== 'undefined' ? window : globalThis);
