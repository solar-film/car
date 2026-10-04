'use strict';
// Isolated review preparation. No main CRM server, database or sheet imports.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createTestWebhook, verifyWebhookRecipient, WEBHOOK_PATH } = require('../../instagram-review/webhook.cjs');
const { readTestThreadOwner, changeTestThread } = require('../../instagram-review/thread.cjs');

const BUSINESS_PAGE = '109607531869658';
const BUSINESS_ACCOUNT = '17841458662245781';
const BUSINESS_USERNAME = 'mhlcarfilm';
const TESTER_USERNAME = 'crazyoilly';
const FIXED_REPLY = 'ทดสอบเชื่อมต่อ CAR CRM สำหรับขอสิทธิ์ Meta';
const SESSION_TTL = 2 * 60 * 60 * 1000;
const VERIFIED_TTL = 5 * 60 * 1000;
const assets = new Map([
    ['/', ['index.html', 'text/html']],
    ['/review.js', ['review.js', 'text/javascript']],
    ['/review.css', ['review.css', 'text/css']]
]);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function equal(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const left = Buffer.from(a), right = Buffer.from(b);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function settingsFromEnv(env = process.env) {
    return {
        reviewKey: env.CAR_IG_REVIEW_KEY || '',
        publicOrigin: env.CAR_IG_REVIEW_ORIGIN || '',
        allowLocal: env.CAR_IG_REVIEW_ALLOW_LOCAL === '1',
        instagramToken: env.CAR_IG_REVIEW_PAGE_TOKEN || '',
        appSecret: env.CAR_IG_REVIEW_APP_SECRET || '',
        verifyToken: env.CAR_IG_REVIEW_VERIFY_TOKEN || '',
        allowReply: env.CAR_IG_REVIEW_ALLOW_REPLY === '1',
        allowThreadControl: env.CAR_IG_REVIEW_ALLOW_THREAD_CONTROL === '1',
        facebookPage: BUSINESS_PAGE,
        instagramAccount: BUSINESS_ACCOUNT,
        host: env.CAR_IG_REVIEW_HOST || '127.0.0.1',
        port: Number(env.PORT || env.CAR_IG_REVIEW_PORT || 3096)
    };
}

function validateSettings(input) {
    const settings = { ...input };
    if (typeof settings.reviewKey !== 'string' || settings.reviewKey.length < 32 || settings.reviewKey.length > 256) {
        throw new Error('Set a dedicated CAR_IG_REVIEW_KEY of 32 to 256 characters before startup.');
    }
    let origin;
    try { origin = new URL(settings.publicOrigin); } catch { throw new Error('Set CAR_IG_REVIEW_ORIGIN to the exact reviewer HTTPS origin.'); }
    if (origin.origin !== settings.publicOrigin || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
        throw new Error('The reviewer origin must contain only its scheme, hostname and optional port.');
    }
    const local = settings.allowLocal === true && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname);
    if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && local)) throw new Error('HTTPS is required; HTTP is permitted only with explicit local testing.');
    if (settings.allowLocal && !local) throw new Error('Local mode requires an exact loopback origin.');
    if (settings.facebookPage !== BUSINESS_PAGE || settings.instagramAccount !== BUSINESS_ACCOUNT) throw new Error('This reviewer is restricted to the configured @mhlcarfilm business account.');
    if (typeof settings.instagramToken !== 'string') throw new Error('Invalid server-side Instagram token configuration.');
    if (settings.appSecret && !/^[a-fA-F0-9]{32}$/.test(settings.appSecret)) throw new Error('Invalid server-side App Secret configuration.');
    if (settings.verifyToken && (typeof settings.verifyToken !== 'string' || settings.verifyToken.length < 32 || settings.verifyToken.length > 256)) throw new Error('Use a dedicated webhook verification token of 32 to 256 characters.');
    if (settings.allowThreadControl && !settings.allowReply) throw new Error('Thread control requires explicitly enabled fixed-reply testing.');
    if (settings.allowReply && (!settings.instagramToken || !settings.appSecret || !settings.verifyToken)) throw new Error('Fixed-reply testing requires server-side Page token, App Secret and webhook verification token.');
    return Object.freeze({ ...settings, expectedHost: origin.host, allowReply: settings.allowReply === true, allowThreadControl: settings.allowThreadControl === true });
}

async function confirmBody(req) {
    if (req.headers['content-type'] !== 'application/json') throw fail('Only a JSON confirmation is accepted.', 415);
    let raw = '';
    for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 128) throw fail('Request too large.', 413);
    }
    let value;
    try { value = JSON.parse(raw); } catch { throw fail('Invalid JSON confirmation.'); }
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || value.confirm !== true) {
        throw fail('Confirm the displayed fixed test. Recipients and message text cannot be supplied.');
    }
}

// Copied from the local helper's pure send routine, with sanitized errors and no config import.
async function sendFixedReply(settings, recipient, fetchImpl, now) {
    const received = Date.parse(recipient?.receivedAt);
    if (recipient?.username !== TESTER_USERNAME || !/^\d{5,30}$/.test(recipient.recipientId || '') || !Number.isFinite(received) || now - received < 0 || now - received >= VERIFIED_TTL) {
        throw fail('A new verified Test from the approved tester is required.', 409);
    }
    let response, result;
    try {
        response = await fetchImpl(`https://graph.facebook.com/v25.0/${BUSINESS_PAGE}/messages`, {
            method: 'POST', redirect: 'error',
            headers: { Authorization: `Bearer ${settings.instagramToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient: { id: recipient.recipientId }, message: { text: FIXED_REPLY } }),
            signal: AbortSignal.timeout(20000)
        });
        result = await response.json();
    } catch {
        const error = fail('The send result is uncertain. Check the Instagram chat; this session cannot send again.', 502);
        error.uncertain = true; throw error;
    }
    if (!response.ok || result.error) throw fail('Meta rejected the fixed test reply. This session cannot send again.', 502);
    if (String(result.recipient_id) !== recipient.recipientId || typeof result.message_id !== 'string' || !result.message_id) {
        const error = fail('The send result is incomplete. Check the Instagram chat; this session cannot send again.', 502);
        error.uncertain = true; throw error;
    }
    return { sent: true };
}

function createReviewerServer(input, { fetchImpl = fetch, now = Date.now, scheduleExpiry = true } = {}) {
    const settings = validateSettings(input), started = now();
    let verified = null, sendState = 'idle', threadState = 'idle', operation = false, ending = false;
    let operationDone = Promise.resolve(), finishOperation, cleanupPromise = null;
    function beginOperation() { operation = true; operationDone = new Promise(resolve => { finishOperation = resolve; }); }
    function endOperation() { operation = false; finishOperation(); finishOperation = null; }
    const expires = () => now() - started >= SESSION_TTL;
    const webhookConfigured = Boolean(settings.appSecret && settings.verifyToken && settings.instagramToken);
    const webhook = createTestWebhook({
        getSettings: () => settings, getSecret: () => webhookConfigured ? settings.appSecret : '',
        verifyToken: settings.verifyToken, fetchImpl, now,
        onVerified: value => {
            if (!ending && !expires() && sendState === 'idle' && threadState === 'idle' && !operation) verified = { ...value, checkedAt: now() };
        }
    });

    async function strictThreadFetch(url, options) {
        const response = await fetchImpl(url, options), value = await response.json();
        if (response.ok && !value.error && new URL(url).pathname.endsWith('/thread_owner') && Array.isArray(value.data) && value.data.length) {
            const appId = value.data[0]?.thread_owner?.app_id;
            if (!/^\d{5,30}$/.test(String(appId || ''))) throw fail('Meta returned an unconfirmed test thread owner.', 502);
        }
        return { ok: response.ok, status: response.status, json: async () => value };
    }

    async function releaseThread() {
        if (!verified || !['controlled', 'unknown'].includes(threadState)) return;
        try {
            const owner = await readTestThreadOwner(settings, verified, strictThreadFetch, now());
            if (owner !== 'crm') { threadState = 'released'; return; }
            threadState = 'releasing';
            await changeTestThread(settings, verified, 'release', fetchImpl, now());
            threadState = 'released';
        } catch { threadState = 'unknown'; }
    }

    function endSession() {
        // Stop new operations first, then wait for a pending takeover/send before releasing.
        ending = true;
        if (cleanupPromise) return cleanupPromise;
        cleanupPromise = (async () => {
            await operationDone;
            await releaseThread();
            if (!['taking', 'controlled', 'releasing', 'unknown'].includes(threadState)) verified = null;
            return { threadState, releaseConfirmed: !['taking', 'controlled', 'releasing', 'unknown'].includes(threadState) };
        })().finally(() => { cleanupPromise = null; });
        return cleanupPromise;
    }

    function requireVerified() {
        if (!verified || verified.source !== 'webhook' || now() - verified.checkedAt < 0 || now() - verified.checkedAt >= VERIFIED_TTL || now() - Date.parse(verified.receivedAt) < 0 || now() - Date.parse(verified.receivedAt) >= VERIFIED_TTL) {
            throw fail('Send a new Test from @crazyoilly after the reviewer receiver starts.', 409);
        }
        return { ...verified };
    }

    const server = http.createServer(async (req, res) => {
        function json(status, value) {
            res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify(value));
        }
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
        try {
            if (req.headers.host !== settings.expectedHost) throw fail('Host rejected.', 403);
            if (settings.allowLocal && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw fail('Loopback access only.', 403);
            const url = new URL(req.url, settings.publicOrigin);
            if (url.origin !== settings.publicOrigin) throw fail('Request origin rejected.', 403);
            if (url.pathname === WEBHOOK_PATH) {
                if (ending || expires()) throw fail('The review test session has expired.', 410);
                // The shared receiver authenticates raw payloads with HMAC before considering a fixed Test.
                webhook.emit('request', req, res); return;
            }
            if (url.search || url.hash) throw fail('Query parameters are not accepted.');
            if (req.headers.origin && req.headers.origin !== settings.publicOrigin) throw fail('Origin rejected.', 403);
            if (url.pathname === '/healthz' && req.method === 'GET') { json(200, { service: 'car-instagram-review', alive: true }); return; }
            const asset = assets.get(url.pathname);
            if (asset && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8`, 'Cache-Control': 'no-store' });
                res.end(fs.readFileSync(path.join(__dirname, asset[0]))); return;
            }
            if (!url.pathname.startsWith('/api/')) throw fail('Not found.', 404);
            if (!equal(req.headers['x-car-review-key'], settings.reviewKey)) throw fail('Enter the dedicated reviewer access key.', 401);
            if (url.pathname === '/api/status' && req.method === 'GET') {
                const expired = ending || expires();
                json(200, {
                    service: 'Isolated CAR Instagram review test', business: BUSINESS_USERNAME, tester: TESTER_USERNAME,
                    fixedReply: FIXED_REPLY, webhookConfigured, replyAllowed: settings.allowReply,
                    threadControlAllowed: settings.allowThreadControl, sendState, threadState,
                    expired, testVerified: !expired && Boolean(verified), receivedAt: verified?.receivedAt || null,
                    expiresInSeconds: Math.max(0, Math.floor((started + SESSION_TTL - now()) / 1000))
                }); return;
            }
            const cleanupRoute = url.pathname === '/api/release-test-thread' && req.method === 'POST';
            if ((ending || expires()) && !cleanupRoute) throw fail('The review test session has expired. Contact the app owner.', 410);
            if (!['/api/verify', '/api/take-test-thread', '/api/release-test-thread', '/api/send-fixed-reply'].includes(url.pathname)) throw fail('Not found.', 404);
            if (req.method !== 'POST') throw fail('Method not allowed.', 405);
            if (req.headers.origin !== settings.publicOrigin) throw fail('A same-origin confirmation is required.', 403);
            await confirmBody(req);
            if ((ending || expires()) && cleanupRoute) {
                const result = await endSession();
                json(result.releaseConfirmed ? 200 : 502, result); return;
            }
            if (ending || expires()) throw fail('The review test session has expired. Contact the app owner.', 410);
            if (operation) throw fail('A test operation is already running.', 409);
            if (url.pathname === '/api/release-test-thread') {
                beginOperation();
                try { await releaseThread(); json(threadState === 'unknown' ? 502 : 200, { threadState }); }
                finally { endOperation(); }
                return;
            }
            if (sendState !== 'idle') throw fail('This session has already attempted a reply and cannot send again.', 409);
            if (url.pathname !== '/api/verify' && !settings.allowReply) throw fail('Fixed-reply testing is disabled by the owner.', 403);
            if (url.pathname === '/api/take-test-thread' && !settings.allowThreadControl) throw fail('Thread takeover is disabled by the owner.', 403);
            const recipient = requireVerified();
            beginOperation();
            try {
                const fresh = await verifyWebhookRecipient(settings, recipient, fetchImpl, now());
                if (fresh.recipientId !== recipient.recipientId) throw fail('Tester identity changed.', 409);
                if (ending || expires()) throw fail('The review session ended during sender verification.', 410);
                if (url.pathname === '/api/verify') {
                    verified = { ...fresh, checkedAt: now() };
                    json(200, { verified: true, business: BUSINESS_USERNAME, tester: TESTER_USERNAME, receivedAt: fresh.receivedAt }); return;
                }
                if (url.pathname === '/api/take-test-thread') {
                    if (threadState !== 'idle') throw fail('The test thread already has a control operation.', 409);
                    threadState = 'taking';
                    try { await changeTestThread(settings, fresh, 'take', fetchImpl, now()); threadState = 'controlled'; json(200, { threadState }); }
                    catch (error) { threadState = error.uncertain ? 'unknown' : 'idle'; await releaseThread(); throw error; }
                    return;
                }
                // Lock before the request. Rejections and uncertain results remain locked, too.
                sendState = 'sending';
                try {
                    await sendFixedReply(settings, fresh, fetchImpl, now()); sendState = 'sent';
                    await releaseThread(); json(200, { sent: true, fixedReply: FIXED_REPLY, threadState });
                } catch (error) {
                    sendState = error.uncertain ? 'unknown' : 'failed'; await releaseThread(); throw error;
                }
            } finally { endOperation(); }
        } catch (error) {
            // Do not relay upstream payloads, credentials, usernames from outsiders, or local paths.
            json(error.status || 502, { error: error.status ? error.message : 'The isolated test could not complete. Contact the app owner.' });
        }
    });
    server.requestTimeout = 10000;
    server.headersTimeout = 10000;
    server.reviewCleanup = endSession;
    if (scheduleExpiry) {
        const expiry = setTimeout(() => {
            void endSession().then(result => { if (!result.releaseConfirmed) console.error('Expired test: thread release not confirmed. Owner must check conversation control before another test.'); });
        }, SESSION_TTL);
        expiry.unref(); server.on('close', () => clearTimeout(expiry));
    }
    return server;
}

if (require.main === module) {
    const settings = settingsFromEnv();
    const server = createReviewerServer(settings);
    if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) throw new Error('Invalid reviewer port.');
    server.listen(settings.port, settings.host, () => console.log('Isolated CAR Instagram reviewer service started. No main CRM data routes.'));
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
        const deadline = setTimeout(() => {
            console.error('Shutdown cleanup exceeded its deadline. The owner must check conversation control before another test.');
            process.exit(1);
        }, 95000); deadline.unref();
        void server.reviewCleanup().then(result => {
            if (!result.releaseConfirmed) console.error('Test thread release was not confirmed. The owner must check Meta conversation control before another test.');
        }).finally(() => server.close(() => process.exit(0)));
    });
}

module.exports = { createReviewerServer, settingsFromEnv, validateSettings, FIXED_REPLY, BUSINESS_PAGE, BUSINESS_ACCOUNT, SESSION_TTL, WEBHOOK_PATH };
