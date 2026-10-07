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
        const parsed = splitHistory(values.note);
        const reminder = splitReminder(parsed.note);
        const note = joinReminder(reminder.note, values.reminderDate ?? reminder.reminderDate);
        const deleted = values.deletedContactHistory ?? [];
        if (!Array.isArray(deleted) || deleted.some(item => !item || !String(item.id || '').trim() || typeof item.at !== 'string' || typeof item.by !== 'string' || typeof item.text !== 'string') || new Set(deleted.map(item => String(item.id))).size !== deleted.length) {
            throw new Error('รายการประวัติที่ต้องการลบไม่ถูกต้อง');
        }
        const edited = values.editedContactHistory ?? [];
        const validEntry = item => item && typeof item.at === 'string' && typeof item.by === 'string' && typeof item.text === 'string';
        if (!Array.isArray(edited) || edited.some(item => !item || !String(item.id || '').trim() || !validEntry(item.previous) || !validEntry(item.current) || !item.current.by.trim() || !item.current.text.trim()) || new Set(edited.map(item => String(item.id))).size !== edited.length) {
            throw new Error('รายการประวัติที่แก้ไขไม่ถูกต้อง');
        }
        if (deleted.length || edited.length) {
            let readiness;
            try {
                const response = await fetch(url + '?contactHistoryDeletionCheck=1&_=' + Date.now(), {cache:'no-store',signal:AbortSignal.timeout(15000)});
                if (!response.ok) throw new Error();
                readiness = await response.json();
            } catch { throw new Error('ยังตรวจความพร้อมการลบประวัติไม่ได้ จึงยังไม่บันทึกข้อมูล กรุณาลองใหม่'); }
            if (deleted.length && !(readiness.contactHistoryDeletion >= 1)) throw new Error('Apps Script ยังไม่รองรับการลบประวัติ กรุณาอัปเดตเวอร์ชันก่อนบันทึก');
            if (edited.length && !(readiness.contactHistoryEdit >= 1)) throw new Error('Apps Script ยังไม่รองรับการแก้ไขประวัติ กรุณาอัปเดตเวอร์ชันก่อนบันทึก');
        }
        let token = sessionToken;
        try { if (!ignoreStoredToken) token ||= localStorage.getItem('carCrmWriteToken') || ''; } catch {}
        if (!token) token = (window.prompt('กรุณาใส่ Write Token ของ CAR CRM เพื่อบันทึกลงชีต lead') || '').trim();
        if (!token) throw new Error('ยังไม่ได้ระบุ Write Token จึงยังไม่บันทึกข้อมูล');
        const data = Object.fromEntries(fields.map(([name,label]) => [label,String(values[name] || '')]));
        data['*หมายเหตุ'] = note;
        data.contactHistory = values.contactHistory || parsed.history;
        if (deleted.length) data.deletedContactHistory = deleted.map(item => ({id:String(item.id),at:item.at,by:item.by,text:item.text}));
        if (edited.length) data.editedContactHistory = edited.map(item => ({id:String(item.id),previous:{at:item.previous.at,by:item.previous.by,text:item.previous.text},current:{at:item.current.at,by:item.current.by,text:item.current.text}}));
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
        if (deleted.length) {
            const ids = deleted.map(item => String(item.id));
            const confirmed = result.deletedContactHistoryIds;
            if (result.historyDeletionVerified !== true || result.historyVerified !== true || !Array.isArray(confirmed) || confirmed.length !== ids.length || new Set(confirmed).size !== ids.length || !ids.every(id => confirmed.includes(id)) || !Array.isArray(result.contactHistory) || result.contactHistory.some(item => ids.includes(String(item.id)))) {
                throw new Error('ยังยืนยันการลบประวัติไม่ได้ กรุณาลองบันทึกซ้ำด้วยรายการเดิม');
            }
        }
        if (edited.length) {
            const ids = edited.map(item => String(item.id)), confirmed = result.editedContactHistoryIds;
            if (result.historyEditVerified !== true || result.historyVerified !== true || !Array.isArray(confirmed) || confirmed.length !== ids.length || !ids.every(id => confirmed.includes(id)) || !Array.isArray(result.contactHistory) || !edited.every(item => result.contactHistory.some(entry => String(entry.id) === String(item.id) && entry.text === item.current.text && entry.by === item.current.by))) {
                throw new Error('ยังยืนยันการแก้ไขประวัติไม่ได้ กรุณาลองบันทึกซ้ำด้วยรายการเดิม');
            }
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
    const reminderMarker = '\n\n[CAR_FOLLOW_UP_V1]\n';
    function validReminderDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
        const date = new Date(value + 'T00:00:00Z');
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
    }
    function splitReminder(value) {
        const text = String(value || ''), suffixIndex = text.lastIndexOf(reminderMarker);
        const atStart = suffixIndex < 0 && text.startsWith(reminderMarker.slice(2));
        const index = atStart ? 0 : suffixIndex;
        if (index < 0) return {note:text,reminderDate:''};
        try {
            const reminder = JSON.parse(text.slice(index + reminderMarker.length - (atStart ? 2 : 0)));
            if (!reminder || !validReminderDate(reminder.reminderDate)) throw Error('Invalid reminder');
            return {note:text.slice(0,index),reminderDate:reminder.reminderDate};
        } catch { return {note:text,reminderDate:''}; }
    }
    function joinReminder(note,reminderDate) {
        if (reminderDate && !validReminderDate(reminderDate)) throw new Error('วันที่แจ้งเตือนไม่ถูกต้อง');
        const plain = splitReminder(note).note;
        return plain + (reminderDate ? (plain ? reminderMarker : reminderMarker.slice(2)) + JSON.stringify({reminderDate}) : '');
    }
    return {fields,save,splitHistory,joinHistory,validReminderDate,splitReminder,joinReminder};
})();
