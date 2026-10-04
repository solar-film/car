/* Write only to the existing CAR lead worksheet through its authenticated API. */
window.CarLeadSheet = (() => {
    const url = 'https://script.google.com/macros/s/AKfycbwH0Vw5qzVO3YDsibqi_EF8KScpL5e0-wp8mYXxgqSj_3wjqH8QG5CyFOse4-Q18o3Rgg/exec';
    const fields = [
        ['date','วันที่','date'], ['admin','Admin'],
        ['channel','ช่องทางติดต่อ','text',['Line','FB','IG','Tel','WalkIn','Email','Tiktok','Other']],
        ['contact','ชื่อช่องทางติดต่อ'], ['name','ชื่อลูกค้า'], ['phone','เบอร์โทร'], ['carBrand','ยี่ห้อรถยนต์'],
        ['carModel','รุ่นรถยนต์'], ['positions','ตำแหน่งติดตั้ง * (เลือกได้หลายตำแหน่ง)'],
        ['filmBrand','ยี่ห้อที่สนใจ'], ['filmModel','รุ่นที่สนใจ'], ['budget','งบประมาณ'],
        ['customerType','ประเภทลูกค้า','text',['ลค.ใหม่','ลค.เก่า','ลค.เคลม','ลค.แก้']], ['knownFrom','รู้จักเราจาก'],
        ['followUp','สถานะการติดตาม'], ['note','*หมายเหตุ','textarea']
    ];
    let sessionToken = '';
    let ignoreStoredToken = false;
    async function save(key, values, previous = null) {
        if (!String(values.knownFrom || '').trim()) throw new Error('กรุณาเลือกว่ารู้จักเราจากช่องทางใดก่อนบันทึก');
        let token = sessionToken;
        try { if (!ignoreStoredToken) token ||= localStorage.getItem('carCrmWriteToken') || ''; } catch {}
        if (!token) token = (window.prompt('กรุณาใส่ Write Token ของ CAR CRM เพื่อบันทึกลงชีต lead') || '').trim();
        if (!token) throw new Error('ยังไม่ได้ระบุ Write Token จึงยังไม่บันทึกข้อมูล');
        const data = Object.fromEntries(fields.map(([name,label]) => [label,String(values[name] || '')]));
        const parsed = splitHistory(values.note);
        data['*หมายเหตุ'] = parsed.note;
        data.contactHistory = values.contactHistory || parsed.history;
        let response;
        try {
            response = await fetch(url, {method:'POST',body:JSON.stringify({action:previous ? 'updateLeadSheet' : 'upsertLead',sheetName:'lead',leadKey:key,data,previous:previous ? Object.fromEntries(fields.map(([name,label]) => [label,String(previous[name] ?? '')])) : undefined,token}),signal:AbortSignal.timeout(60000)});
        } catch {
            throw new Error('ยังยืนยันการบันทึกลงชีต lead ไม่ได้ กรุณาลองบันทึกซ้ำ ระบบใช้รหัสเดิมเพื่อป้องกันแถวซ้ำ');
        }
        let result;
        try { result = await response.json(); } catch { throw new Error('Apps Script ไม่ได้ส่งผลบันทึกที่ตรวจสอบได้'); }
        if (!response.ok || !result.success || result.sheetName !== 'lead' || result.verified !== true || result.leadKey !== key) {
            if (/write token/i.test(result.error || '')) { sessionToken = ''; ignoreStoredToken = true; try { localStorage.removeItem('carCrmWriteToken'); } catch {} }
            throw new Error(result.error || 'ยังไม่ได้ยืนยันการบันทึกลงชีต lead กรุณาตรวจเวอร์ชัน Apps Script');
        }
        if (data.contactHistory.length && result.historyVerified !== true) {
            throw new Error('บันทึกลีดแล้ว แต่ยังยืนยันชีตประวัติการติดต่อไม่ได้ กรุณาลองบันทึกซ้ำ');
        }
        sessionToken = token;
        try { localStorage.setItem('carCrmWriteToken', token); ignoreStoredToken = false; } catch {} 
        return result;
    }
    const historyMarker = '\n\n[CAR_CONTACT_HISTORY_V1]\n';
    function splitHistory(value) {
        const text = String(value || ''), index = text.lastIndexOf(historyMarker);
        if (index < 0) return {note:text,history:[]};
        try {
            const history = JSON.parse(text.slice(index + historyMarker.length));
            if (!Array.isArray(history) || !history.every(item => item && typeof item.text === 'string' && typeof item.at === 'string' && typeof item.by === 'string')) throw Error('Invalid history');
            return {note:text.slice(0,index),history};
        } catch { return {note:text,history:[]}; }
    }
    function joinHistory(note,history) { return String(note || '') + (history.length ? historyMarker + JSON.stringify(history) : ''); }
    return {fields,save,splitHistory,joinHistory};
})();
