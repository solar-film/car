const test = require('node:test');
const assert = require('node:assert/strict');
const {createOptionsCache} = require('../lead-data-core.js');

test('prefetch and form opening share a request, then reuse options until expiry', async () => {
    let calls = 0, time = 100, resolve;
    const cache = createOptionsCache(() => { calls++; return new Promise(done => { resolve = done; }); }, {ttlMs:300000, now:() => time});
    const prefetch = cache.get(), opening = cache.get();
    await Promise.resolve();
    assert.equal(calls,1);
    assert.equal(prefetch,opening);
    const options = {Car_model:['Model A']};
    resolve(options);
    assert.equal(await opening,options);
    time = 300099;
    assert.equal(await cache.get(),options);
    assert.equal(calls,1);
    time = 300100;
    const refreshed = cache.get();
    await Promise.resolve();
    assert.equal(calls,2);
    resolve({Car_model:['Model B']});
    assert.deepEqual(await refreshed,{Car_model:['Model B']});
});

test('a failed prefetch can be retried when opening the form', async () => {
    let calls = 0;
    const cache = createOptionsCache(async () => {
        if (++calls === 1) throw new Error('offline');
        return {Car_Brand:['Toyota']};
    });
    await assert.rejects(cache.get(),/offline/);
    assert.deepEqual(await cache.get(),{Car_Brand:['Toyota']});
    assert.equal(calls,2);
});

test('connection reset prevents an old in-flight response replacing the new cache', async () => {
    const pending = [];
    const cache = createOptionsCache(() => new Promise(resolve => pending.push(resolve)));
    const oldRequest = cache.get();
    await Promise.resolve();
    cache.clear();
    const newRequest = cache.get();
    await Promise.resolve();
    pending[1]({Car_Brand:['New connection']});
    await newRequest;
    pending[0]({Car_Brand:['Old connection']});
    await oldRequest;
    assert.deepEqual(await cache.get(),{Car_Brand:['New connection']});
    assert.equal(pending.length,2);
});

test('expired options are not silently returned when refresh fails', async () => {
    let time = 0, fail = false;
    const cache = createOptionsCache(async () => {
        if (fail) throw new Error('sheet unavailable');
        return {Car_Brand:['Toyota']};
    }, {ttlMs:300000, now:() => time});
    await cache.get();
    time = 300000; fail = true;
    await assert.rejects(cache.get(),/sheet unavailable/);
    fail = false;
    assert.deepEqual(await cache.get(),{Car_Brand:['Toyota']});
});
