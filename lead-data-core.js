(function (root) {
    'use strict';
    const LINE_ACCOUNT = 'car-line-fkq6145q';
    const dayFormatter = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'});
    function dayKey(value) {
        if (!value) return '';
        const date = new Date(value);
        return Number.isFinite(date.getTime()) ? dayFormatter.format(date) : '';
    }
    function csv(text, {allowSingleColumn = false} = {}) {
        const rows = []; let row = [], cell = '', quoted = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (c === '"') {
                if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
                else if (!quoted && cell.length) cell += c;
                else quoted = !quoted;
            } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
            else if ((c === '\n' || c === '\r') && !quoted) {
                if (c === '\r' && text[i + 1] === '\n') i++;
                row.push(cell); if (row.some(v => v !== '')) rows.push(row); row = []; cell = '';
            } else cell += c;
        }
        if (quoted) throw new Error('ไฟล์ CSV มีเครื่องหมายคำพูดไม่ครบ');
        row.push(cell); if (row.some(v => v !== '')) rows.push(row);
        if (!rows.length) return [];
        const headers = rows.shift().map(h => h.replace(/^\uFEFF/, '').trim());
        if (headers.length < (allowSingleColumn ? 1 : 2) || headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('หัวตาราง CSV ไม่ถูกต้อง');
        return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])));
    }
    const get = (row, names) => {
        const key = Object.keys(row).find(k => names.some(n => k.trim().toLowerCase() === n.toLowerCase()));
        return key ? String(row[key] ?? '').trim() : '';
    };
    function legacyPreview(customers, bookings, related = {}) {
        const customerMap = new Map(customers.map(c => [get(c, ['CustID']), c]));
        const seen = new Set();
        return bookings.map(row => {
            const jobId = get(row, ['JobID']);
            if (!jobId || seen.has(jobId)) throw new Error('ประวัติงานมี JobID ว่างหรือซ้ำ กรุณาตรวจข้อมูลก่อนนำเข้า');
            seen.add(jobId);
            const custId = get(row, ['CustID']);
            const customer = customerMap.get(custId) || {};
            const linked = Object.fromEntries(Object.entries(related).map(([table, rows]) => [table, rows.filter(r => get(r, ['JobID','Job ID']).replace(/\s/g,'').toLowerCase() === jobId.replace(/\s/g,'').toLowerCase())]));
            return {
                jobId, custId,
                customerName: get(customer, ['ชื่อลูกค้า']) || `ลูกค้าเดิม ${custId || jobId}`,
                phone: get(customer, ['เบอร์โทรศัพท์', 'เบอร์โทร', 'เบอร์โทรศัพท์ลูกค้า', 'โทรศัพท์', 'เบอร์โทรติดต่อ']),
                date: get(row, ['วันที่ติดตั้ง']), time: get(row, ['เวลานัด', 'เวลา']),
                carModel: get(row, ['รุ่นรถยนต์']), plate: get(row, ['ทะเบียนรถ']),
                plateColor: get(row, ['ป้าย']), positions: get(row, ['ตำแหน่งติดตั้ง']),
                filmBrand: get(row, ['ยี่ห้อฟิล์ม']), filmModel: get(row, ['รุ่นฟิล์ม', 'รุ่นฟิล์มติดตั้ง']),
                product: get(row, ['Pro_ID']), warranty: get(row, ['การรับประกัน']),
                price: get(row, ['มูลค่าสินค้า']), discount: get(row, ['ส่วนลด']),
                discountCode: get(row, ['รหัสส่วนลด']), amount: get(row, ['ยอดขาย']),
                salesperson: get(row, ['พน.ขาย']), technician: get(row, ['ช่าง', 'ช่างติดตั้ง', 'ทีมช่าง']),
                status: get(row, ['Status', 'สถานะ']) || 'คิวใหม่', customerType: get(row, ['ประเภทลูกค้า']),
                note: get(row, ['หมายเหตุ']), raw: row, rawCustomer: customer, related: linked
            };
        });
    }
    function identity(platform, account, userId) {
        if (!['line', 'facebook', 'instagram', 'legacy'].includes(platform) || !account || !userId) throw new Error('ข้อมูลอ้างอิงไม่ครบ');
        return JSON.stringify([platform, account, userId]);
    }
    function dateTH(value) {
        const date = new Date(value);
        return Number.isFinite(date.getTime()) ? date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : String(value || '—');
    }
    function customerTag(firstSeen, referenceDate = new Date()) {
        if (!firstSeen || !referenceDate || !Number.isFinite(new Date(referenceDate).getTime())) return '';
        const date = new Date(firstSeen);
        if (!Number.isFinite(date.getTime())) return '';
        return dayKey(date) === dayKey(referenceDate) ? 'new' : dayKey(date) < dayKey(referenceDate) ? 'existing' : '';
    }
    function createOptionsCache(load, {ttlMs = 5 * 60 * 1000, now = Date.now} = {}) {
        let cached = null, expiresAt = 0, pending = null, generation = 0;
        return {
            get() {
                if (cached && now() < expiresAt) return Promise.resolve(cached);
                if (pending) return pending;
                const started = generation;
                const request = Promise.resolve().then(load).then(value => {
                    if (started === generation) { cached = value; expiresAt = now() + ttlMs; }
                    return value;
                }).finally(() => { if (pending === request) pending = null; });
                pending = request;
                return request;
            },
            clear() { generation++; cached = null; expiresAt = 0; pending = null; }
        };
    }
    function inboxActivities(result) {
        return result.contacts.flatMap(row => [...(row.daily_activity || []).map(at => ({at,legacy:false})), ...(row.legacy_activity || []).map(at => ({at,legacy:true}))]
            .map(({at,legacy}) => ({...row,last_seen_at:at,legacy,
                customer_type:['facebook-conversations','instagram-conversations'].includes(result.source)
                    ? (dayKey(row.history_earliest) && dayKey(row.history_earliest)<dayKey(at) ? 'existing' : row.history_complete ? 'new' : '')
                    : customerTag(row.first_seen_at,at)
            }))).sort((a,b) => Date.parse(b.last_seen_at)-Date.parse(a.last_seen_at));
    }
    function createInboxLoader(loadPage, {ttlMs = 60000, now = Date.now} = {}) {
        const pages = new Map(), snapshots = new Map();
        const generations = new Map();
        let generation = 0;
        const keyOf = value => JSON.stringify([value.platform,value.start,value.end]);
        function clear(platform) {
            if (platform) generations.set(platform,(generations.get(platform) || 0)+1);
            else generation++;
            for (const cache of [pages,snapshots]) {
                for (const [key,entry] of cache) if (!platform || entry.platform === platform) cache.delete(key);
            }
        }
        function peek(query) {
            const entry = snapshots.get(keyOf(query));
            return entry && now() < entry.expiresAt ? entry.value : null;
        }
        async function readPage(query) {
            // Only LINE pages depend on the range start (one-response ranges); other channels keep reusing pages when the period widens.
            const key = JSON.stringify([query.platform,query.platform === 'line' ? query.start : '',query.date,query.page,query.cursor]);
            let entry = pages.get(key);
            if (entry && (entry.pending || now() < entry.expiresAt)) return entry.pending || entry.value;
            entry = {platform:query.platform};
            pages.set(key,entry);
            while (pages.size > 200) pages.delete(pages.keys().next().value);
            entry.pending = Promise.resolve().then(() => loadPage(query)).then(value => {
                entry.value = value; entry.expiresAt = now()+ttlMs; entry.pending = null;
                return value;
            }, error => {
                if (pages.get(key) === entry) pages.delete(key);
                throw error;
            });
            return entry.pending;
        }
        async function load({platform,start,end,refresh = false,onPage = () => {},isCurrent = () => true}) {
            const query = {platform,start,end};
            if (refresh) clear(platform);
            const started = generation, platformGeneration = generations.get(platform);
            const active = () => isCurrent() && started === generation && platformGeneration === generations.get(platform);
            const cached = peek(query);
            if (cached) { if (active()) onPage(cached,{complete:true,cached:true}); return cached; }
            const collected = new Map(), seenCursors = new Set();
            let cursor = '';
            for (let page = 0; page < 100; page++) {
                if (!active()) return null;
                const result = await readPage({platform,page,start,date:end,cursor,refresh:refresh && page === 0});
                if (!active()) return null;
                const rows = result.contacts || [];
                for (const row of rows) collected.set(row.id,row);
                const direct = ['facebook-conversations','instagram-conversations'].includes(result.source);
                const oldest = rows.length ? dayKey(rows[rows.length-1].last_seen_at) : '';
                // A server that answers the whole range at once marks it complete; otherwise keep paging.
                const more = result.rangeComplete === true && result.rangeStart === start ? false : direct ? result.nextCursor : rows.length === 30;
                const complete = !more || !rows.length || Boolean(oldest && oldest < start && collected.size >= 30);
                const value = {...result,contacts:[...collected.values()]};
                onPage(value,{complete,cached:false});
                if (complete) {
                    snapshots.set(keyOf(query),{platform,value,expiresAt:now()+ttlMs});
                    while (snapshots.size > 12) snapshots.delete(snapshots.keys().next().value);
                    return value;
                }
                cursor = result.nextCursor || '';
                if (direct && seenCursors.has(cursor)) throw new Error('อ่านหน้าถัดไปไม่สำเร็จ กรุณารีเฟรช');
                seenCursors.add(cursor);
            }
            throw new Error('ช่วงนี้มีข้อมูลมากเกินไป กรุณาเลือกช่วงวันที่สั้นลง');
        }
        return {load,peek,clear};
    }
    const api = { LINE_ACCOUNT, csv, get, legacyPreview, identity, dateTH, dayKey, customerTag, createOptionsCache, inboxActivities, createInboxLoader };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CarLeadCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
