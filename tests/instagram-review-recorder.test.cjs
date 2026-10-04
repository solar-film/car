'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {verifyRecipient,sendTestReply,createReviewServer,TEST_REPLY} = require('../tools/instagram-review/server.cjs');
const now = Date.parse('2026-10-03T05:00:00Z');
const settings = {facebookPage:'1234567890',instagramAccount:'17841400000000000',instagramToken:'test-private-token'};
const account = {id:settings.facebookPage,instagram_business_account:{id:settings.instagramAccount,username:'mhlcarfilm'}};
const thread = {data:[{id:'thread-test',participants:{data:[{id:'9876543210',username:'crazyoilly'},{id:'1122334455',username:'unrelated-customer'}]}}]};
const inbound = {data:[{from:{id:'9876543210'},message:'Test',created_time:'2026-10-03T04:59:00Z'}]};
function fixture(responses) {
    const calls = [];
    const fetchImpl = async (url,options) => {
        calls.push({url:String(url),options});
        const value = responses.shift();
        if (!value) throw new Error('Unexpected request');
        return {ok:!value.error,status:value.error ? 500 : 200,json:async()=>value};
    };
    return {calls,fetchImpl};
}
test('verification shows only the requested test account and never sends or persists',async()=>{
    const {calls,fetchImpl}=fixture([account,thread,inbound]);
    const result=await verifyRecipient(settings,fetchImpl,now);
    assert.deepEqual(result,{username:'crazyoilly',receivedAt:'2026-10-03T04:59:00Z',recipientId:'9876543210'});
    assert.equal(calls.length,3);
    for (const call of calls) {
        assert.equal(call.options.method,'GET');
        assert.equal(call.options.redirect,'error');
        assert.equal(call.options.headers.Authorization,'Bearer test-private-token');
        assert.ok(!call.url.includes(settings.instagramToken));
    }
    assert.ok(!JSON.stringify(result).includes('unrelated-customer'));
});
test('a different Page or Instagram account stops verification immediately',async()=>{
    const {calls,fetchImpl}=fixture([{...account,id:'9999999999'}]);
    await assert.rejects(verifyRecipient(settings,fetchImpl,now),{status:403});
    assert.equal(calls.length,1);
});
test('an unrelated recipient cannot be selected by the verification endpoint',async()=>{
    const {calls,fetchImpl}=fixture([account,{data:[{id:'thread-other',participants:{data:[{id:'1122334455',username:'unrelated-customer'}]}}]}]);
    await assert.rejects(verifyRecipient(settings,fetchImpl,now),{status:409});
    assert.equal(calls.length,2);
});

test('a matching display name is insufficient to authorize a recipient',async()=>{
    const {calls,fetchImpl}=fixture([account,{data:[{id:'thread-other',participants:{data:[{id:'1122334455',name:'crazyoilly'}]}}]}]);
    await assert.rejects(verifyRecipient(settings,fetchImpl,now),{status:409});
    assert.equal(calls.length,2);
});
test('old messages do not qualify as a fresh test',async()=>{
    const {fetchImpl}=fixture([account,thread,{data:[{from:{id:'9876543210'},message:'Test',created_time:'2026-09-30T04:59:00Z'}]}]);
    await assert.rejects(verifyRecipient(settings,fetchImpl,now),{status:409});
});
test('Meta failures remain failures and do not reveal private response details',async()=>{
    const {fetchImpl}=fixture([account,{error:{code:1,message:'test-private-token and customer details'}}]);
    await assert.rejects(verifyRecipient(settings,fetchImpl,now),error=>error.status===502 && error.message.includes('รหัส 1') && !error.message.includes('test-private-token'));
});
test('review tool rejects foreign origins, unknown files and unauthorized sends',async()=>{
    const server=createReviewServer(()=>settings,async()=>{throw new Error('No API request expected');});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    try {
        const root=await fetch(base);
        assert.equal(root.status,200);
        assert.match(root.headers.get('content-security-policy'),/frame-ancestors 'none'/);
        const status=await fetch(base+'/api/status');
        const value=await status.json();
        assert.equal(value.configured,true);
        assert.equal(value.account,'mhlcarfilm');
        assert.equal(value.recipient,'crazyoilly');
        assert.match(value.reviewKey,/^[a-f0-9]{64}$/);
        assert.ok(!JSON.stringify(value).includes(settings.instagramToken));
        assert.equal((await fetch(base+'/api/status',{headers:{Origin:'https://example.com'}})).status,403);
        assert.equal((await fetch(base+'/api/verify',{method:'POST'})).status,405);
        assert.equal((await fetch(base+'/api/send-test',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{"confirm":true}'})).status,403);
        assert.equal((await fetch(base+'/lead-data.env')).status,404);
    } finally { await new Promise(resolve=>server.close(resolve)); }
});
test('test reply has exactly one verified recipient, fixed text and no token in the URL',async()=>{
    const {calls,fetchImpl}=fixture([{recipient_id:'9876543210',message_id:'mid-test'}]);
    const result=await sendTestReply(settings,{username:'crazyoilly',recipientId:'9876543210',receivedAt:'2026-10-03T04:59:00Z'},fetchImpl,now);
    assert.deepEqual(result,{messageId:'mid-test'});
    assert.equal(calls.length,1);
    assert.equal(calls[0].url,'https://graph.facebook.com/v25.0/1234567890/messages');
    assert.equal(calls[0].options.method,'POST');
    assert.deepEqual(JSON.parse(calls[0].options.body),{recipient:{id:'9876543210'},message:{text:TEST_REPLY}});
    await assert.rejects(sendTestReply(settings,{username:'some-other-person',recipientId:'9876543210',receivedAt:'2026-10-03T04:59:00Z'},fetchImpl,now),{status:409});
    assert.equal(calls.length,1);
});
test('send failures expose the useful Meta reason while redacting tokens and identifiers',async()=>{
    const {fetchImpl}=fixture([{error:{code:100,error_subcode:33,message:`Unsupported post request for ${settings.facebookPage}; ${settings.instagramAccount}; 9876543210; ${settings.instagramToken}`}}]);
    await assert.rejects(sendTestReply(settings,{username:'crazyoilly',recipientId:'9876543210',receivedAt:'2026-10-03T04:59:00Z'},fetchImpl,now),error=>{
        assert.match(error.message,/รหัส 100.*รหัสย่อย 33.*Unsupported post request/);
        for (const secret of [settings.instagramToken,settings.facebookPage,settings.instagramAccount,'9876543210']) assert.ok(!error.message.includes(secret));
        return true;
    });
});
test('recordings can only be saved locally with the session key and validated video bytes',async()=>{
    const server=createReviewServer(()=>settings,async()=>{throw new Error('No Meta request expected');});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    try {
        const state=await (await fetch(base+'/api/status')).json();
        const headers={Origin:base,'Content-Type':'video/mp4','X-Review-Key':state.reviewKey};
        assert.equal((await fetch(base+'/api/save-recording',{method:'POST',headers:{...headers,Origin:'https://example.com'},body:'not video'})).status,403);
        assert.equal((await fetch(base+'/api/save-recording',{method:'POST',headers:{...headers,'X-Review-Key':'wrong'},body:'not video'})).status,403);
        assert.equal((await fetch(base+'/api/save-recording',{method:'POST',headers,body:'not video'})).status,400);
        assert.equal((await fetch(base+'/recordings/private.mp4')).status,404);
    } finally { await new Promise(resolve=>server.close(resolve)); }
});
test('an uncertain network result blocks duplicate sends in the running review server',async()=>{
    let sends=0;
    const receivedAt=new Date(Date.now()-60000).toISOString();
    const fetchImpl=async(url,options)=>{
        if (options.method==='POST') { sends++; throw new Error('Connection ended after request'); }
        const pathname=new URL(url).pathname;
        const value=pathname.endsWith('/me') ? account : pathname.endsWith('/conversations') ? thread : {data:[{from:{id:'9876543210'},message:'Test',created_time:receivedAt}]};
        return {ok:true,status:200,json:async()=>value};
    };
    const server=createReviewServer(()=>settings,fetchImpl);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    try {
        const state=await (await fetch(base+'/api/status')).json();
        const options={method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Review-Key':state.reviewKey},body:JSON.stringify({confirm:true})};
        assert.equal((await fetch(base+'/api/send-test',options)).status,409);
        assert.equal((await fetch(base+'/api/verify')).status,200);
        assert.equal((await fetch(base+'/api/send-test',{...options,body:JSON.stringify({confirm:true,text:'not authorized'})})).status,400);
        assert.equal((await fetch(base+'/api/send-test',options)).status,502);
        assert.equal((await fetch(base+'/api/send-test',options)).status,409);
        assert.equal(sends,1);
        assert.equal((await (await fetch(base+'/api/status')).json()).sendState,'unknown');
    } finally { await new Promise(resolve=>server.close(resolve)); }
});
