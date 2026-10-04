'use strict';
// Read-only Instagram intake through the linked CAR Page. No subscriptions or sends.
const core = require('./lead-data-core.js');
const fail = (message, status = 502, code) => Object.assign(new Error(message), {status, ...(code ? {code} : {})});

async function conversations(settings, cursor = '', fetchImpl = fetch) {
    if (!/^\d{5,30}$/.test(settings.facebookPage || '') || !/^\d{5,30}$/.test(settings.instagramAccount || '') || !settings.instagramToken) {
        throw fail('Instagram: รอตั้งค่า Page ID, Instagram Account ID และสิทธิ์อ่านแชตของ CAR', 503, 'INSTAGRAM_NOT_CONFIGURED');
    }
    if (typeof cursor !== 'string' || cursor.length > 2048) throw fail('รหัสหน้าถัดไปไม่ถูกต้อง', 400);
    async function get(resource, params) {
        const url = new URL(`https://graph.facebook.com/v25.0/${resource}`);
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        let response, result;
        try {
            response = await fetchImpl(url.toString(), {method:'GET', redirect:'error', headers:{Authorization:`Bearer ${settings.instagramToken}`}, signal:AbortSignal.timeout(15000)});
            result = await response.json();
        } catch { throw fail('ติดต่อ Instagram ไม่สำเร็จ กรุณากดอัปเดตอีกครั้ง'); }
        if (!response.ok || result.error) {
            if (result.error?.code === 190) throw fail('Instagram: สิทธิ์เชื่อมต่อหมดอายุ กรุณาอัปเดต Page Access Token สำหรับ Instagram', 401, 'INSTAGRAM_TOKEN_EXPIRED');
            if ([10, 200, 230].includes(result.error?.code)) throw fail('Instagram: ยังไม่ได้รับสิทธิ์อ่านแชต กรุณาอนุญาต instagram_basic, instagram_manage_messages และ pages_manage_metadata ใน Meta', 403, 'INSTAGRAM_PERMISSION_REQUIRED');
            throw fail('อ่าน Instagram ไม่สำเร็จ กรุณาตรวจสิทธิ์และการเชื่อมบัญชีกับเพจ CAR');
        }
        return result;
    }
    const page = await get('me', {fields:'id,name,instagram_business_account{id,username,name}'});
    if (String(page.id) !== settings.facebookPage) throw fail('Instagram: Page Access Token ไม่ตรงกับเพจ CAR ที่กำหนด', 403, 'INSTAGRAM_ACCOUNT_MISMATCH');
    const linked = page.instagram_business_account;
    if (!linked || String(linked.id) !== settings.instagramAccount) throw fail('Instagram: บัญชีที่เชื่อมกับเพจไม่ตรงกับบัญชี CAR ที่กำหนด', 403, 'INSTAGRAM_ACCOUNT_MISMATCH');

    const account = `car-ig-${linked.id}`;
    const params = {platform:'instagram', fields:'id,updated_time,participants,messages.limit(100){created_time,from}', limit:'30'};
    if (cursor) params.after = cursor;
    const result = await get(`${settings.facebookPage}/conversations`, params);
    if (!Array.isArray(result.data)) throw fail('Instagram ส่งรายชื่อในรูปแบบที่อ่านไม่ได้');
    const contacts = result.data.flatMap(conversation => (conversation.participants?.data || [])
        .filter(person => /^\d{5,30}$/.test(String(person.id || '')) && ![settings.facebookPage, settings.instagramAccount].includes(String(person.id)))
        .map(person => ({id:conversation.id, conversation_id:conversation.id, instagram_user_id:String(person.id),
            account_key:account, display_name:person.username || person.name || null,
            first_seen_at:null, last_seen_at:conversation.updated_time || null, messages:conversation.messages})));

    async function classify(contact) {
        let history = contact.messages, complete = false, earliest = null;
        const days = new Map(), visited = new Set();
        try {
            for (let pageNumber = 0; pageNumber < 10 && history; pageNumber++) {
                if (!Array.isArray(history.data)) break;
                for (const message of history.data) {
                    if (String(message.from?.id) !== contact.instagram_user_id || !Number.isFinite(Date.parse(message.created_time))) continue;
                    const at = new Date(message.created_time).toISOString(), day = core.dayKey(at);
                    if (!earliest || at < earliest) earliest = at;
                    if (!days.has(day) || at > days.get(day)) days.set(day, at);
                }
                if (!history.paging?.next) { complete = true; break; }
                const after = history.paging.cursors?.after;
                if (typeof after !== 'string' || !after || after.length > 2048 || visited.has(after)) break;
                visited.add(after);
                history = await get(`${encodeURIComponent(contact.conversation_id)}/messages`, {fields:'created_time,from', limit:'100', after});
            }
        } catch { /* Keep verified contacts and the observed days when older history is unavailable. */ }
        delete contact.messages;
        contact.daily_activity = [...days.values()].sort().reverse();
        contact.history_complete = complete;
        contact.history_earliest = earliest;
        contact.first_seen_at = complete ? earliest : null;
        contact.customer_type = core.customerTag(earliest, contact.last_seen_at) === 'existing' ? 'existing' : complete ? core.customerTag(earliest, contact.last_seen_at) : '';
    }
    let index = 0;
    await Promise.all(Array.from({length:Math.min(4, contacts.length)}, async () => {
        while (index < contacts.length) await classify(contacts[index++]);
    }));
    const after = result.paging?.cursors?.after;
    const nextCursor = result.paging?.next && typeof after === 'string' && after && after.length <= 2048 ? after : null;
    if (result.paging?.next && !nextCursor) throw fail('อ่านหน้าถัดไปของ Instagram ไม่สำเร็จ กรุณากดอัปเดตอีกครั้ง');
    return {contacts, account, accountName:linked.name || linked.username || 'Instagram CAR',
        username:linked.username || settings.instagramUsername, nextCursor, source:'instagram-conversations', configured:true, summary:null};
}
module.exports = {conversations};
