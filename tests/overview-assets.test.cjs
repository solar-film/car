'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../lead-data-server.cjs');
const { passwordHash } = require('../crm-session.cjs');

test('the CAR service serves overview images, chart script and styles without database access', async () => {
    const database = new Proxy({}, {
        get() { throw new Error('Static requests must not access the database'); }
    });
    const server = createServer({ host: '127.0.0.1', crmAuth:{username:'fixture',passwordHash:passwordHash('fixture-password')} }, database);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/`;

    try {
        const locked = await fetch(base + 'overview.html',{redirect:'manual'});
        assert.equal(locked.status,302);
        const login = await fetch(base + 'api/crm-auth/login',{method:'POST',headers:{Origin:base.slice(0,-1),'Content-Type':'application/json'},body:JSON.stringify({user:'fixture',password:'fixture-password'})});
        assert.equal(login.status,200);
        const cookie = login.headers.get('set-cookie').split(';')[0];
        const assets = [
            ['overview.html', 'text/html; charset=utf-8'],
            ['overview-presentation.js', 'text/javascript; charset=utf-8'],
            ['overview-memo-manager.js', 'text/javascript; charset=utf-8'],
            ['overview-ui.css', 'text/css; charset=utf-8'],
            ['images/overview-city-sedan.webp', 'image/webp'],
            ['images/overview-premium-suv.webp', 'image/webp']
        ];
        for (const [name, mime] of assets) {
            const response = await fetch(`${base}${name}?v=overview-assets`,{headers:{Cookie:cookie}});
            assert.equal(response.status, 200, name);
            assert.equal(response.headers.get('content-type'), mime, name);
            assert.equal(response.headers.get('cache-control'), 'no-store', name);
            assert.deepEqual(
                Buffer.from(await response.arrayBuffer()),
                fs.readFileSync(path.join(__dirname, '..', name)),
                name
            );
        }

        for (const name of [
            'lead-data.env',
            'lead-data-server.cjs',
            '.lead-data/car-leads.sqlite',
            'images/overview-assets.md',
            'images/not-allowlisted.webp',
            'images/%2e%2e%2flead-data.env',
            'images/%2e%2e%5clead-data.env',
            'images/overview-city-sedan.webp%2f..%2f..%2flead-data.env'
        ]) {
            assert.equal((await fetch(base + name)).status, 404, name);
        }
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
