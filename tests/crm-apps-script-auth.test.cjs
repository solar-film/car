'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const {passwordHash} = require('../crm-session.cjs');
const root = path.join(__dirname,'..');
function backend() {
  let now = Date.now();
  const settings = {username:'fixture',passwordHash:passwordHash('fixture-main'),commissionHash:passwordHash('fixture-commission'),secret:crypto.randomBytes(32).toString('hex'),revision:'test-1'};
  const properties = new Map([['CAR_CRM_AUTH_CONFIG',JSON.stringify(settings)],['CAR_CRM_WRITE_TOKEN','unrelated-writer-token']]);
  const cache = new Map();
  const props = {getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v),deleteProperty:k=>properties.delete(k),getProperties:()=>Object.fromEntries(properties)};
  const context = {Date:class extends Date {static now(){return now;}},PropertiesService:{getScriptProperties:()=>props},CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},newBlob:s=>({getBytes:()=>[...Buffer.from(s)]}),computeDigest:(alg,s)=>[...crypto.createHash(alg).update(s).digest()],computeHmacSha256Signature:(s,key)=>[...crypto.createHmac('sha256',key).update(s).digest()],base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),getUuid:()=>crypto.randomUUID()},
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({text,setMimeType(){return this;}})}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'CarCrmAuth.gs'),'utf8'),context);
  const call = (action,input={})=>JSON.parse(context.carCrmAuthPost_({postData:{contents:JSON.stringify({action,clientId:'a'.repeat(32),...input})}}).text);
  return {context,call,properties,settings,advance:ms=>{now+=ms;}};
}
test('Apps Script verifies existing Node scrypt hashes without timers or changing writer credentials',()=>{
  const b=backend();
  assert.equal(b.call('login',{user:'fixture',password:'wrong'}).code,401);
  const login=b.call('login',{user:'fixture',password:'fixture-main'});
  assert.equal(login.authenticated,true);assert.match(login.sessionToken,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(b.call('session',{sessionToken:login.sessionToken}).authenticated,true);
  assert.equal(b.call('session',{sessionToken:'x'.repeat(43)}).authenticated,false);
  assert.equal(b.properties.get('CAR_CRM_WRITE_TOKEN'),'unrelated-writer-token');
  assert.equal(b.context.carCrmAuthPassword_('ทดสอบ 🔐',passwordHash('ทดสอบ 🔐')),true);
  assert.equal(JSON.stringify(login).includes(b.settings.passwordHash),false);
});
test('Apps Script commission, logout, session expiry and revision changes are enforced server-side',()=>{
  const b=backend(),login=b.call('login',{user:'fixture',password:'fixture-main'}),sessionToken=login.sessionToken;
  assert.equal(b.call('commission',{password:'fixture-commission'}).code,401);
  assert.equal(b.call('commission',{sessionToken,password:'wrong'}).code,401);
  assert.equal(b.call('commission',{sessionToken,password:'fixture-commission'}).commission,true);
  b.advance(31*60000);assert.equal(b.call('session',{sessionToken}).commission,false);
  assert.equal(b.call('session',{sessionToken}).authenticated,true);
  b.call('logout',{sessionToken});assert.equal(b.call('session',{sessionToken}).authenticated,false);
  const second=b.call('login',{user:'fixture',password:'fixture-main'});
  b.advance(13*3600000);assert.equal(b.call('session',{sessionToken:second.sessionToken}).authenticated,false);
  const third=b.call('login',{user:'fixture',password:'fixture-main'});
  b.properties.set('CAR_CRM_AUTH_CONFIG',JSON.stringify({...b.settings,revision:'test-2'}));
  assert.equal(b.call('session',{sessionToken:third.sessionToken}).authenticated,false);
});
test('Apps Script rejects malformed input and bounds repeated failures without blocking another browser',()=>{
  const b=backend();
  assert.equal(JSON.parse(b.context.carCrmAuthPost_({postData:{contents:'not-json'}}).text).ok,false);
  for(let i=0;i<10;i++) assert.equal(b.call('login',{user:'fixture',password:'wrong'}).code,401);
  assert.equal(b.call('login',{user:'fixture',password:'fixture-main'}).code,429);
  assert.equal(b.call('login',{user:'fixture',password:'fixture-main',clientId:'b'.repeat(32)}).authenticated,true);
  b.advance(11*60000);assert.equal(b.call('login',{user:'fixture',password:'fixture-main'}).authenticated,true);
});
function browser(b,values=new Map()) {
  const events=new Map();let reloads=0,networkFailure=false;
  const context={URL,AbortSignal,Uint8Array,Date,Math,crypto:crypto.webcrypto,location:{hostname:'solar-film.github.io',protocol:'https:',href:'https://solar-film.github.io/crm-car/overview.html',reload:()=>reloads++},document:{getElementById:()=>({textContent:''})},
    localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},addEventListener:(k,fn)=>events.set(k,fn),fetch:async(url,opts)=>{
      if(networkFailure)throw Error('Network unavailable');
      assert.match(String(url),/^https:\/\/script.google.com\/macros\/s\/.+\/exec\?crmAuth=1$/);
      assert.equal(opts.method,'POST');assert.equal(opts.credentials,'omit');assert.equal(opts.headers['Content-Type'],'text/plain;charset=UTF-8');
      const input=JSON.parse(opts.body),result=b.call(input.action,input);return {ok:true,json:async()=>result};
    }};
  context.window=context;vm.runInNewContext(fs.readFileSync(path.join(root,'crm-auth.js'),'utf8'),context);
  return {auth:context.CarCrmAuth,events,reloads:()=>reloads,offline:v=>{networkFailure=v;},values};
}
test('GitHub login shares a server-verified session across pages and survives a temporary network failure',async()=>{
  const b=backend(),values=new Map([['carCrmLoggedIn','1']]),a=browser(b,values);
  await a.auth.refresh();assert.equal(a.auth.isLoggedIn(),false);
  assert.equal(await a.auth.login('fixture','wrong'),false);
  assert.equal(await a.auth.login('fixture','fixture-main'),true);
  assert.equal(values.has('carCrmLoggedIn'),false);
  const next=browser(b,values);await next.auth.refresh();assert.equal(next.auth.isLoggedIn(),true);
  next.offline(true);await next.auth.refresh();assert.equal(next.auth.isLoggedIn(),true);assert.equal(next.reloads(),0);
  next.offline(false);await a.auth.logout();next.events.get('storage')({key:'carCrmSession',newValue:null});await next.auth.refresh();assert.equal(next.auth.isLoggedIn(),false);
  assert.equal([...values.values()].some(v=>v.includes('fixture-main')),false);
});
