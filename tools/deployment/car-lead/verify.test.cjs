'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Readable} = require('node:stream');
const {EventEmitter} = require('node:events');
const {OUTPUT, buildBundle, verifyBundle} = require('./build-bundle.cjs');

buildBundle();
const {store, createServer} = require(path.join(OUTPUT, 'runtime/lead-data-server.cjs'));
const FIXTURE_KEY = 'fixture-only-car-key-32-characters-minimum';
const ORIGIN = 'https://solar-film.github.io';

// Dispatch the real request handler without listen(), a socket, or external traffic.
async function dispatch(server, url, {method = 'GET', headers = {}, body} = {}) {
    const request = Readable.from(body ? [Buffer.from(body)] : []);
    request.url = url;
    request.method = method;
    request.headers = {host: 'car-lead.test', ...headers};
    request.socket = {remoteAddress: '198.51.100.10'};
    const response = new EventEmitter();
    response.headers = {};
    response.headersSent = false;
    response.setHeader = (name, value) => { response.headers[name.toLowerCase()] = value; };
    response.writeHead = (status, headers = {}) => {
        response.status = status;
        response.headersSent = true;
        for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    };
    const finished = new Promise(resolve => { response.end = bytes => resolve({status: response.status, headers: response.headers, text: bytes?.toString() || ''}); });
    server.emit('request', request, response);
    return finished;
}

test('the package inventory matches the explicit sources and resolves every local runtime import', () => {
    const inventory = verifyBundle();
    assert.equal(inventory.files.length, 11);
    assert.equal(inventory.entrypoint, 'runtime/lead-data-server.cjs');
});

test('packaged CLI fails closed without a remote Access Key before opening the configured port/database', () => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('CAR_LEAD_')));
    Object.assign(env, {CAR_LEAD_HOST: '0.0.0.0', CAR_LEAD_PORT: '10000', CAR_LEAD_DATABASE: ':memory:', CAR_LEAD_ALLOWED_ORIGIN: ORIGIN, CAR_LEAD_ACCESS_KEY: ''});
    const result = spawnSync(process.execPath, [path.join(OUTPUT, 'runtime/lead-data-server.cjs')], {env, encoding: 'utf8', timeout: 5000, windowsHide: true});
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /CAR_LEAD_ACCESS_KEY/);
    assert.doesNotMatch(result.stdout, /CAR lead service:/);
});

test('packaged CLI rejects a short Access Key before opening a service', () => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('CAR_LEAD_')));
    Object.assign(env, {CAR_LEAD_HOST: '0.0.0.0', CAR_LEAD_PORT: '10000', CAR_LEAD_DATABASE: ':memory:', CAR_LEAD_ACCESS_KEY: 'fixture-short'});
    const result = spawnSync(process.execPath, [path.join(OUTPUT, 'runtime/lead-data-server.cjs')], {env, encoding: 'utf8', timeout: 5000, windowsHide: true});
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /CAR_LEAD_ACCESS_KEY/);
    assert.doesNotMatch(result.stdout, /CAR lead service:/);
});

test('packaged handler gates data by its CAR key, enforces exact Pages origin, and denies private files/receivers', async () => {
    const database = store(':memory:');
    const settings = {host: '0.0.0.0', accessKey: FIXTURE_KEY, allowedOrigin: ORIGIN,
        facebookPage: '', instagramAccount: '', instagramUsername: 'fixture', instagramToken: '',
        lineSecret: '', facebookSecret: '', lineBotId: '', facebookVerify: ''};
    const server = createServer(settings, database);
    try {
        const noKey = await dispatch(server, '/api/lead-data/records', {headers: {origin: ORIGIN}});
        assert.equal(noKey.status, 401);
        assert.equal(noKey.headers['access-control-allow-origin'], ORIGIN);
        const wrongKey = await dispatch(server, '/api/lead-data/records', {headers: {origin: ORIGIN, 'x-car-lead-key': 'wrong'}});
        assert.equal(wrongKey.status, 401);
        const wrongOrigin = await dispatch(server, '/api/lead-data/records', {headers: {origin: 'https://other.test', 'x-car-lead-key': FIXTURE_KEY}});
        assert.equal(wrongOrigin.status, 403);
        assert.equal(wrongOrigin.headers['access-control-allow-origin'], undefined);
        const allowed = await dispatch(server, '/api/lead-data/records', {headers: {origin: ORIGIN, 'x-car-lead-key': FIXTURE_KEY}});
        assert.equal(allowed.status, 200);
        assert.deepEqual(JSON.parse(allowed.text).leads, []);
        assert.equal(allowed.text.includes(FIXTURE_KEY), false);
        const preflight = await dispatch(server, '/api/lead-data/records', {method: 'OPTIONS', headers: {origin: ORIGIN}});
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers['access-control-allow-origin'], ORIGIN);
        for (const privatePath of ['/lead-data.env', '/.env', '/.lead-data/car-leads.sqlite', '/var/data/car-leads.sqlite', '/inventory.json']) {
            const result = await dispatch(server, privatePath);
            assert.equal(result.status, 404, privatePath);
        }
        const receiver = await dispatch(server, '/lead-webhooks/line', {method: 'POST', body: '{}'});
        assert.equal(receiver.status, 503, 'empty receiver credentials leave the receiver inactive');
        const health = await dispatch(server, '/api/lead-data/config');
        assert.equal(health.status, 200);
        assert.equal(typeof JSON.parse(health.text).local, 'boolean');
        assert.equal(health.text.includes(FIXTURE_KEY), false);
    } finally { server.close(); database.db.close(); }
});
