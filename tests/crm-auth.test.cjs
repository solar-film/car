'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {Readable} = require('node:stream');
const {EventEmitter} = require('node:events');
const {store,createServer} = require('../lead-data-server.cjs');
const {passwordHash,verify} = require('../crm-session.cjs');
const source = fs.readFileSync(path.join(__dirname,'../crm-auth.js'),'utf8');
const origin = 'http://127.0.0.1:3092';
const settings = {username:'fixture-admin',passwordHash:passwordHash('fixture-main-password'),commissionHash:passwordHash('fixture-commission-password')};
function setup(auth=settings) {
    let time = Date.now();
    const database = store(':memory:');
    const server = createServer({host:'127.0.0.1',accessKey:'separate-lead-key',crmAuth:auth},database,{crmAuth:{now:()=>time}});
    async function dispatch(url, {method='GET',headers={},body}={}) {
        const req=Readable.from(body ? [Buffer.from(body)] : []);
        Object.assign(req,{url,method,headers:{host:'127.0.0.1:3092',...Object.fromEntries(Object.entries(headers).map(([key,value])=>[key.toLowerCase(),value]))},socket:{remoteAddress:'127.0.0.1'}});
        const res=new EventEmitter();res.headers={};res.setHeader=(key,value)=>{res.headers[key.toLowerCase()]=value;};
        res.writeHead=(status,headers={})=>{res.status=status;Object.entries(headers).forEach(([k,v])=>res.setHeader(k,v));};
        const done=new Promise(resolve=>{res.end=bytes=>resolve({status:res.status,headers:res.headers,text:bytes?.toString()||''});});
        server.emit('request',req,res);return done;
    }
    const post=(action,input,cookie='',headers={})=>dispatch('/api/crm-auth/'+action,{method:'POST',headers:{origin,'content-type':'application/json',cookie,...headers},body:JSON.stringify(input)});
    return {dispatch,post,advance:ms=>{time+=ms;},close:()=>database.db.close()};
}
test('server checks password, rotates session, rejects forged flags and protects every CRM HTML page',async()=>{
 const f=setup();try {
  assert.equal(verify('wrong',settings.passwordHash),false);
  const locked=await f.dispatch('/customer-data.html',{headers:{cookie:'carCrmLoggedIn=1; carCrmSession=fake'}});
  assert.equal(locked.status,302);assert.match(locked.headers.location,/crm-login.html/);
  assert.equal((await f.dispatch('/crm-login.html')).status,200);
  assert.equal((await f.post('login',{user:settings.username,password:'wrong'})).status,401);
  const login=await f.post('login',{user:settings.username,password:'fixture-main-password'});
  assert.equal(login.status,200);assert.match(login.headers['set-cookie'],/HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(login.text,/fixture-main-password|passwordHash/);
  const cookie=login.headers['set-cookie'].split(';')[0];
  for(const page of fs.readdirSync(path.join(__dirname,'..')).filter(p=>p.endsWith('.html')&&p!=='crm-login.html')) {
   assert.equal((await f.dispatch('/'+page)).status,302,page+' locked');
   assert.equal((await f.dispatch('/'+page,{headers:{cookie}})).status,page==='technician-commission.html'?302:200,page);
  }
  assert.equal((await f.dispatch('/.crm-auth.json',{headers:{cookie}})).status,404);
  assert.equal((await f.dispatch('/crm-session.cjs',{headers:{cookie}})).status,404);
  assert.equal((await f.post('commission',{password:'fixture-commission-password'})).status,401);
  assert.equal((await f.post('commission',{password:'wrong'},cookie)).status,401);
  assert.equal((await f.post('commission',{password:'fixture-commission-password'},cookie)).status,200);
  assert.equal((await f.dispatch('/technician-commission.html',{headers:{cookie}})).status,200);
  f.advance(31*60*1000);
  assert.equal((await f.dispatch('/technician-commission.html',{headers:{cookie}})).status,302);
  assert.equal((await f.dispatch('/overview.html',{headers:{cookie}})).status,200);
  assert.equal((await f.post('logout',{},cookie)).status,200);
  assert.equal((await f.dispatch('/overview.html',{headers:{cookie}})).status,302);
 }finally{f.close();}
});
test('login fails closed without configuration; origin, JSON, expiry and attempt limits are enforced',async()=>{
 const missing=setup({});try{assert.equal((await missing.post('login',{user:'x',password:'y'})).status,503);}finally{missing.close();}
 const f=setup();try {
  const input={user:settings.username,password:'fixture-main-password'};
  assert.equal((await f.post('login',input,'',{origin:'https://evil.test'})).status,403);
  assert.equal((await f.post('login',input,'',{origin:''})).status,403);
  assert.equal((await f.post('login',input,'',{'content-type':'text/plain'})).status,403);
  assert.equal((await f.post('login',{...input,password:'x'.repeat(5000)})).status,413);
  const login=await f.post('login',input),cookie=login.headers['set-cookie'].split(';')[0];
  f.advance(13*60*60*1000);
  assert.equal(JSON.parse((await f.dispatch('/api/crm-auth/session',{headers:{cookie}})).text).authenticated,false);
  for(let i=0;i<10;i++)assert.equal((await f.post('login',{...input,password:'wrong'})).status,401);
  assert.equal((await f.post('login',input)).status,429);
  f.advance(11*60*1000);assert.equal((await f.post('login',input)).status,200);
 }finally{f.close();}
});
test('remote auth requires an exact configured HTTPS host and sets Secure cookies',async()=>{
 const remote='https://crm.example.test';const f=setup({...settings,publicOrigin:remote});try {
  const args={method:'POST',headers:{host:'crm.example.test',origin:remote,'content-type':'application/json'},body:JSON.stringify({user:settings.username,password:'fixture-main-password'})};
  const login=await f.dispatch('/api/crm-auth/login',args);assert.equal(login.status,200);assert.match(login.headers['set-cookie'],/; Secure$/);
  assert.equal((await f.dispatch('/api/crm-auth/login',{...args,headers:{...args.headers,host:'evil.test'}})).status,403);
 }finally{f.close();}
 assert.throws(()=>setup({...settings,publicOrigin:'http://crm.test'}),/HTTPS/);
});
function browser(transport,{values=new Map(),blockedStorage=false}={}) {
 const events=new Map();let reloads=0;const error={textContent:''};
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>{if(blockedStorage)throw Error('blocked');values.set(k,v);},removeItem:k=>values.delete(k)};
 const context={URL,AbortSignal,Date,Math,location:{protocol:'http:',href:origin+'/overview.html',reload:()=>reloads++},document:{getElementById:()=>error},localStorage:storage,
  fetch:async(url,opts)=>{const response=await transport(url,opts);return {ok:response.status===200,status:response.status,json:async()=>JSON.parse(response.text)};},
  addEventListener:(type,fn)=>{events.set(type,fn);}};
 context.window=context;vm.runInNewContext(source,context);
 return {auth:context.CarCrmAuth,values,storage,error,reloads:()=>reloads,dispatch:event=>events.get('storage')(event)};
}
test('shared browser sessions ignore forged localStorage, use server verification and synchronize across tabs',async()=>{
 const f=setup();let cookie='';const transport=async(url,opts)=>{
  const u=new URL(url);const response=await f.dispatch(u.pathname,{method:opts.method,headers:{...opts.headers,cookie,...(opts.method==='POST'?{origin}:{})},body:opts.body});
  if(response.headers['set-cookie'])cookie=response.headers['set-cookie'].split(';')[0];return response;
 };
 try {
  const values=new Map([['carCrmLoggedIn','1']]);const a=browser(transport,{values}),b=browser(transport,{values});
  await Promise.all([a.auth.refresh(),b.auth.refresh()]);assert.equal(a.auth.isLoggedIn(),false);assert.equal(b.auth.isLoggedIn(),false);
  let unlocked=0;b.auth.onLogin(()=>unlocked++);
  assert.equal(await a.auth.login(settings.username,'wrong'),false);
  assert.equal(await a.auth.login(settings.username,'fixture-main-password'),true);
  assert.equal(a.auth.isLoggedIn(),true);assert.equal(b.auth.isLoggedIn(),false);
  b.dispatch({key:'carCrmAuthChanged',newValue:'anything',storageArea:b.storage});await b.auth.refresh();
  assert.equal(b.auth.isLoggedIn(),true);assert.equal(unlocked,1);
  const c=browser(transport,{blockedStorage:true});await c.auth.refresh();assert.equal(c.auth.isLoggedIn(),true);
  assert.equal(values.has('carCrmLoggedIn'),false);assert.equal([...values.values()].some(v=>v.includes('fixture-main-password')),false);
  await a.auth.logout();await b.auth.refresh();assert.equal(b.auth.isLoggedIn(),false);assert.equal(b.reloads(),1);
 }finally{f.close();}
});
test('all 14 login pages await server login, compile and contain no embedded password checks',()=>{
 const pages=['index','overview','calendar','contact-stats','sales-summary','sales-dashboard','damage','other-damage','sunroof','install-summary','technician-commission','install-print','price-audit','accounting'];
 assert.doesNotMatch(source,/LOGIN_PASS|LOGIN_USER|value === '1'/);
 for(const name of pages){const html=fs.readFileSync(path.join(__dirname,'../'+name+'.html'),'utf8');assert.match(html,/await window.CarCrmAuth.login\(/);assert.match(html,/CarCrmAuth.onLogin\(/);for(const [,script]of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script,{filename:name+'.html'});}
 for(const name of ['commission-auth.js','install-summary.html','technician-commission.html'])assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),/password:\s*'|COMMISSION_PASS\s*=/);
});
