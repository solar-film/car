'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function passwordHash(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    return salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
}
function verify(password, hash) {
    if (typeof password !== 'string' || password.length > 256 || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash || '')) return false;
    const [salt, value] = hash.split(':');
    return crypto.timingSafeEqual(crypto.scryptSync(password, salt, 64), Buffer.from(value, 'hex'));
}
function config(root, env) {
    const file = path.join(root, '.crm-auth.json');
    const privateSettings = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    return {
        username: env.CAR_CRM_AUTH_USER || privateSettings.username || '',
        passwordHash: env.CAR_CRM_AUTH_PASSWORD_HASH || privateSettings.passwordHash || '',
        commissionHash: env.CAR_CRM_AUTH_COMMISSION_HASH || privateSettings.commissionHash || '',
        publicOrigin: env.CAR_CRM_PUBLIC_ORIGIN || ''
    };
}
function createAuth(settings = {}, options = {}) {
    const now = options.now || Date.now;
    const sessions = new Map(), failures = new Map();
    const ttl = 12 * 60 * 60 * 1000, commissionTtl = 30 * 60 * 1000;
    const configured = /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(settings.passwordHash || '') && !!settings.username;
    if (settings.publicOrigin) {
        const origin = new URL(settings.publicOrigin);
        if (origin.protocol !== 'https:' || origin.origin !== settings.publicOrigin || origin.username || origin.password) throw new Error('CAR_CRM_PUBLIC_ORIGIN must be an exact HTTPS origin');
    }
    function originFor(req) {
        if (settings.publicOrigin) {
            if (req.headers.host !== new URL(settings.publicOrigin).host) return null;
            return settings.publicOrigin;
        }
        if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host || '')) return null;
        if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return null;
        return 'http://' + req.headers.host;
    }
    function session(req) {
        const cookies = String(req.headers.cookie || '').split(';').map(value => value.trim());
        const token = cookies.find(value => value.startsWith('carCrmSession='))?.slice('carCrmSession='.length);
        const value = sessions.get(token);
        if (!originFor(req) || !value || value.until <= now()) { if (token) sessions.delete(token); return null; }
        return value;
    }
    function cookie(req, value, maxAge) {
        return 'carCrmSession=' + value + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAge + (originFor(req)?.startsWith('https:') ? '; Secure' : '');
    }
    async function handle(req, res, url, readBody, send) {
        if (!url.pathname.startsWith('/api/crm-auth/')) return false;
        res.setHeader('X-Content-Type-Options','nosniff');
        const origin = originFor(req);
        if (!origin || req.headers.origin && req.headers.origin !== origin) { send(403,{error:'ไม่อนุญาต origin นี้'}); return true; }
        if (!configured) { send(503,{error:'ยังไม่ได้ตั้งค่าล็อกอินบนเซิร์ฟเวอร์ CAR_CRM'}); return true; }
        const action = url.pathname.slice('/api/crm-auth/'.length);
        if (action === 'session' && req.method === 'GET') {
            const value = session(req);
            send(200,{authenticated:!!value,commission:!!value && value.commissionUntil > now()}); return true;
        }
        if (req.method !== 'POST' || req.headers.origin !== origin || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
            send(403,{error:'ต้องเรียกคำสั่งจากหน้า CAR_CRM เดียวกัน'}); return true;
        }
        if (!['login','commission','logout'].includes(action)) { send(404,{error:'ไม่พบ API'}); return true; }
        if (action === 'logout') {
            const token = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('carCrmSession='))?.slice(14);
            if (token) sessions.delete(token);
            res.setHeader('Set-Cookie',cookie(req,'',0)); send(200,{authenticated:false}); return true;
        }
        const value = session(req);
        if (action === 'commission' && !value) { send(401,{error:'กรุณาล็อกอิน CAR_CRM ก่อน'}); return true; }
        const key = req.socket.remoteAddress + ':' + action;
        for (const [k, entry] of failures) if (entry.until <= now()) failures.delete(k);
        const attempts = failures.get(key) || {count:0,until:now()+10*60*1000};
        if (attempts.count >= 10) { send(429,{error:'ลองรหัสผ่านผิดหลายครั้ง กรุณารอ 10 นาที'}); return true; }
        const input = await readBody(req,4096);
        const allowed = action === 'login'
            ? typeof input.user === 'string' && input.user.trim() === settings.username && verify(input.password,settings.passwordHash)
            : verify(input.password,settings.commissionHash);
        if (!allowed) {
            attempts.count++; failures.set(key,attempts); send(401,{error:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'}); return true;
        }
        failures.delete(key);
        if (action === 'commission') { value.commissionUntil = now()+commissionTtl; send(200,{authenticated:true,commission:true}); return true; }
        for (const [token, old] of sessions) if (old.until <= now()) sessions.delete(token);
        if (sessions.size >= 1000) { send(503,{error:'มี session มากเกินไป กรุณาลองใหม่ภายหลัง'}); return true; }
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(token,{until:now()+ttl,commissionUntil:0});
        res.setHeader('Set-Cookie',cookie(req,token,ttl/1000)); send(200,{authenticated:true,commission:false}); return true;
    }
    return {handle,session,configured,hasCommission:req => {const value = session(req); return !!value && value.commissionUntil > now();}};
}
module.exports = {passwordHash,verify,config,createAuth};
