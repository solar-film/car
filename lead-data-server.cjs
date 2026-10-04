'use strict';
// Separate CAR lead service. No runtime dependency on Good CRM.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const core = require('./lead-data-core.js');
const facebookReader = require('./lead-data-facebook.cjs');
const instagramReader = require('./lead-data-instagram.cjs');
const lineSheet = require('./lead-data-line-sheet.cjs');
const sheetReader = require('./lead-data-sheet-reader.cjs');
const leadOptions = require('./lead-data-options.cjs');
const crmSession = require('./crm-session.cjs');
const ROOT = __dirname;
const SHEET = '1u__xYWoWZpmrnquc-Fpk19WtpcrckxSd0-_G35NWxXQ';
function error(message, status = 400) { return Object.assign(new Error(message), { status }); }
function readEnv(file) {
    if (!fs.existsSync(file)) return {};
    return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).flatMap(line => {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
        return m ? [[m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')]] : [];
    }));
}
function config() {
    const local = { ...readEnv(path.join(ROOT, 'lead-data.env')), ...process.env };
    return {
        crmAuth: crmSession.config(ROOT, local),
        accessKey: local.CAR_LEAD_ACCESS_KEY || '',
        lineSecret: local.CAR_LEAD_LINE_CHANNEL_SECRET || '',
        lineToken: local.CAR_LEAD_LINE_ACCESS_TOKEN || '',
        lineSheetEnabled: local.CAR_LEAD_LINE_SOURCE === 'sheet',
        lineBotId: local.CAR_LEAD_LINE_BOT_USER_ID || '',
        facebookSecret: local.CAR_LEAD_FB_APP_SECRET || '',
        facebookVerify: local.CAR_LEAD_FB_VERIFY_TOKEN || '',
        facebookPage: local.CAR_LEAD_FB_PAGE_ID || '',
        facebookToken: local.CAR_LEAD_FB_PAGE_ACCESS_TOKEN || '',
        instagramAccount: local.CAR_LEAD_IG_ACCOUNT_ID || '17841458662245781',
        instagramUsername: local.CAR_LEAD_IG_USERNAME || 'mhlcarfilm',
        instagramToken: local.CAR_LEAD_IG_PAGE_ACCESS_TOKEN || local.CAR_LEAD_FB_PAGE_ACCESS_TOKEN || '',
        port: Number(local.CAR_LEAD_PORT || 3092),
        host: local.CAR_LEAD_HOST || '127.0.0.1',
        allowedOrigin: local.CAR_LEAD_ALLOWED_ORIGIN || '',
        database: local.CAR_LEAD_DATABASE || path.join(ROOT, '.lead-data', 'car-leads.sqlite')
    };
}
function store(filename) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
    const db = new DatabaseSync(filename);
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS contact_tags (identity TEXT PRIMARY KEY, customer_type TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, identity TEXT UNIQUE, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS installations (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES leads(id), legacy_job TEXT UNIQUE, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, record_id TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS legacy_sources (table_name TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, identity TEXT UNIQUE NOT NULL, platform TEXT NOT NULL, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS inbox_events (platform TEXT NOT NULL, event_id TEXT NOT NULL, contact_id TEXT NOT NULL REFERENCES contacts(id), at TEXT NOT NULL, PRIMARY KEY(platform,event_id));`);
    db.exec(`CREATE TABLE IF NOT EXISTS contact_activity_days (contact_id TEXT NOT NULL REFERENCES contacts(id), day TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(contact_id,day));
        INSERT OR IGNORE INTO contact_activity_days SELECT id,strftime('%Y-%m-%d',json_extract(data,'$.last_seen_at'),'+7 hours'),json_extract(data,'$.last_seen_at') FROM contacts WHERE platform='line' AND json_extract(data,'$.last_seen_at') IS NOT NULL;`);
    db.exec('CREATE TABLE IF NOT EXISTS line_message_days (contact_id TEXT NOT NULL REFERENCES contacts(id), day TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(contact_id,day))');
    function syncLineDaily(items) {
        syncLineSheet(items);
        transaction(() => {
            for (const item of items) {
                const row = db.prepare('SELECT id FROM contacts WHERE identity=?').get(core.identity('line',core.LINE_ACCOUNT,item.line_user_id));
                const day = new Date(Date.parse(item.last_seen_at)+7*3600000).toISOString().slice(0,10);
                db.prepare('INSERT INTO line_message_days VALUES(?,?,?) ON CONFLICT(contact_id,day) DO UPDATE SET at=max(at,excluded.at)').run(row.id,day,item.last_seen_at);
            }
        });
    }
    function lineMessageDays(row, startedAt) {
        const observed = activityDays({...row}).daily_activity;
        row.daily_activity = db.prepare('SELECT at FROM line_message_days WHERE contact_id=? ORDER BY at DESC').all(row.id).map(item=>item.at);
        const confirmed = new Set(row.daily_activity.map(at => new Date(Date.parse(at)+7*3600000).toISOString().slice(0,10)));
        row.legacy_activity = startedAt ? observed.filter(at => Date.parse(at) < Date.parse(startedAt) && !confirmed.has(new Date(Date.parse(at)+7*3600000).toISOString().slice(0,10))) : [];
        return row;
    }
    const rows = table => db.prepare(`SELECT data FROM ${table}`).all().map(r => JSON.parse(r.data));
    function activityDays(row) {
        row.daily_activity = db.prepare(`SELECT max(at) AS at FROM (
            SELECT at FROM contact_activity_days WHERE contact_id=? UNION ALL SELECT at FROM inbox_events WHERE contact_id=?
        ) GROUP BY strftime('%Y-%m-%d',at,'+7 hours') ORDER BY at DESC`).all(row.id,row.id).map(item => item.at);
        return row;
    }
    const audit = (actor, action, id) => db.prepare('INSERT INTO audit(at,actor,action,record_id) VALUES(?,?,?,?)').run(new Date().toISOString(), actor, action, id);
    function transaction(work) {
        db.exec('BEGIN IMMEDIATE');
        try { const result = work(); db.exec('COMMIT'); return result; }
        catch (e) { db.exec('ROLLBACK'); throw e; }
    }
    function saveLead(input, actor, source = null) {
        const name = String(input.name || '').trim();
        if (!name || name.length > 200) throw error('กรอกชื่อลูกค้าไม่เกิน 200 ตัวอักษร');
        const previous = input.id && db.prepare('SELECT data FROM leads WHERE id=?').get(input.id);
        if (input.id && !previous) throw error('ไม่พบลีด', 404);
        const old = previous ? JSON.parse(previous.data) : null;
        const identity = source ? core.identity(source.platform, source.account, source.userId) : old?.identity || null;
        if (!old && identity) {
            const duplicate = db.prepare('SELECT data FROM leads WHERE identity=?').get(identity);
            if (duplicate) return { lead: JSON.parse(duplicate.data), duplicate: true };
        }
        const now = new Date().toISOString();
        const lead = { id: old?.id || crypto.randomUUID(), identity, name, phone: String(input.phone || '').slice(0, 100),
            email: String(input.email || '').slice(0, 200), address: String(input.address || '').slice(0, 2000),
            status: ['ใหม่','กำลังติดตาม','นัดติดตั้ง','ติดตั้งแล้ว','ไม่สนใจ'].includes(input.status) ? input.status : 'ใหม่',
            salesperson: String(input.salesperson || '').slice(0, 200), note: String(input.note || '').slice(0, 5000),
            source: old?.source || source || { platform: 'manual' }, createdAt: old?.createdAt || now, updatedAt: now,
            rawCustomer: old?.rawCustomer || input.rawCustomer || null,
            sheetKey: input.sheetKey || old?.sheetKey || null,
            sheetData: input.sheetData || old?.sheetData || null,
            sheetRow: input.sheetRow || old?.sheetRow || null,
            sheetSavedAt: input.sheetSavedAt || old?.sheetSavedAt || null };
        db.prepare('INSERT INTO leads VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(lead.id, identity, JSON.stringify(lead));
        audit(actor, old ? 'lead.update' : 'lead.create', lead.id);
        return { lead, duplicate: false };
    }
    function saveInstallation(input, actor) {
        const lead = db.prepare('SELECT id FROM leads WHERE id=?').get(String(input.leadId || ''));
        if (!lead) throw error('เลือกลีดก่อนบันทึกงานติดตั้ง');
        const previous = input.id && db.prepare('SELECT data FROM installations WHERE id=?').get(input.id);
        if (input.id && !previous) throw error('ไม่พบงานติดตั้ง', 404);
        const old = previous ? JSON.parse(previous.data) : null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '') || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0,10) !== input.date) throw error('กรอกวันที่ติดตั้งให้ถูกต้อง');
        const item = { id: old?.id || crypto.randomUUID(), leadId: lead.id, legacyJob: old?.legacyJob || null,
            createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), raw: old?.raw || null, related: old?.related || null };
        for (const field of ['date','time','carModel','plate','plateColor','positions','filmBrand','filmModel','product','warranty','discountCode','salesperson','technician','customerType','note','status','paymentMethod','billNumber','warrantyNumber','followUpDate']) item[field] = String(input[field] || '').slice(0, field === 'note' ? 5000 : 1000);
        for (const field of ['price','discount','amount','deposit']) {
            const value = String(input[field] ?? '').replace(/,/g, '');
            if (value && (!Number.isFinite(Number(value)) || Number(value) < 0)) throw error('ยอดเงินต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
            item[field] = value;
        }
        db.prepare('INSERT INTO installations VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(item.id, item.leadId, item.legacyJob, JSON.stringify(item));
        audit(actor, old ? 'installation.update' : 'installation.create', item.id);
        return item;
    }
    function importLegacy(items, actor, sources = null) {
        if (!Array.isArray(items) || items.length > 20000) throw error('ประวัติงานไม่ถูกต้อง');
        return transaction(() => {
            if (sources) {
                for (const name of ['Customer','Bookings','data','Detail_film','PayIn']) {
                    if (!Array.isArray(sources[name])) throw error(`ต้นฉบับตาราง ${name} ไม่ครบ`);
                    db.prepare('INSERT INTO legacy_sources VALUES(?,?,?) ON CONFLICT(table_name) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at')
                        .run(name, JSON.stringify(sources[name]), new Date().toISOString());
                }
                audit(actor, 'legacy.archive', 'CAR_CRM');
            }
            let added = 0, skipped = 0;
            for (const item of items) {
                if (!item.jobId) throw error('ประวัติงานต้องมี JobID');
                if (db.prepare('SELECT id FROM installations WHERE legacy_job=?').get(item.jobId)) { skipped++; continue; }
                const result = saveLead({ name: item.customerName, phone: item.phone, rawCustomer: item.rawCustomer }, actor,
                    { platform: 'legacy', account: 'CAR_CRM', userId: item.custId || `job:${item.jobId}` });
                const record = { ...item, id: crypto.randomUUID(), leadId: result.lead.id, legacyJob: item.jobId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
                db.prepare('INSERT INTO installations VALUES(?,?,?,?)').run(record.id, record.leadId, item.jobId, JSON.stringify(record));
                audit(actor, 'installation.import', record.id); added++;
            }
            return { added, skipped };
        });
    }
    const archive = () => Object.fromEntries(db.prepare('SELECT * FROM legacy_sources').all().map(row => [row.table_name, { rows:JSON.parse(row.data), updatedAt:row.updated_at }]));
    function receive(platform, account, events) {
        return transaction(() => {
            for (const event of events) {
                if (db.prepare('SELECT event_id FROM inbox_events WHERE platform=? AND event_id=?').get(platform,event.eventId)) continue;
                const identity = core.identity(platform,account,event.userId);
                const previous = db.prepare('SELECT * FROM contacts WHERE identity=?').get(identity);
                const old = previous && JSON.parse(previous.data);
                const row = old || { id:crypto.randomUUID(), account_key:account, [platform === 'line' ? 'line_user_id':'facebook_user_id']:event.userId, first_seen_at:event.at, last_seen_at:event.at, display_name:null };
                row.first_seen_at = row.first_seen_at < event.at ? row.first_seen_at : event.at;
                row.last_seen_at = row.last_seen_at > event.at ? row.last_seen_at : event.at;
                db.prepare('INSERT INTO contacts VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(row.id,identity,platform,JSON.stringify(row));
                db.prepare('INSERT INTO inbox_events VALUES(?,?,?,?)').run(platform,event.eventId,row.id,event.at);
            }
        });
    }
    function inbox(platform, account, page) {
        return db.prepare("SELECT data FROM contacts WHERE platform=? AND json_extract(data,'$.account_key')=? ORDER BY json_extract(data,'$.last_seen_at') DESC,id LIMIT 30 OFFSET ?").all(platform,account,page*30).map(row => JSON.parse(row.data));
    }
    function daily(platform, account, day) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) throw error('วันที่สถิติไม่ถูกต้อง');
        const counts = db.prepare(`SELECT count(DISTINCT c.id) AS total,
            count(DISTINCT CASE WHEN strftime('%Y-%m-%d',json_extract(c.data,'$.first_seen_at'),'+7 hours')=? THEN c.id END) AS fresh
            FROM inbox_events e JOIN contacts c ON c.id=e.contact_id
            WHERE e.platform=? AND json_extract(c.data,'$.account_key')=? AND strftime('%Y-%m-%d',e.at,'+7 hours')=?`).get(day,platform,account,day);
        const selected = db.prepare("SELECT count(*) AS n FROM leads WHERE json_extract(data,'$.source.platform')=? AND json_extract(data,'$.source.account')=? AND strftime('%Y-%m-%d',json_extract(data,'$.createdAt'),'+7 hours')=?").get(platform,account,day).n;
        return { total:counts.total, fresh:counts.fresh, selected };
    }
    const contact = id => { const row = db.prepare('SELECT data FROM contacts WHERE id=?').get(id); return row && JSON.parse(row.data); };
    function name(id, value) {
        const row = contact(id); if (!row) return;
        row.display_name = String(value).slice(0,200);
        db.prepare('UPDATE contacts SET data=? WHERE id=?').run(JSON.stringify(row),id);
    }
    function customerType(platform, account, userId) {
        return db.prepare('SELECT customer_type FROM contact_tags WHERE identity=?').get(core.identity(platform,account,userId))?.customer_type || '';
    }
    function tagContact(platform, account, userId, value, actor) {
        if (!['','new','existing'].includes(value)) throw error('แท็กลูกค้าไม่ถูกต้อง');
        const identity = core.identity(platform,account,userId);
        db.prepare('INSERT INTO contact_tags VALUES(?,?) ON CONFLICT(identity) DO UPDATE SET customer_type=excluded.customer_type').run(identity,value);
        audit(actor,'contact.tag',identity);
        return {customer_type:value};
    }
    function syncLineSheet(items) {
        return transaction(() => {
            for (const item of items) {
                const identity = core.identity('line',core.LINE_ACCOUNT,item.line_user_id);
                const found = db.prepare('SELECT data FROM contacts WHERE identity=?').get(identity);
                const old = found ? JSON.parse(found.data) : null;
                const row = {...item,id:old?.id || crypto.randomUUID(),account_key:core.LINE_ACCOUNT,display_name:old?.display_name || null,
                    first_seen_at:old?.first_seen_at && old.first_seen_at < item.first_seen_at ? old.first_seen_at : item.first_seen_at,
                    last_seen_at:old?.last_seen_at && old.last_seen_at > item.last_seen_at ? old.last_seen_at : item.last_seen_at};
                db.prepare('INSERT INTO contacts VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(row.id,identity,'line',JSON.stringify(row));
                for (const at of [item.first_seen_at,item.last_seen_at]) {
                    const date = new Date(Date.parse(at)+7*3600000).toISOString().slice(0,10);
                    db.prepare('INSERT INTO contact_activity_days VALUES(?,?,?) ON CONFLICT(contact_id,day) DO UPDATE SET at=max(at,excluded.at)').run(row.id,date,at);
                }
            }
        });
    }
    return { syncLineDaily, lineMessageDays, activityDays, syncLineSheet, customerType, tagContact, db, rows, transaction, saveLead, saveInstallation, importLegacy, archive, receive, inbox, daily, contact, name };
}
function equal(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
    const left = Buffer.from(a), right = Buffer.from(b);
    return left.length === right.length && crypto.timingSafeEqual(left,right);
}
function authorize(settings, req) {
    if (settings.accessKey) {
        if (!equal(req.headers['x-car-lead-key'],settings.accessKey)) throw error('กรอก Access Key ของระบบลีด CAR',401);
        return {id:'CAR-key',name:'CAR',mode:'key'};
    }
    const host = new URL(`http://${req.headers.host}`).hostname;
    if (!['127.0.0.1','localhost','[::1]'].includes(settings.host) || !['127.0.0.1','localhost','[::1]'].includes(host) || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw error('ระบบที่เปิดผ่านเครือข่ายต้องตั้ง CAR_LEAD_ACCESS_KEY',503);
    return {id:'CAR-local',name:'CAR · ใช้งานในเครื่อง',mode:'local'};
}
async function rawBody(req, max = 12*1024*1024) {
    const chunks = []; let bytes = 0;
    for await (const chunk of req) { bytes += chunk.length; if (bytes > max) throw error('ข้อมูลเกินขนาดที่กำหนด',413); chunks.push(chunk); }
    return Buffer.concat(chunks);
}
async function body(req, max) { try { return JSON.parse((await rawBody(req, max)).toString('utf8')); } catch(e) { if (e.status) throw e; throw error('รูปแบบข้อมูลไม่ถูกต้อง'); } }
function signature(raw, signature, secret, platform) {
    if (!secret) return false;
    const expected = crypto.createHmac('sha256',secret).update(raw).digest();
    let received;
    if (platform === 'line') {
        if (!/^[A-Za-z0-9+/]{43}=$/.test(signature || '')) return false;
        received = Buffer.from(signature,'base64');
    } else {
        if (!/^sha256=[a-f0-9]{64}$/.test(signature || '')) return false;
        received = Buffer.from(signature.slice(7),'hex');
    }
    return received.length === expected.length && crypto.timingSafeEqual(received,expected);
}
function parseEvents(platform, envelope, settings) {
    const valid = (eventId,userId,timestamp) => {
        if (typeof eventId !== 'string' || !eventId || eventId.length > 512 || !Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > Date.now()+300000) throw error('Invalid event');
        return {eventId,userId,at:new Date(timestamp).toISOString()};
    };
    if (platform === 'line') {
        if (envelope.destination !== settings.lineBotId || !Array.isArray(envelope.events) || envelope.events.length > 100) throw error('Invalid CAR destination');
        return envelope.events.filter(e => e.type === 'message' && e.source?.type === 'user').map(e => {
            if (!/^U[0-9a-f]{32}$/.test(e.source.userId || '')) throw error('Invalid LINE user');
            return valid(e.webhookEventId,e.source.userId,e.timestamp);
        });
    }
    if (envelope.object !== 'page' || !Array.isArray(envelope.entry) || envelope.entry.length > 100) throw error('Invalid Facebook envelope');
    const events = [];
    for (const entry of envelope.entry) {
        if (entry.id !== settings.facebookPage) continue;
        for (const channel of ['messaging','standby']) {
            if (!Object.hasOwn(entry,channel)) continue;
            if (!Array.isArray(entry[channel]) || entry[channel].length > 100) throw error('Invalid Facebook messages');
            for (const e of entry[channel]) {
                if (!e.message || e.message.is_echo) continue;
                if (e.recipient?.id !== entry.id || !/^[0-9]{5,30}$/.test(e.sender?.id || '')) throw error('Invalid Facebook sender');
                events.push(valid(e.message.mid,e.sender.id,e.timestamp));
                if (events.length > 1000) throw error('Too many events');
            }
        }
    }
    return events;
}
async function enrich(settings,database,platform,contacts) {
    const token = platform === 'line' ? settings.lineToken : settings.facebookToken;
    if (!token) return;
    await Promise.all(contacts.filter(c => !c.display_name).map(async row => {
        try {
            const user = platform === 'line' ? row.line_user_id : row.facebook_user_id;
            const url = platform === 'line' ? `https://api.line.me/v2/bot/profile/${encodeURIComponent(user)}` : `https://graph.facebook.com/v25.0/${encodeURIComponent(user)}?fields=first_name,last_name`;
            const response = await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(3000)});
            if (!response.ok) return;
            const profile = await response.json();
            const display = platform === 'line' ? profile.displayName : [profile.first_name,profile.last_name].filter(Boolean).join(' ');
            if (display) { database.name(row.id,display); row.display_name = display; }
        } catch { /* Keep user ID when profiles are unavailable. */ }
    }));
}
function createServer(baseSettings, database, options = {}) {
    const crmAuth = crmSession.createAuth(baseSettings.crmAuth, options.crmAuth);
    // Only contacts returned by the verified Meta reader may be selected.
    const facebookContacts = new Map();
    const instagramContacts = new Map();
    // All LINE pages share one recent sync; an explicit refresh starts a fresh sync.
    const lineSnapshot = core.createOptionsCache(async () => {
        const [items,dailyLog] = await Promise.all([lineSheet.read(options.lineSheetFetch),lineSheet.readDaily(options.lineDailyFetch || options.lineSheetFetch)]);
        database.syncLineSheet(items);
        database.syncLineDaily(dailyLog.items);
        return {startedAt:dailyLog.startedAt,total:items.length};
    }, {ttlMs:60000});
    const staticFiles = new Set(fs.readdirSync(ROOT).filter(name => /^[a-zA-Z0-9_-]+\.(html|js|css)$/.test(name)));
    staticFiles.add('app.webmanifest');
    for (const icon of ['car-crm-app.svg','car-crm-app.png','car-crm-app.ico','car-crm-app-192.png','car-crm-app-512.png']) staticFiles.add(`images/${icon}`);
    staticFiles.add('images/qrcode_mhl.png');
    staticFiles.add('images/page-heading-icons.svg');
    staticFiles.add('images/overview-city-sedan.webp');
    staticFiles.add('images/overview-premium-suv.webp');
    return http.createServer(async (req, res) => {
        const settings = {...baseSettings};
        if (options.reloadChannels) {
            const latest = config();
            // Channel credentials reload independently of host/auth/network settings.
            for (const key of ['lineSecret','lineToken','lineBotId','facebookSecret','facebookVerify','facebookPage','facebookToken','instagramAccount','instagramUsername','instagramToken']) settings[key] = latest[key];
        }
        const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
        try {
            const hostOrigin = `http://${req.headers.host}`;
            const url = new URL(req.url, hostOrigin);
            if (await crmAuth.handle(req, res, url, body, send)) return;
            const origin = req.headers.origin;
            if (origin && origin !== hostOrigin && origin !== settings.allowedOrigin) throw error('ไม่อนุญาต origin นี้', 403);
            if (origin && origin === settings.allowedOrigin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
            if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Headers': 'X-Car-Lead-Key,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }); res.end(); return; }
            if (url.pathname === '/lead-webhooks/line' || url.pathname === '/lead-webhooks/facebook') {
                const platform = url.pathname.endsWith('/line') ? 'line' : 'facebook';
                if (platform === 'facebook' && req.method === 'GET') {
                    if (url.searchParams.get('hub.mode') !== 'subscribe' || !equal(url.searchParams.get('hub.verify_token'),settings.facebookVerify)) throw error('Forbidden',403);
                    const challenge = url.searchParams.get('hub.challenge');
                    if (!challenge || challenge.length > 256) throw error('Invalid challenge');
                    res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'}); res.end(challenge); return;
                }
                if (req.method !== 'POST') throw error('Method not allowed',405);
                const secret = platform === 'line' ? settings.lineSecret : settings.facebookSecret;
                const destination = platform === 'line' ? settings.lineBotId : settings.facebookPage;
                if (!secret || !destination) throw error('ยังไม่ได้ตั้งค่าช่องทาง CAR',503);
                const raw = await rawBody(req,1024*1024);
                if (!signature(raw,req.headers[platform === 'line' ? 'x-line-signature':'x-hub-signature-256'],secret,platform)) throw error('Invalid signature',401);
                let events;
                try { events = parseEvents(platform,JSON.parse(raw.toString('utf8')),settings); } catch(e) { throw error(e.message); }
                database.receive(platform,platform === 'line' ? core.LINE_ACCOUNT : `car-fb-${settings.facebookPage}`,events);
                send(200,{received:true}); return;
            }
            if (url.pathname === '/api/lead-data/config' && req.method === 'GET') {
                send(200, { local:!settings.accessKey && ['127.0.0.1','localhost','[::1]'].includes(settings.host), lineAccount:core.LINE_ACCOUNT, lineConfigured:Boolean(settings.lineSecret && settings.lineBotId), facebookAccount:settings.facebookPage ? `car-fb-${settings.facebookPage}` : null, facebookConfigured:Boolean(settings.facebookSecret && settings.facebookPage), instagramAccount:settings.instagramAccount ? `car-ig-${settings.instagramAccount}` : null, instagramUsername:settings.instagramUsername || '', instagramConfigured:Boolean(settings.facebookPage && settings.instagramAccount && settings.instagramToken) }); return;
            }
            if (url.pathname.startsWith('/api/lead-data/')) {
                const user = authorize(settings,req);
                const action = url.pathname.split('/').pop();
                if (action === 'session' && req.method === 'GET') { send(200, user); return; }
                if (action === 'sheet-status' && req.method === 'GET') {
                    try { send(200,{contacts:await leadOptions.readLeadContacts(options.optionsFetch)}); }
                    catch (err) { throw error(err.message,502); }
                    return;
                }
                if (action === 'options' && req.method === 'GET') {
                    try { send(200,await leadOptions.readOptions(options.optionsFetch)); }
                    catch (err) { throw error(err.message,502); }
                    return;
                }
                if (action === 'sheet-leads' && req.method === 'GET') {
                    try { send(200,await sheetReader.readLeads(options.sheetFetch)); } catch(err) { throw error(err.message,502); }
                    return;
                }
                if (action === 'records' && req.method === 'GET') {
                    if (url.searchParams.get('scope') === 'intake') {
                        send(200, {leads:database.rows('leads').filter(lead => ['line','facebook','instagram'].includes(lead.source?.platform)),installations:[]}); return;
                    }
                    const archive = database.archive();
                    send(200, { leads: database.rows('leads'), installations: database.rows('installations'),archiveCounts:Object.fromEntries(Object.entries(archive).map(([name,value]) => [name,value.rows.length])) }); return;
                }
                if (action === 'legacy-archive' && req.method === 'GET') { send(200,database.archive()); return; }
                if (action === 'inbox' && req.method === 'GET') {
                    const platform = url.searchParams.get('platform');
                    if (!['line', 'facebook', 'instagram'].includes(platform)) throw error('ช่องทางไม่ถูกต้อง');
                    if (platform === 'instagram') {
                        const result = await instagramReader.conversations(settings,url.searchParams.get('cursor') || '',options.instagramFetch);
                        for (const row of result.contacts) {
                            const key = `${result.account}:${row.id}`;
                            instagramContacts.delete(key);
                            instagramContacts.set(key,row);
                        }
                        while (instagramContacts.size > 3000) instagramContacts.delete(instagramContacts.keys().next().value);
                        send(200,result); return;
                    }
                    if (platform === 'facebook' && settings.facebookToken) {
                        const result = await facebookReader.conversations(settings,url.searchParams.get('cursor') || '', options.facebookFetch);
                        for (const row of result.contacts) {
                            const key = `${result.account}:${row.id}`;
                            facebookContacts.delete(key);
                            facebookContacts.set(key, row);
                        }
                        while (facebookContacts.size > 3000) facebookContacts.delete(facebookContacts.keys().next().value);
                        send(200,result); return;
                    }
                    const account = platform === 'line' ? core.LINE_ACCOUNT : settings.facebookPage ? `car-fb-${settings.facebookPage}` : null;
                    if (!account) throw error('เพจ MHLcarfilm: รอ Page ID และสิทธิ์อ่านข้อความสำหรับระบบ CAR', 503);
                    const page = Number(url.searchParams.get('page') || 0);
                    if (!Number.isInteger(page) || page < 0 || page > 10000) throw error('เลขหน้าไม่ถูกต้อง');
                    const date = url.searchParams.get('date') || new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
                    if (platform === 'line' && settings.lineSheetEnabled) {
                        if (page === 0 && url.searchParams.get('refresh') === '1') lineSnapshot.clear();
                        let snapshot;
                        try { snapshot = await lineSnapshot.get(); }
                        catch { throw error('อ่านข้อมูล LINE จากชีตไม่สำเร็จ กรุณาลองรีเฟรชอีกครั้ง',502); }
                        const contacts = database.inbox(platform,account,page);
                        await enrich(settings,database,platform,contacts);
                        contacts.forEach(row => database.lineMessageDays(row,snapshot.startedAt));
                        send(200,{contacts,account,page,summary:null,configured:true,source:'line-daily',historyStartedAt:snapshot.startedAt,total:snapshot.total}); return;
                    }
                    const contacts = database.inbox(platform,account,page);
                    await enrich(settings,database,platform,contacts);
                    contacts.forEach(row => database.activityDays(row));
                    for (const row of contacts) row.customer_type = core.customerTag(row.first_seen_at, row.last_seen_at);
                    send(200, { contacts, account, page, summary:database.daily(platform,account,date),configured:platform === 'line' ? Boolean(settings.lineSecret && settings.lineBotId) : Boolean(settings.facebookSecret && settings.facebookPage) }); return;
                }
                if (action === 'legacy-preview' && req.method === 'GET') {
                    const sheets = ['Customer','Bookings','data','Detail_film','PayIn'];
                    const results = await Promise.all(sheets.map(async sheet => {
                        const response = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`, { signal: AbortSignal.timeout(30000) });
                        if (!response.ok) throw error(`อ่านประวัติ CAR CRM ตาราง ${sheet} ไม่สำเร็จ`, 502);
                        const text = await response.text();
                        if (/^\s*</.test(text)) throw error('Google Sheets ไม่ได้ส่งข้อมูล CSV กรุณาตรวจสิทธิ์อ่าน', 502);
                        return core.csv(text);
                    }));
                    if (results[1].length && !Object.keys(results[1][0]).includes('JobID')) throw error('ไม่พบคอลัมน์ JobID ในประวัติ', 502);
                    send(200, { items:core.legacyPreview(results[0],results[1],Object.fromEntries(sheets.slice(2).map((name,i) => [name,results[i+2]]))),sources:Object.fromEntries(sheets.map((name,i) => [name,results[i]])) }); return;
                }
                if (req.method === 'POST') {
                    const input = await body(req);
                    if (action === 'lead') { send(200, database.transaction(() => database.saveLead(input, user.id))); return; }
                    if (action === 'installation') { send(200, database.transaction(() => database.saveInstallation(input, user.id))); return; }
                    if (action === 'import-legacy') { send(200, database.importLegacy(input.items,user.id,input.sources)); return; }
                    if (action === 'select' || action === 'contact-tag') {
                        const platform = input.platform;
                        if (!['line','facebook','instagram'].includes(platform)) throw error('ช่องทางไม่ถูกต้อง');
                        const account = platform === 'instagram' ? settings.instagramAccount && `car-ig-${settings.instagramAccount}` : platform === 'line' ? core.LINE_ACCOUNT : settings.facebookPage ? `car-fb-${settings.facebookPage}` : null;
                        if (!account) throw error('ยังไม่ได้ตั้งค่า Facebook ของ CAR', 503);
                        if (typeof input.contactId !== 'string' || input.contactId.length > 500) throw error('รหัสผู้ติดต่อไม่ถูกต้อง');
                        const row = platform === 'instagram' ? instagramContacts.get(`${account}:${input.contactId}`) : platform === 'facebook' && settings.facebookToken ? facebookContacts.get(`${account}:${input.contactId}`) : database.contact(input.contactId);
                        const userId = platform === 'instagram' ? row?.instagram_user_id : platform === 'line' ? row?.line_user_id : row?.facebook_user_id;
                        if (!row || row.account_key !== account || !userId) throw error('ไม่พบผู้ติดต่อของ CAR',404);
                        if (action === 'contact-tag') {
                            send(200,database.transaction(() => database.tagContact(platform,account,userId,input.customerType,user.id))); return;
                        }
                        const source = { platform, account, userId,
                            displayName: row.display_name, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, contactId: row.id };
                        send(200, database.transaction(() => database.saveLead(input.lead || {}, user.id, source))); return;
                    }
                }
                throw error('ไม่พบ API', 404);
            }
            if (req.method !== 'GET') throw error('ไม่รองรับวิธีนี้', 405);
            const name = url.pathname === '/' ? 'lead-data.html' : url.pathname === '/favicon.ico' ? 'images/car-crm-app.ico' : decodeURIComponent(url.pathname.slice(1));
            if (!staticFiles.has(name) && !/^images\/favicon[\w-]*\.svg$/.test(name)) throw error('ไม่พบหน้า', 404);
            if (!fs.existsSync(path.join(ROOT, name))) throw error('ไม่พบหน้า', 404);
            if (name.endsWith('.html') && name !== 'crm-login.html') {
                const session = crmAuth.session(req);
                if (!session || name === 'technician-commission.html' && !crmAuth.hasCommission(req)) {
                    res.writeHead(302, {Location:'crm-login.html?next=' + encodeURIComponent(name + url.search + url.hash), 'Cache-Control':'no-store'});
                    res.end(); return;
                }
            }
            const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json; charset=utf-8' };
            res.writeHead(200, { 'Content-Type': mime[path.extname(name)], 'Cache-Control': 'no-store' });
            res.end(fs.readFileSync(path.join(ROOT, name)));
        } catch (e) { send(e.status || 500, { error: e.status ? e.message : 'ระบบลีดทำงานไม่สำเร็จ กรุณาลองใหม่', ...(typeof e.code === 'string' && e.code.startsWith('INSTAGRAM_') ? {code:e.code} : {}) }); }
    });
}
if (require.main === module) {
    const settings = config();
    if (settings.accessKey && settings.accessKey.length < 32) throw new Error('CAR_LEAD_ACCESS_KEY ต้องมีอย่างน้อย 32 ตัวอักษร');
    if (!['127.0.0.1','localhost','[::1]'].includes(settings.host) && !settings.accessKey) throw new Error('ตั้ง CAR_LEAD_ACCESS_KEY ก่อนเปิดระบบผ่านเครือข่าย');
    const database = store(settings.database);
    const server = createServer(settings, database, {reloadChannels:true});
    server.listen(settings.port, settings.host, () => console.log(`CAR lead service: http://${settings.host}:${settings.port}/lead-data.html`));
}
module.exports = { store, config, authorize, createServer, signature, parseEvents };
