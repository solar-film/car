'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {readTestThreadOwner,changeTestThread}=require('../tools/instagram-review/thread.cjs');
const {createReviewServer,TEST_REPLY}=require('../tools/instagram-review/server.cjs');
const {WEBHOOK_PATH}=require('../tools/instagram-review/webhook.cjs');
const settings={facebookPage:'1234567890',instagramAccount:'17841400000000000',instagramToken:'private-fixture'};
const recipient={username:'crazyoilly',recipientId:'9876543210',receivedAt:'2026-10-03T04:59:00Z'};
const now=Date.parse('2026-10-03T05:00:00Z');
const response=value=>({ok:!value.error,status:value.error ? 400 : 200,json:async()=>value});
test('control actions accept only the fixed test account and a recent inbound Test',async()=>{
    const calls=[];
    const fetchImpl=async(url,options)=>{calls.push({url:String(url),options});return response({success:true});};
    for(const action of ['take','release']) {
        assert.deepEqual(await changeTestThread(settings,recipient,action,fetchImpl,now),{success:true});
        const call=calls.at(-1);
        assert.equal(call.url,`https://graph.facebook.com/v25.0/1234567890/${action}_thread_control`);
        assert.deepEqual(JSON.parse(call.options.body),{recipient:{id:recipient.recipientId}});
        assert.equal(call.options.headers.Authorization,'Bearer private-fixture');
    }
    await assert.rejects(changeTestThread(settings,{...recipient,username:'other'},'take',fetchImpl,now),{status:409});
    await assert.rejects(changeTestThread(settings,recipient,'take',fetchImpl,now+86400000),{status:409});
    await assert.rejects(changeTestThread(settings,recipient,'global-route',fetchImpl,now),{status:400});
    assert.equal(calls.length,2);
});
test('owner reads are scoped and ambiguous control results require an owner read',async()=>{
    const calls=[];
    assert.equal(await readTestThreadOwner(settings,recipient,async(url,options)=>{calls.push({url:String(url),options});return response({data:[{thread_owner:{app_id:'1703232694436408'}}]});},now),'crm');
    assert.equal(new URL(calls[0].url).searchParams.get('recipient'),recipient.recipientId);
    assert.equal(calls[0].options.method,'GET');
    assert.ok(!calls[0].url.includes(settings.instagramToken));
    await assert.rejects(changeTestThread(settings,recipient,'take',async()=>{throw new Error('private network details');},now),error=>error.uncertain===true && !error.message.includes('private network details'));
    await assert.rejects(changeTestThread(settings,recipient,'take',async()=>response({error:{code:100,error_subcode:2534037,message:'private token and sender'}}),now),error=>error.message.includes('2534037') && !error.message.includes('private token'));
});
async function serve(t,server) {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    t.after(()=>new Promise(resolve=>server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
}
test('test takeover is disabled by default and requires a signed verified test',async t=>{
    const server=createReviewServer(()=>settings,async()=>assert.fail('No Meta API expected'));
    const base=await serve(t,server);
    const state=await(await fetch(base+'/api/status')).json();
    assert.equal(state.threadControlAllowed,false);
    assert.equal((await fetch(base+'/api/test-thread',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Review-Key':state.reviewKey},body:JSON.stringify({action:'take'})})).status,403);
    const enabled=createReviewServer(()=>settings,async()=>assert.fail('No Meta API expected'),{allowThreadControl:true});
    const allowedBase=await serve(t,enabled);
    const allowed=await(await fetch(allowedBase+'/api/status')).json();
    const headers={Origin:allowedBase,'Content-Type':'application/json','X-Review-Key':allowed.reviewKey};
    assert.equal((await fetch(allowedBase+'/api/test-thread',{method:'POST',headers,body:JSON.stringify({action:'take'})})).status,409);
    assert.equal((await fetch(allowedBase+'/api/test-thread',{method:'POST',headers,body:JSON.stringify({action:'take',recipient:'someone-else'})})).status,400);
    assert.equal((await fetch(allowedBase+'/api/test-thread',{method:'POST',headers:{...headers,Origin:'https://unrelated.test'},body:JSON.stringify({action:'take'})})).status,403);
});
for(const outcome of ['success','rejected','ambiguous']) test(`signed Test scope and automatic return of control after ${outcome} reply`,async t=>{
    const calls=[];let owner='other';
    const fetchImpl=async(url,options)=>{
        const pathname=new URL(url).pathname;
        calls.push({url:String(url),options});
        if(pathname.endsWith('/me')) return response({id:settings.facebookPage,instagram_business_account:{id:settings.instagramAccount,username:'mhlcarfilm'}});
        if(pathname.endsWith('/'+recipient.recipientId)) return response({username:'crazyoilly'});
        if(pathname.endsWith('/take_thread_control')) {owner='crm';return response({success:true});}
        if(pathname.endsWith('/thread_owner')) return response({data:[{thread_owner:{app_id:owner==='crm' ? '1703232694436408' : '1217981644879628'}}]});
        if(pathname.endsWith('/release_thread_control')) {owner='other';return response({success:true});}
        if(pathname.endsWith('/messages')) {
            if(outcome==='ambiguous') throw new Error('Disconnected after request');
            return outcome==='rejected' ? response({error:{code:100,error_subcode:2534037}}) : response({recipient_id:recipient.recipientId,message_id:'test-message-result'});
        }
        assert.fail('Unexpected Meta API request');
    };
    const server=createReviewServer(()=>settings,fetchImpl,{allowThreadControl:true});
    const base=await serve(t,server),webhook=await serve(t,server.reviewWebhook);
    const state=await(await fetch(base+'/api/status')).json();
    const headers={Origin:base,'Content-Type':'application/json','X-Review-Key':state.reviewKey};
    const secret='a'.repeat(32);
    assert.equal((await fetch(base+'/api/review-secret',{method:'POST',headers,body:JSON.stringify({secret})})).status,200);
    const raw=JSON.stringify({object:'instagram',entry:[{id:settings.instagramAccount,messaging:[{sender:{id:recipient.recipientId},recipient:{id:settings.instagramAccount},timestamp:Date.now(),message:{mid:'signed-fixture-Test',text:'Test'}}]}]});
    const signature='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
    assert.equal((await fetch(webhook+WEBHOOK_PATH,{method:'POST',headers:{'X-Hub-Signature-256':signature},body:raw})).status,200);
    for(let i=0;i<20;i++) {if((await(await fetch(base+'/api/status')).json()).webhookTestReceived) break;await new Promise(resolve=>setImmediate(resolve));}
    assert.equal((await fetch(base+'/api/verify')).status,200);
    assert.equal((await fetch(base+'/api/test-thread',{method:'POST',headers,body:JSON.stringify({action:'take'})})).status,200);
    const sent=await fetch(base+'/api/send-test',{method:'POST',headers,body:JSON.stringify({confirm:true})});
    assert.equal(sent.status,outcome==='success' ? 200 : 502);
    const final=await(await fetch(base+'/api/status')).json();
    assert.equal(final.threadState,'released');
    assert.equal(final.sendState,outcome==='success' ? 'sent' : outcome==='ambiguous' ? 'unknown' : 'failed');
    const mutations=calls.filter(call=>call.options.method==='POST');
    assert.equal(mutations.length,3);
    for(const call of mutations) assert.equal(JSON.parse(call.options.body).recipient.id,recipient.recipientId);
    assert.equal(JSON.parse(mutations[1].options.body).message.text,TEST_REPLY);
    assert.equal(owner,'other');
    if(outcome!=='rejected') assert.equal((await fetch(base+'/api/send-test',{method:'POST',headers,body:JSON.stringify({confirm:true})})).status,409);
    const rearm={method:'POST',headers,body:JSON.stringify({confirm:true})};
    assert.equal((await fetch(base+'/api/new-round',rearm)).status,409);
    await new Promise(resolve=>setTimeout(resolve,2));
    const freshRaw=JSON.stringify({object:'instagram',entry:[{id:settings.instagramAccount,messaging:[{sender:{id:recipient.recipientId},recipient:{id:settings.instagramAccount},timestamp:Date.now(),message:{mid:'fresh-signed-fixture-Test',text:'Test'}}]}]});
    const freshSignature='sha256='+crypto.createHmac('sha256',secret).update(freshRaw).digest('hex');
    assert.equal((await fetch(webhook+WEBHOOK_PATH,{method:'POST',headers:{'X-Hub-Signature-256':freshSignature},body:freshRaw})).status,200);
    for(let i=0;i<20;i++) {if((await(await fetch(base+'/api/status')).json()).webhookDiagnostics.verifiedTests===2) break;await new Promise(resolve=>setImmediate(resolve));}
    assert.equal((await fetch(base+'/api/verify')).status,200);
    assert.equal((await fetch(base+'/api/new-round',{...rearm,headers:{...headers,'X-Review-Key':'wrong'}})).status,403);
    assert.equal((await fetch(base+'/api/new-round',rearm)).status,outcome==='success' ? 200 : 409);
    assert.equal((await(await fetch(base+'/api/status')).json()).sendState,outcome==='success' ? 'idle' : outcome==='ambiguous' ? 'unknown' : 'failed');
});
