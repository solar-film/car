'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {conversations} = require('../lead-data-facebook.cjs');
const settings = {facebookPage:'123456789',facebookToken:'test-only-token'};
test('daily Facebook activity includes each inbound day once and excludes Page replies',async()=>{
 const result=await conversations(settings,'',async url=>({ok:true,json:async()=>new URL(url).pathname.endsWith('/me')?{id:settings.facebookPage}:{data:[{id:'thread',updated_time:'2026-10-03T12:00:00Z',participants:{data:[{id:'987654321'}]},messages:{data:[
 {from:{id:settings.facebookPage},created_time:'2026-10-03T12:00:00Z'},
 {from:{id:'987654321'},created_time:'2026-10-02T12:00:00Z'},
 {from:{id:'987654321'},created_time:'2026-10-02T10:00:00Z'},
 {from:{id:'987654321'},created_time:'2026-10-01T12:00:00Z'}]}}]}}));
 assert.deepEqual(result.contacts[0].daily_activity,['2026-10-02T12:00:00.000Z','2026-10-01T12:00:00.000Z']);
 assert.equal(result.contacts[0].history_complete,true);
});

test('select verified Facebook contacts into CAR without duplicates or invented first-contact times', async () => {
    const {store,createServer} = require('../lead-data-server.cjs');
    const database = store(':memory:');
    const configuration = {...settings,host:'127.0.0.1',accessKey:'test-key-for-facebook-selection-12345'};
    const server = createServer(configuration,database,{facebookFetch:async url => ({ok:true,json:async () => new URL(url).pathname.endsWith('/me') ? {id:settings.facebookPage,name:'CAR'} : {data:[{id:'t_verified',updated_time:'2026-09-30T10:00:00Z',participants:{data:[{id:'987654321',name:'Test'}]}}]}})});
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/lead-data/`;
    const headers = {'X-Car-Lead-Key':configuration.accessKey,'Content-Type':'application/json'};
    const select = contactId => fetch(base+'select',{method:'POST',headers,body:JSON.stringify({platform:'facebook',contactId,lead:{name:'Test'}})});
    try {
        assert.equal((await select('t_verified')).status,404);
        assert.equal((await fetch(base+'inbox?platform=facebook',{headers})).status,200);
        assert.equal((await select('t_forged')).status,404);
        const first = await select('t_verified'); assert.equal(first.status,200);
        assert.equal((await first.json()).lead.source.firstSeenAt,null);
        assert.equal((await (await select('t_verified')).json()).duplicate,true);
        assert.equal(database.rows('leads').length,1);
        configuration.facebookPage='555555555';
        assert.equal((await select('t_verified')).status,404);
    } finally { await new Promise(resolve => server.close(resolve)); database.db.close(); }
});

test('Facebook reads only the verified Page and never subscribes, sends, or follows token-bearing URLs', async () => {
    const requests = [];
    const result = await conversations(settings,'cursor-first',async (url,options) => {
        requests.push({url,options});
        return {ok:true,json:async () => requests.length === 1 ? {id:settings.facebookPage,name:'MHLcarfilm'} : {
            data:[{id:'conversation-1',updated_time:'2026-09-30T10:00:00+0000',participants:{data:[{id:settings.facebookPage,name:'MHLcarfilm'},{id:'987654321',name:'<ชื่อทดสอบ>'}]}}],
            paging:{next:'https://untrusted.example/?access_token=never-use',cursors:{after:'cursor-next'}}
        }};
    });
    assert.equal(requests.length,2);
    for (const request of requests) {
        assert.equal(request.options.method,'GET');
        assert.equal(new URL(request.url).hostname,'graph.facebook.com');
        assert.equal(request.url.includes(settings.facebookToken),false);
    }
    assert.equal(new URL(requests[1].url).pathname,'/v25.0/123456789/conversations');
    assert.equal(new URL(requests[1].url).searchParams.get('after'),'cursor-first');
    assert.equal(result.contacts.length,1); assert.equal(result.contacts[0].facebook_user_id,'987654321');
    assert.equal(result.contacts[0].first_seen_at,null); assert.equal(result.summary,null);
    assert.equal(result.nextCursor,'cursor-next');
});

test('mismatched Page token is rejected before any conversations are read', async () => {
    let count = 0;
    await assert.rejects(conversations(settings,'',async () => { count++; return {ok:true,json:async () => ({id:'111111111'})}; }),/ไม่ตรง/);
    assert.equal(count,1);
});

test('missing credentials and expired tokens fail clearly without empty success or secret disclosure', async () => {
    await assert.rejects(conversations({},''),/Page ID/);
    await assert.rejects(conversations(settings,'',async () => ({ok:false,json:async () => ({error:{code:190,message:'sensitive upstream detail'}})})), error => error.status === 401 && !error.message.includes('sensitive'));
});

 test('automatic tags use inbound history and paginate before declaring new', async () => {
    const now = '2026-09-15T10:00:00Z';
    let reads = 0;
    const result = await conversations(settings,'',async url => {
        const path = new URL(url).pathname;
        const value = path.endsWith('/me') ? {id:settings.facebookPage} : path.endsWith('/messages') ? (reads++, {data:[{from:{id:'987654321'},created_time:'2020-01-01T00:00:00Z'}]}) : {data:[
            {id:'old',updated_time:now,participants:{data:[{id:'987654321'}]},messages:{data:[{from:{id:settings.facebookPage},created_time:now},{from:{id:'987654321'},created_time:now}],paging:{next:'https://ignored.example',cursors:{after:'older'}}}},
            {id:'new',updated_time:now,participants:{data:[{id:'111111111'}]},messages:{data:[{from:{id:'111111111'},created_time:now}]}},
            {id:'unknown',participants:{data:[{id:'222222222'}]},messages:{data:[{from:{id:settings.facebookPage},created_time:'2020-01-01T00:00:00Z'}]}}
        ]};
        return {ok:true,json:async()=>value};
    });
    assert.equal(reads,1);
    assert.deepEqual(result.contacts.map(c=>c.customer_type),['existing','new','']);
 });
 test('automatic tags follow each row date and Bangkok midnight', () => {
    const {customerTag}=require('../lead-data-core.js');
    assert.equal(customerTag('2026-09-30T17:01:00Z','2026-10-01T10:00:00Z'),'new');
    assert.equal(customerTag('2026-09-30T16:59:00Z','2026-10-01T10:00:00Z'),'existing');
    assert.equal(customerTag('2026-09-30T17:01:00Z','2026-10-01T17:00:00Z'),'existing');
    assert.equal(customerTag(null),'');
 });
