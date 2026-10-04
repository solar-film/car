'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createTestWebhook,WEBHOOK_PATH}=require('../tools/instagram-review/webhook.cjs');
const {createReviewServer}=require('../tools/instagram-review/server.cjs');
const secret='a'.repeat(32),verifyToken='review-verification-only';
const settings={facebookPage:'109607531869658',instagramAccount:'17841458662245781',instagramToken:'server-only-fixture'};
const timestamp=Date.now();
const payload=(overrides={})=>({object:'instagram',entry:[{id:settings.instagramAccount,messaging:[{sender:{id:'987654321012345'},recipient:{id:settings.instagramAccount},timestamp,message:{mid:'test-message',text:'Test'},...overrides}]}]});
const signed=body=>'sha256='+crypto.createHmac('sha256',secret).update(body).digest('hex');
const response=value=>({ok:true,status:200,json:async()=>value});
async function serve(t,server) { await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); t.after(()=>new Promise(resolve=>server.close(resolve))); return `http://127.0.0.1:${server.address().port}`; }
async function post(base,value,signature=true) { const body=JSON.stringify(value); return fetch(base+WEBHOOK_PATH,{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':signature ? signed(body) : 'sha256='+'0'.repeat(64)},body}); }

test('public test receiver validates handshake and rejects all other paths',async t=>{
    const server=createTestWebhook({getSettings:()=>settings,getSecret:()=>secret,verifyToken,onVerified:()=>assert.fail('No event'),now:()=>timestamp});
    const base=await serve(t,server);
    assert.equal((await fetch(base+'/api/status')).status,404);
    assert.equal((await fetch(base+WEBHOOK_PATH+'?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123')).status,403);
    const good=await fetch(base+WEBHOOK_PATH+'?hub.mode=subscribe&hub.verify_token='+verifyToken+'&hub.challenge=123');
    assert.equal(good.status,200); assert.equal(await good.text(),'123');
});

test('only signed fresh Test events for the expected account can verify a recipient',async t=>{
    let calls=0,resolveVerified;
    const verified=new Promise(resolve=>{resolveVerified=resolve;});
    const server=createTestWebhook({getSettings:()=>settings,getSecret:()=>secret,verifyToken,onVerified:resolveVerified,now:()=>timestamp,fetchImpl:async(url,options)=>{
        calls++; assert.equal(options.method,'GET'); assert.equal(options.headers.Authorization,'Bearer server-only-fixture'); assert.equal(String(url).includes('server-only-fixture'),false);
        return response(new URL(url).pathname.endsWith('/me') ? {id:settings.facebookPage,instagram_business_account:{id:settings.instagramAccount,username:'mhlcarfilm'}} : {username:'crazyoilly'});
    }});
    const base=await serve(t,server);
    assert.equal((await post(base,payload(),false)).status,403); assert.equal(calls,0);
    assert.equal((await post(base,payload({message:{mid:'ordinary',text:'customer private message'}}))).status,200); assert.equal(calls,0);
    const wrong=payload(); wrong.entry[0].id='17841400000000000'; await post(base,wrong); assert.equal(calls,0);
    await post(base,payload({timestamp:timestamp-1})); assert.equal(calls,0);
    assert.equal((await post(base,payload())).status,200);
    const result=await Promise.race([verified,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Recipient verification did not finish')),1000))]);
    assert.equal(result.username,'crazyoilly'); assert.equal(result.recipientId,'987654321012345'); assert.equal(result.source,'webhook'); assert.equal(calls,2);
    await post(base,payload()); assert.equal(calls,2);
    const diagnostics=server.getReviewDiagnostics();
    assert.equal(diagnostics.verifiedTests,1); assert.equal(diagnostics.testCandidates,1);
    assert.equal(JSON.stringify(diagnostics).includes('987654321012345'),false);
    assert.equal(JSON.stringify(diagnostics).includes('customer private message'),false);
    assert.equal(JSON.stringify(diagnostics).includes('test-message'),false);
});

test('a different username cannot become the controlled test receiver',async t=>{
    let resolveProfile,selected=false;
    const checked=new Promise(resolve=>{resolveProfile=resolve;});
    const server=createTestWebhook({getSettings:()=>settings,getSecret:()=>secret,verifyToken,onVerified:()=>{selected=true;},now:()=>timestamp,fetchImpl:async url=>{
        if(new URL(url).pathname.endsWith('/me')) return response({id:settings.facebookPage,instagram_business_account:{id:settings.instagramAccount,username:'mhlcarfilm'}});
        resolveProfile(); return response({username:'unrelated_user'});
    }});
    const base=await serve(t,server); await post(base,payload()); await checked;
    await new Promise(resolve=>setImmediate(resolve)); assert.equal(selected,false);
    assert.equal(server.getReviewDiagnostics().senderCheck,'rejected');
    assert.equal(JSON.stringify(server.getReviewDiagnostics()).includes('unrelated_user'),false);
});

test('test receiver stays closed without a secret and expires after two hours',async t=>{
    let current=timestamp,currentSecret='';
    const server=createTestWebhook({getSettings:()=>settings,getSecret:()=>currentSecret,verifyToken,onVerified:()=>assert.fail('No event'),now:()=>current});
    const base=await serve(t,server);
    assert.equal((await fetch(base+WEBHOOK_PATH)).status,503);
    currentSecret=secret; current+=7200001;
    assert.equal((await post(base,payload())).status,410);
});

test('review secret is accepted only locally with CSRF and is never returned',async t=>{
    const server=createReviewServer(()=>settings);
    const base=await serve(t,server),state=await(await fetch(base+'/api/status')).json();
    assert.equal((await fetch(base+'/api/review-secret',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret})})).status,403);
    const saved=await fetch(base+'/api/review-secret',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Review-Key':state.reviewKey},body:JSON.stringify({secret})});
    assert.equal(saved.status,200);
    const status=await(await fetch(base+'/api/status')).text(); assert.equal(status.includes(secret),false); assert.equal(JSON.parse(status).webhookReady,true);
    const noEvent=await fetch(base+'/api/verify'); assert.equal(noEvent.status,409);
    assert.match((await noEvent.json()).message,/Webhook/);
});
