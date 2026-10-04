'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const {
    createReviewerServer, settingsFromEnv, validateSettings, FIXED_REPLY,
    BUSINESS_PAGE, BUSINESS_ACCOUNT, SESSION_TTL, WEBHOOK_PATH
} = require('./server.cjs');

// All credentials and Graph responses below are fixtures. No real external requests are made.
const ORIGIN = 'https://isolated-review.example.test';
const KEY = 'fixture-review-key-'.repeat(3);
const SECRET = 'a'.repeat(32);
const VERIFY = 'fixture-webhook-verification-'.repeat(2);
const TOKEN = 'fixture-private-token-not-real';
const TESTER_ID = '987654321012345';
const defaults = {
    reviewKey: KEY, publicOrigin: ORIGIN, allowLocal: false,
    instagramToken: TOKEN, appSecret: SECRET, verifyToken: VERIFY,
    allowReply: false, allowThreadControl: false,
    facebookPage: BUSINESS_PAGE, instagramAccount: BUSINESS_ACCOUNT
};
const headers = { Host: new URL(ORIGIN).host, Origin: ORIGIN, 'X-Car-Review-Key': KEY };
const response = value => ({ ok: !value.error, status: value.error ? 400 : 200, json: async () => value });
let mid = 0;

function localRequest(url, { method = 'GET', headers: requestHeaders = {}, body } = {}) {
    const target = new URL(url);
    assert.equal(target.hostname, '127.0.0.1', 'Fixture transport is loopback only.');
    return new Promise((resolve, reject) => {
        const req = http.request(target, { method, headers: requestHeaders }, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers })));
            res.on('error', reject);
        });
        req.on('error', reject); req.end(body);
    });
}

async function fixture(t, { settings = {}, graphOutcome = 'success', profile = 'crazyoilly', linkedAccount = BUSINESS_ACCOUNT, delayedSend = null, delayedTake = null, delayedReverify = null, releaseFailures = 0, malformedOwners = 0 } = {}) {
    let current = Date.now(), owner = 'other', accountChecks = 0;
    const calls = [];
    const fetchImpl = async (url, options) => {
        const parsed = new URL(url);
        assert.equal(parsed.origin, 'https://graph.facebook.com');
        assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
        assert.equal(parsed.href.includes(TOKEN), false);
        calls.push({ url: parsed, options });
        if (parsed.pathname.endsWith('/me')) {
            if (++accountChecks > 1 && delayedReverify) await delayedReverify;
            return response({ id: BUSINESS_PAGE, instagram_business_account: { id: linkedAccount, username: 'mhlcarfilm' } });
        }
        if (parsed.pathname.endsWith('/' + TESTER_ID)) return response({ username: profile });
        if (parsed.pathname.endsWith('/take_thread_control')) { if (delayedTake) await delayedTake; owner = 'crm'; return response({ success: true }); }
        if (parsed.pathname.endsWith('/thread_owner')) {
            assert.equal(parsed.searchParams.get('recipient'), TESTER_ID);
            if (malformedOwners-- > 0) return response({ data: [{ thread_owner: {} }] });
            return response({ data: [{ thread_owner: { app_id: owner === 'crm' ? '1703232694436408' : '1217981644879628' } }] });
        }
        if (parsed.pathname.endsWith('/release_thread_control')) {
            if (releaseFailures-- > 0) return response({ error: { code: 100, message: TOKEN } });
            owner = 'other'; return response({ success: true });
        }
        if (parsed.pathname.endsWith('/messages') && options.method === 'POST') {
            if (delayedSend) await delayedSend;
            if (graphOutcome === 'ambiguous') throw new Error('Disconnected after possibly sending; ' + TOKEN);
            if (graphOutcome === 'rejected') return response({ error: { message: TOKEN + ' raw private response', code: 100 } });
            return response({ recipient_id: TESTER_ID, message_id: 'fixture-message-result' });
        }
        assert.fail('Unexpected Graph API fixture request: ' + parsed.pathname);
    };
    const server = createReviewerServer({ ...defaults, ...settings }, { fetchImpl, now: () => current, scheduleExpiry: false });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = (route, extra = {}) => localRequest(base + route, { headers: { ...headers, ...extra } });
    const post = (route, input = { confirm: true }, extra = {}) => localRequest(base + route, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(input)
    });
    const status = async () => (await get('/api/status')).json();
    async function deliver(overrides = {}, signature = true) {
        const event = {
            sender: { id: TESTER_ID }, recipient: { id: BUSINESS_ACCOUNT }, timestamp: current,
            message: { mid: 'fixture-mid-' + (++mid), text: 'Test' }, ...overrides
        };
        const raw = JSON.stringify({ object: 'instagram', entry: [{ id: BUSINESS_ACCOUNT, messaging: [event] }] });
        const signed = 'sha256=' + (signature ? crypto.createHmac('sha256', SECRET).update(raw).digest('hex') : '0'.repeat(64));
        return localRequest(base + WEBHOOK_PATH, { method: 'POST', headers: { Host: headers.Host, 'X-Hub-Signature-256': signed }, body: raw });
    }
    async function waitVerified() {
        for (let i = 0; i < 30; i++) {
            if ((await status()).testVerified) return;
            await new Promise(resolve => setImmediate(resolve));
        }
        assert.fail('The fixture Test did not become verified.');
    }
    return { base, server, calls, get, post, status, deliver, waitVerified, advance: ms => { current += ms; }, owner: () => owner };
}

test('startup requires a distinct strong key and exact HTTPS origin; optional sends are off', () => {
    assert.throws(() => validateSettings({ ...defaults, reviewKey: '' }), /32 to 256/);
    assert.throws(() => validateSettings({ ...defaults, reviewKey: 'short' }), /32 to 256/);
    for (const publicOrigin of ['https://review.example.test/path', 'https://review.example.test/', 'http://review.example.test', 'https://x:y@review.example.test']) {
        assert.throws(() => validateSettings({ ...defaults, publicOrigin }));
    }
    assert.throws(() => validateSettings({ ...defaults, publicOrigin: 'http://127.0.0.1:3096' }), /HTTPS/);
    assert.equal(validateSettings({ ...defaults, publicOrigin: 'http://127.0.0.1:3096', allowLocal: true }).expectedHost, '127.0.0.1:3096');
    assert.throws(() => validateSettings({ ...defaults, facebookPage: '123456' }), /restricted/);
    assert.throws(() => validateSettings({ ...defaults, allowThreadControl: true }), /requires/);
    assert.throws(() => validateSettings({ ...defaults, allowReply: true, appSecret: '' }), /server-side/);
    const empty = settingsFromEnv({});
    assert.equal(empty.allowReply, false); assert.equal(empty.allowThreadControl, false);
    assert.equal(empty.reviewKey, ''); assert.equal(empty.instagramToken, '');
});

test('all review API data is authenticated; keys in URL, other hosts and origins fail', async t => {
    const f = await fixture(t);
    assert.equal((await f.get('/api/status', { 'X-Car-Review-Key': '' })).status, 401);
    assert.equal((await f.get('/api/status', { 'X-Car-Review-Key': 'wrong' })).status, 401);
    assert.equal((await f.get('/api/status?key=' + KEY)).status, 400);
    assert.equal((await f.get('/api/status', { Host: 'untrusted.example' })).status, 403);
    assert.equal((await f.get('/api/status', { Origin: 'https://untrusted.example' })).status, 403);
    assert.equal((await localRequest(f.base + '/api/status', { method: 'OPTIONS', headers })).status, 404);
    assert.equal((await f.get('/')).status, 200);
    assert.equal((await f.get('/healthz')).status, 200);
    assert.equal(f.calls.length, 0);
});

test('status contains no access key, webhook token, App Secret, Meta token or outsider IDs', async t => {
    const f = await fixture(t), raw = await (await f.get('/api/status')).text();
    for (const secret of [KEY, SECRET, VERIFY, TOKEN, TESTER_ID]) assert.equal(raw.includes(secret), false);
    assert.equal(Object.hasOwn(JSON.parse(raw), 'reviewKey'), false);
    assert.equal(Object.hasOwn(JSON.parse(raw), 'verifyToken'), false);
    for (const route of ['/api/lead-data/records', '/api/sheet-leads', '/api/legacy-archive', '/api/review-secret', '/api/save-recording', '/lead-data.env', '/tools/instagram-review/server.cjs']) {
        assert.equal((await f.get(route)).status, 404, route);
    }
    assert.equal(f.calls.length, 0);
});

test('POSTs require same-origin JSON confirmation and reject custom recipient or body', async t => {
    const f = await fixture(t);
    assert.equal((await f.post('/api/verify', { confirm: true }, { Origin: '' })).status, 403);
    assert.equal((await f.post('/api/verify', { confirm: true }, { Origin: 'https://untrusted.example' })).status, 403);
    assert.equal((await f.post('/api/verify', { confirm: true }, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await f.post('/api/verify', { confirm: true, recipient: 'someone-else' })).status, 400);
    assert.equal((await f.post('/api/send-fixed-reply', { confirm: true, message: 'arbitrary' })).status, 400);
    assert.equal((await f.post('/api/verify', { confirm: false })).status, 400);
    assert.equal((await f.get('/api/verify')).status, 405);
    assert.equal(f.calls.length, 0);
});

test('webhook handshake is exact and unsigned or unrelated messages cannot become a Test', async t => {
    const f = await fixture(t);
    const good = await f.get(WEBHOOK_PATH + '?hub.mode=subscribe&hub.verify_token=' + VERIFY + '&hub.challenge=1234');
    assert.equal(good.status, 200); assert.equal(await good.text(), '1234');
    assert.equal((await f.get(WEBHOOK_PATH + '?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1234')).status, 403);
    assert.equal((await f.deliver({}, false)).status, 403);
    assert.equal((await f.deliver({ message: { mid: 'ordinary-private-message', text: 'Customer private content' } })).status, 200);
    assert.equal((await f.deliver({ recipient: { id: '17841400000000000' } })).status, 200);
    assert.equal((await f.deliver({ timestamp: 1 })).status, 200);
    assert.equal((await f.status()).testVerified, false); assert.equal(f.calls.length, 0);
});

test('an outsider username or wrong business account is not retained as a verified tester', async t => {
    for (const override of [{ profile: 'outsider-private-name' }, { linkedAccount: '17841400000000000' }]) {
        const f = await fixture(t, override);
        await f.deliver();
        for (let i = 0; i < 10; i++) { await f.status(); await new Promise(resolve => setImmediate(resolve)); }
        const raw = JSON.stringify(await f.status());
        assert.equal(JSON.parse(raw).testVerified, false);
        assert.equal(raw.includes('outsider-private-name'), false); assert.equal(raw.includes(TESTER_ID), false);
        assert.equal((await f.post('/api/verify')).status, 409);
    }
});

test('approved signed Test can be verified in readonly mode without enabling sends or thread takeover', async t => {
    const f = await fixture(t);
    assert.equal((await f.deliver()).status, 200); await f.waitVerified();
    const verified = await f.post('/api/verify'); assert.equal(verified.status, 200);
    const result = await verified.json(); assert.equal(result.tester, 'crazyoilly'); assert.equal(result.verified, true);
    assert.equal(Object.hasOwn(result, 'recipientId'), false);
    assert.equal((await f.post('/api/send-fixed-reply')).status, 403);
    assert.equal((await f.post('/api/take-test-thread')).status, 403);
    assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 0);
});

test('verified Test must be less than five minutes old; session and receiver expire after two hours', async t => {
    const f = await fixture(t);
    await f.deliver(); await f.waitVerified(); f.advance(5 * 60 * 1000);
    assert.equal((await f.post('/api/verify')).status, 409);
    f.advance(SESSION_TTL);
    const expiredStatus = await f.get('/api/status');
    assert.equal(expiredStatus.status, 200); assert.equal((await expiredStatus.json()).expired, true);
    assert.equal((await f.deliver()).status, 410);
    assert.equal((await f.get('/healthz')).status, 200);
});

for (const graphOutcome of ['success', 'rejected', 'ambiguous']) test(`fixed tester reply is single-use and releases control after ${graphOutcome}`, async t => {
    const f = await fixture(t, { settings: { allowReply: true, allowThreadControl: true }, graphOutcome });
    await f.deliver(); await f.waitVerified();
    assert.equal((await f.post('/api/take-test-thread')).status, 200);
    const sent = await f.post('/api/send-fixed-reply');
    assert.equal(sent.status, graphOutcome === 'success' ? 200 : 502);
    const raw = await sent.text(); assert.equal(raw.includes(TOKEN), false); assert.equal(raw.includes('raw private response'), false);
    const state = await f.status();
    assert.equal(state.sendState, graphOutcome === 'success' ? 'sent' : graphOutcome === 'ambiguous' ? 'unknown' : 'failed');
    assert.equal(state.threadState, 'released'); assert.equal(f.owner(), 'other');
    const mutations = f.calls.filter(call => call.options.method === 'POST');
    assert.equal(mutations.length, 3);
    for (const call of mutations) assert.equal(JSON.parse(call.options.body).recipient.id, TESTER_ID);
    assert.equal(JSON.parse(mutations[1].options.body).message.text, FIXED_REPLY);
    assert.equal((await f.post('/api/send-fixed-reply')).status, 409);
    f.advance(1); await f.deliver();
    assert.equal((await f.post('/api/send-fixed-reply')).status, 409);
    assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 3);
});

test('an in-flight send cannot be repeated concurrently', async t => {
    let finishSend;
    const delayedSend = new Promise(resolve => { finishSend = resolve; });
    const f = await fixture(t, { settings: { allowReply: true }, delayedSend });
    await f.deliver(); await f.waitVerified();
    const first = f.post('/api/send-fixed-reply');
    for (let i = 0; i < 30; i++) { if ((await f.status()).sendState === 'sending') break; await new Promise(resolve => setImmediate(resolve)); }
    assert.equal((await f.post('/api/send-fixed-reply')).status, 409);
    finishSend(); assert.equal((await first).status, 200);
    assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 1);
});

test('expiry cleanup waits for an in-flight takeover, then releases the same test identity', async t => {
    let finishTake;
    const delayedTake = new Promise(resolve => { finishTake = resolve; });
    const f = await fixture(t, { settings: { allowReply: true, allowThreadControl: true }, delayedTake });
    await f.deliver(); await f.waitVerified();
    const taking = f.post('/api/take-test-thread');
    for (let i = 0; i < 30; i++) { if ((await f.status()).threadState === 'taking') break; await new Promise(resolve => setImmediate(resolve)); }
    f.advance(SESSION_TTL);
    let cleaned = false;
    const firstCleanup = f.server.reviewCleanup();
    const secondCleanup = f.server.reviewCleanup();
    assert.equal(firstCleanup, secondCleanup, 'Concurrent cleanup calls share a single release operation.');
    const cleanup = firstCleanup.then(result => { cleaned = true; return result; });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(cleaned, false);
    assert.equal((await f.post('/api/send-fixed-reply')).status, 410);
    finishTake(); assert.equal((await taking).status, 200);
    const result = await cleanup;
    assert.deepEqual(result, { threadState: 'released', releaseConfirmed: true }); assert.equal(f.owner(), 'other');
    assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 2);
});

test('failed expiry release retains its fixed identity for owner cleanup retry', async t => {
    const f = await fixture(t, { settings: { allowReply: true, allowThreadControl: true }, releaseFailures: 1 });
    await f.deliver(); await f.waitVerified();
    assert.equal((await f.post('/api/take-test-thread')).status, 200);
    f.advance(SESSION_TTL);
    assert.deepEqual(await f.server.reviewCleanup(), { threadState: 'unknown', releaseConfirmed: false });
    assert.equal(f.owner(), 'crm');
    assert.equal((await f.post('/api/release-test-thread', { confirm: true }, { Origin: '' })).status, 403);
    assert.equal((await f.post('/api/release-test-thread', { confirm: true, recipient: 'outsider' })).status, 400);
    const cleanup = await f.post('/api/release-test-thread');
    assert.equal(cleanup.status, 200); assert.deepEqual(await cleanup.json(), { threadState: 'released', releaseConfirmed: true });
    assert.equal((await f.post('/api/take-test-thread')).status, 410);
    assert.equal((await f.post('/api/send-fixed-reply')).status, 410);
    assert.equal(f.owner(), 'other');
    const releases = f.calls.filter(call => call.url.pathname.endsWith('/release_thread_control'));
    assert.equal(releases.length, 2);
    for (const call of releases) assert.equal(JSON.parse(call.options.body).recipient.id, TESTER_ID);
});

test('expiry during profile re-verification blocks new thread takeover and reply effects', async t => {
    for (const route of ['/api/take-test-thread', '/api/send-fixed-reply']) {
        let finishVerify;
        const delayedReverify = new Promise(resolve => { finishVerify = resolve; });
        const f = await fixture(t, { settings: { allowReply: true, allowThreadControl: true }, delayedReverify });
        await f.deliver(); await f.waitVerified();
        const pending = f.post(route);
        for (let i = 0; i < 30; i++) { if (f.calls.filter(call => call.url.pathname.endsWith('/me')).length === 2) break; await new Promise(resolve => setImmediate(resolve)); }
        f.advance(SESSION_TTL);
        const cleanup = f.server.reviewCleanup();
        finishVerify(); assert.equal((await pending).status, 410);
        assert.deepEqual(await cleanup, { threadState: 'idle', releaseConfirmed: true });
        assert.equal(f.calls.filter(call => call.options.method === 'POST').length, 0);
    }
});

test('a malformed thread owner remains unknown and preserves the identity for cleanup', async t => {
    const f = await fixture(t, { settings: { allowReply: true, allowThreadControl: true }, malformedOwners: 1 });
    await f.deliver(); await f.waitVerified();
    assert.equal((await f.post('/api/take-test-thread')).status, 200);
    f.advance(SESSION_TTL);
    assert.deepEqual(await f.server.reviewCleanup(), { threadState: 'unknown', releaseConfirmed: false });
    assert.equal(f.owner(), 'crm');
    assert.equal(f.calls.filter(call => call.url.pathname.endsWith('/release_thread_control')).length, 0);
    assert.deepEqual(await f.server.reviewCleanup(), { threadState: 'released', releaseConfirmed: true });
    assert.equal(f.owner(), 'other');
});
