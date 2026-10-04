'use strict';
// Read-only Meta Conversations API. No webhook subscription, routing or send API calls.
const fail = (message, status = 502) => Object.assign(new Error(message),{status});
const core = require('./lead-data-core.js');
async function conversations(settings, cursor = '', fetchImpl = fetch) {
    if (!/^\d{5,30}$/.test(settings.facebookPage || '') || !settings.facebookToken) {
        throw fail('รอ Page ID และสิทธิ์อ่านข้อความของเพจ MHLcarfilm ในระบบ CAR',503);
    }
    if (typeof cursor !== 'string' || cursor.length > 2048) throw fail('ตำแหน่งรายการไม่ถูกต้อง',400);
    const get = async (resource, params) => {
        const url = new URL(`https://graph.facebook.com/v25.0/${resource}`);
        for (const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
        let response;
        try { response = await fetchImpl(url.toString(),{method:'GET',headers:{Authorization:`Bearer ${settings.facebookToken}`},signal:AbortSignal.timeout(15000)}); }
        catch { throw fail('ติดต่อ Facebook ไม่ได้ กรุณาลองใหม่'); }
        const value = await response.json();
        if (!response.ok || value.error) {
            const code = value.error?.code;
            throw fail(code === 190 ? 'Page Access Token ของ CAR หมดอายุหรือไม่ถูกต้อง' : 'Facebook ยังไม่อนุญาตให้อ่านบทสนทนา กรุณาตรวจสิทธิ์ของแอป CAR', code === 190 ? 401 : 502);
        }
        return value;
    };
    const page = await get('me',{fields:'id,name'});
    if (page.id !== settings.facebookPage) throw fail('Page Access Token ไม่ตรงกับ Page ID ของ CAR',403);
    const params = {platform:'messenger',fields:'id,updated_time,participants,messages.limit(100){created_time,from}',limit:'30'};
    if (cursor) params.after = cursor;
    const result = await get(`${settings.facebookPage}/conversations`,params);
    if (!Array.isArray(result.data)) throw fail('รูปแบบข้อมูลบทสนทนาจาก Facebook ไม่ถูกต้อง');
    const contacts = [];
    for (const conversation of result.data) {
        for (const person of conversation.participants?.data || []) {
            if (person.id === settings.facebookPage || !/^\d{5,30}$/.test(person.id || '')) continue;
            contacts.push({id:conversation.id,conversation_id:conversation.id,facebook_user_id:person.id,
                account_key:`car-fb-${settings.facebookPage}`,display_name:person.name || null,
                first_seen_at:null,last_seen_at:conversation.updated_time || null});
        }
    }
    // An older inbound message proves returning status. New requires complete history.
    let index = 0;
    async function classify() {
        while (index < contacts.length) {
            const row = contacts[index++];
            const conversation = result.data.find(c => c.id === row.conversation_id);
            let history = conversation.messages, earliest = null, complete = false;
            const days = new Map();
            const seen = new Set();
            try {
                for (let pageIndex = 0; pageIndex < 10 && history; pageIndex++) {
                    if (!Array.isArray(history.data)) break;
                    for (const message of history.data) {
                        if (message.from?.id !== row.facebook_user_id || !Number.isFinite(Date.parse(message.created_time))) continue;
                        const at = new Date(message.created_time).toISOString();
                        if (!earliest || at < earliest) earliest = at;
                        const date = new Date(Date.parse(at)+7*3600000).toISOString().slice(0,10);
                        if (!days.has(date) || days.get(date)<at) days.set(date,at);
                    }
                    if (!history.paging?.next) { complete = true; break; }
                    const after = history.paging?.cursors?.after;
                    if (typeof after !== 'string' || after.length > 2048 || seen.has(after)) break;
                    seen.add(after);
                    history = await get(`${encodeURIComponent(row.conversation_id)}/messages`,{fields:'created_time,from',limit:'100',after});
                }
                row.customer_type = core.customerTag(earliest, row.last_seen_at) === 'existing' ? 'existing' : complete ? core.customerTag(earliest, row.last_seen_at) : '';
                row.first_seen_at = complete ? earliest : null;
                row.history_checked = Boolean(row.customer_type);
            } catch { row.customer_type = ''; row.history_checked = false; }
            row.daily_activity = [...days.values()].sort().reverse();
            row.history_complete = complete;
            row.history_earliest = earliest;
        }
    }
    await Promise.all(Array.from({length:Math.min(4,contacts.length)},classify));
    // Never follow Meta's paging.next URL: it may carry a token. Only return the cursor.
    const nextCursor = result.paging?.next && typeof result.paging?.cursors?.after === 'string' ? result.paging.cursors.after : null;
    return {contacts,account:`car-fb-${settings.facebookPage}`,accountName:page.name || 'MHLcarfilm',nextCursor,
        source:'facebook-conversations',configured:true,summary:null};
}
module.exports = {conversations};
