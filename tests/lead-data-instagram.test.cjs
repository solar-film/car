'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../lead-data-core.js');
const {conversations} = require('../lead-data-instagram.cjs');
const {store,createServer} = require('../lead-data-server.cjs');
const settings = {facebookPage:'123456789',facebookToken:'fb-test-only',instagramAccount:'17841458662245781',instagramUsername:'car_test',instagramToken:'ig-test-only'};
const page = {id:settings.facebookPage,instagram_business_account:{id:settings.instagramAccount,username:settings.instagramUsername}};
const person = '987654321';
const at = '2026-10-03T10:00:00Z';
const reply = value => ({ok:true,json:async () => value});
const message = (id,time = at) => ({from:{id},created_time:time});
const thread = (id = 'thread',messages = [message(person)]) => ({id,updated_time:at,
    participants:{data:[{id:settings.facebookPage},{id:settings.instagramAccount},{id:person,username:'test_profile'}]},messages:{data:messages}});

test('Instagram verifies its linked CAR account, reads only inbound dates and never follows token URLs',async () => {
    const requests = [];
    const result = await conversations(settings,'page-first',async (url,options) => {
        const parsed = new URL(url); requests.push({url,options});
        if (parsed.pathname.endsWith('/me')) return reply(page);
        if (parsed.pathname.endsWith('/messages')) return reply({data:[message(person,'2026-10-01T16:59:00Z')]});
        const row = thread('thread',[message(settings.instagramAccount,'2026-10-03T12:00:00Z'),message(person),message(person,'2026-10-03T08:00:00Z'),message(person,'2026-10-01T17:01:00Z')]);
        row.messages.paging = {next:'https://untrusted.example/?access_token=private',cursors:{after:'older'}};
        return reply({data:[row],paging:{next:'https://untrusted.example/?access_token=private',cursors:{after:'page-next'}}});
    });
    assert.equal(requests.length,3);
    for (const request of requests) {
        assert.equal(new URL(request.url).hostname,'graph.facebook.com');
        assert.equal(request.options.method,'GET');
        assert.equal(request.options.headers.Authorization,`Bearer ${settings.instagramToken}`);
        assert.equal(request.url.includes(settings.instagramToken),false);
        assert.equal(request.options.body,undefined);
        assert.equal(/\bmessage\b/.test(new URL(request.url).searchParams.get('fields')),false,'message text is not requested');
    }
    const request = new URL(requests[1].url);
    assert.equal(request.searchParams.get('platform'),'instagram');
    assert.equal(request.searchParams.get('after'),'page-first');
    assert.equal(result.contacts.length,1,'business participants are excluded');
    assert.equal(result.contacts[0].instagram_user_id,person);
    assert.equal(result.contacts[0].display_name,'test_profile');
    assert.deepEqual(result.contacts[0].daily_activity,[at.replace('Z','.000Z'),'2026-10-01T17:01:00.000Z','2026-10-01T16:59:00.000Z']);
    assert.equal(result.contacts[0].history_complete,true);
    assert.equal(result.nextCursor,'page-next');
    assert.equal(result.account,`car-ig-${settings.instagramAccount}`);
    assert.equal(Object.hasOwn(result.contacts[0],'messages'),false);
});

test('wrong Page or linked Instagram account is rejected before reading conversations',async () => {
    for (const value of [{...page,id:'111111111'},{...page,instagram_business_account:{id:'17841400000000000'}},{id:settings.facebookPage}]) {
        let requests = 0;
        await assert.rejects(conversations(settings,'',async () => {requests++;return reply(value);}),error => error.status === 403 && error.code === 'INSTAGRAM_ACCOUNT_MISMATCH');
        assert.equal(requests,1);
    }
});

test('missing permissions, expired credentials and unavailable service do not report empty success or reveal secrets',async () => {
    for (const [code,status,reason] of [[230,403,'INSTAGRAM_PERMISSION_REQUIRED'],[190,401,'INSTAGRAM_TOKEN_EXPIRED']]) {
        await assert.rejects(conversations(settings,'',async () => ({ok:false,json:async () => ({error:{code,message:settings.instagramToken}})})),error => error.status === status && error.code === reason && !error.message.includes(settings.instagramToken));
    }
    await assert.rejects(conversations({},''),error => error.status === 503);
    await assert.rejects(conversations(settings,'',async () => {throw Error(settings.instagramToken);}),error => error.status === 502 && !error.message.includes(settings.instagramToken));
    await assert.rejects(conversations(settings,'x'.repeat(2049),async () => {throw Error('must not fetch');}),error => error.status === 400);
});

test('unavailable older history retains observed days and keeps first contact and new status unconfirmed',async () => {
    const row = thread(); row.messages.paging = {next:'ignored',cursors:{after:'older'}};
    const result = await conversations(settings,'',async url => {
        if (new URL(url).pathname.endsWith('/me')) return reply(page);
        if (new URL(url).pathname.endsWith('/messages')) return {ok:false,json:async () => ({error:{code:100}})};
        return reply({data:[row]});
    });
    assert.deepEqual(result.contacts[0].daily_activity,['2026-10-03T10:00:00.000Z']);
    assert.equal(result.contacts[0].history_complete,false);
    assert.equal(result.contacts[0].first_seen_at,null);
    assert.equal(result.contacts[0].customer_type,'');
    assert.equal(core.inboxActivities(result)[0].customer_type,'');
});

test('Instagram cursor pagination handles short pages, isolates channel caches and rejects cursor loops',async () => {
    const calls = [], query = {platform:'instagram',start:'2026-10-01',end:'2026-10-03'};
    const loader = core.createInboxLoader(async request => {
        calls.push(request);
        return {source:`${request.platform}-conversations`,contacts:[{id:request.cursor || 'first',last_seen_at:at}],nextCursor:request.cursor ? null : 'next'};
    });
    assert.deepEqual((await loader.load(query)).contacts.map(row => row.id),['first','next']);
    await loader.load({...query,platform:'facebook'});
    await loader.load(query);
    assert.deepEqual(calls.map(row => row.platform),['instagram','instagram','facebook','facebook']);
    const looping = core.createInboxLoader(async () => ({source:'instagram-conversations',contacts:[{id:'first',last_seen_at:at}],nextCursor:'same'}));
    await assert.rejects(looping.load(query),/หน้าถัดไป/);
});

test('verified Instagram selection is retry-safe and cannot use Facebook contacts or alter existing records',async () => {
    const database = store(':memory:');
    const configuration = {...settings,host:'127.0.0.1',accessKey:'test-key'};
    const fbPage = {id:settings.facebookPage};
    const facebookRow = thread(); facebookRow.participants.data = [{id:person,name:'Facebook person'}];
    const server = createServer(configuration,database,{
        instagramFetch:async url => reply(new URL(url).pathname.endsWith('/me') ? page : {data:[thread()]}),
        facebookFetch:async url => reply(new URL(url).pathname.endsWith('/me') ? fbPage : {data:[facebookRow]})
    });
    const original = database.saveLead({name:'Original CAR customer'},'fixture').lead;
    const installation = database.saveInstallation({leadId:original.id,date:'2026-10-03',amount:'3200'},'fixture');
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/lead-data/`;
    const headers = {'X-Car-Lead-Key':'test-key','Content-Type':'application/json'};
    const select = (platform = 'instagram',contactId = 'thread') => fetch(base+'select',{method:'POST',headers,body:JSON.stringify({platform,contactId,lead:{name:'Test Instagram',sheetKey:`instagram:${settings.instagramAccount}:${person}`,sheetSavedAt:'verified-fixture',sheetData:{channel:'IG',contact:'test_profile'}}})});
    try {
        assert.equal((await select()).status,404);
        assert.equal((await fetch(base+'inbox?platform=facebook',{headers})).status,200);
        assert.equal((await select()).status,404,'Facebook cache cannot supply Instagram contacts');
        assert.equal((await fetch(base+'inbox?platform=instagram')).status,401);
        assert.equal((await fetch(base+'inbox?platform=instagram',{headers})).status,200);
        assert.equal((await select('instagram','forged')).status,404);
        const first = await (await select()).json(), retry = await (await select()).json();
        assert.equal(retry.duplicate,true); assert.equal(first.lead.id,retry.lead.id);
        assert.equal(first.lead.source.platform,'instagram'); assert.equal(first.lead.sheetData.channel,'IG');
        assert.equal(first.lead.source.userId,person);
        const fb = await (await select('facebook')).json();
        assert.notEqual(fb.lead.id,first.lead.id,'same person number in another platform has a distinct identity');
        const intake = await (await fetch(base+'records?scope=intake',{headers})).json();
        assert.equal(intake.leads.length,2); assert.equal(intake.installations.length,0);
        assert.deepEqual(database.rows('leads').find(row => row.id === original.id),original);
        assert.deepEqual(database.rows('installations'),[installation]);
        const publicConfig = await (await fetch(base+'config')).json();
        assert.equal(JSON.stringify(publicConfig).includes(settings.instagramToken),false);
        assert.equal(JSON.stringify(publicConfig).includes(settings.facebookToken),false);
        assert.equal((await fetch(base.replace('/api/lead-data/','/')+'lead-data-instagram.cjs')).status,404);
        configuration.instagramAccount = '17841400000000000';
        assert.equal((await select()).status,404);
    } finally {await new Promise(resolve => server.close(resolve));database.db.close();}
});

test('Instagram permission failure leaves LINE and Facebook endpoints usable',async () => {
    const database = store(':memory:');
    database.receive('line',core.LINE_ACCOUNT,[{userId:'U-existing',eventId:'existing',at}]);
    const server = createServer({...settings,host:'127.0.0.1'},database,{
        instagramFetch:async url => new URL(url).pathname.endsWith('/me') ? reply(page) : {ok:false,json:async () => ({error:{code:230}})},
        facebookFetch:async url => reply(new URL(url).pathname.endsWith('/me') ? {id:settings.facebookPage} : {data:[]})
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/lead-data/`;
    try {
        const blocked = await fetch(base+'inbox?platform=instagram');
        assert.equal(blocked.status,403); assert.equal((await blocked.json()).code,'INSTAGRAM_PERMISSION_REQUIRED');
        const line = await (await fetch(base+'inbox?platform=line')).json(); assert.equal(line.contacts.length,1);
        assert.equal((await fetch(base+'inbox?platform=facebook')).status,200);
        assert.equal(database.rows('leads').length,0,'reads must never create leads');
    } finally {await new Promise(resolve => server.close(resolve));database.db.close();}
});

test('saved-contact matching and selection use the Instagram identity instead of Facebook',() => {
    const source = fs.readFileSync(require.resolve('../lead-data-app.js'),'utf8');
    const context = vm.createContext({core,tab:'instagram',account:`car-ig-${settings.instagramAccount}`,sheetChecked:true,
        sheetContacts:[{channel:'FB',contact:'test_profile'}],records:{leads:[{id:'ig',identity:core.identity('instagram',`car-ig-${settings.instagramAccount}`,person)}]}});
    for (const name of ['existsInLeadSheet','selectedLead']) {
        const match = source.match(new RegExp(`^    function ${name}\\([\\s\\S]*?^    }`,'m'));
        assert.ok(match); vm.runInContext(match[0],context);
    }
    const row = {instagram_user_id:person,display_name:'test_profile'};
    assert.equal(context.selectedLead(row).id,'ig');
    assert.equal(context.existsInLeadSheet(row),false,'same Facebook profile name must not mark Instagram saved');
    context.sheetContacts.push({channel:'IG',contact:'test_profile'});
    assert.equal(context.existsInLeadSheet(row),true);
    context.sheetContacts = [{channel:'Instagram',contact:'test_profile'}];
    assert.equal(context.existsInLeadSheet(row),true);
    context.sheetChecked = false;
    assert.equal(context.existsInLeadSheet(row),false,'unverified saved status stays disabled');
});

test('late saved-contact reads cannot replace an Instagram permission error with zero statistics',async () => {
    const source = fs.readFileSync(require.resolve('../lead-data-app.js'),'utf8');
    const pagination = {hidden:false}, elements = new Map();
    const $ = id => {if (!elements.has(id)) elements.set(id,{hidden:false,innerHTML:'',textContent:'',closest:() => pagination});return elements.get(id);};
    let resolve;
    const pending = new Promise(done => {resolve=done;});
    const context = vm.createContext({$,tab:'instagram',session:{id:'test'},service:'test',savedLeadRevision:0,
        contacts:[],settings:{instagramUsername:'test_profile'},instagramError:{code:'INSTAGRAM_PERMISSION_REQUIRED'},
        instagramConnection:() => '<div>Waiting for Instagram permission</div>',
        sheetContacts:[],sheetChecked:false,sheetContactCache:{get:()=>pending}});
    for (const name of ['renderInbox','checkSheetContacts']) {
        const match = source.match(new RegExp(`^    (?:async )?function ${name}\\([\\s\\S]*?^    }`,'m'));
        assert.ok(match);vm.runInContext(match[0],context);
    }
    context.renderInbox();
    const late = context.checkSheetContacts();
    resolve({contacts:[]});await late;
    assert.equal($('inbox-summary').hidden,true);
    assert.equal(pagination.hidden,true);
    assert.match($('inbox-list').innerHTML,/Waiting for Instagram permission/);
});

test('Instagram Lead customer drafts retain their profile and source while existing LINE and Facebook drafts keep their mappings',() => {
    const html = fs.readFileSync(require.resolve('../customer-data.html'),'utf8');
    const start = html.indexOf('window.applyLeadCustomerDraft = function () {');
    const callback = html.slice(start,html.indexOf('\n};',start)+3);
    assert.ok(start >= 0);
    for (const [channel,expected] of [['IG','IG'],['Instagram','IG'],['FB','Facebook'],['Line','Line']]) {
        const elements = new Map(), choices = ['IG','Facebook','Line'].map(value => ({value,checked:false}));
        const get = id => {if(!elements.has(id))elements.set(id,{value:'',hidden:true,dispatchEvent(){}});return elements.get(id);};
        const known = {value:'',options:[{value:'Line'},{value:'Facebook'}],append(option){this.options.push(option);}};
        elements.set('firstKnown',known);
        const data = {channel,contact:'test_profile',name:'Test lead',knownFrom:expected === 'IG' ? 'Instagram' : expected};
        let removed = false, drawer = '';
        const context = vm.createContext({window:{},Date,URLSearchParams,location:{search:'?fromLead=1'},Event:class {},
            sessionStorage:{getItem:() => JSON.stringify({createdAt:Date.now(),data}),removeItem:()=>{removed=true;}},
            document:{getElementById:get,querySelectorAll:() => choices,createElement:() => ({})},
            resizeCustomerNote(){},openCustomerDrawer:title => {drawer=title;}});
        vm.runInContext(callback,context);context.window.applyLeadCustomerDraft();
        assert.equal(choices.find(choice => choice.checked)?.value,expected);
        assert.equal(get('contactName').value,'test_profile');
        assert.equal(known.value,data.knownFrom);
        assert.equal(removed,true); assert.ok(drawer);
        if(expected !== 'IG')assert.equal(known.options.length,2,'existing drafts do not change source options');
    }
});

test('Instagram customer badges stay distinct while LINE and Facebook retain their existing colors',() => {
    const html = fs.readFileSync(require.resolve('../customer-data.html'),'utf8');
    const match = html.match(/        function getChannelBadge\([\s\S]*?^        }/m);
    assert.ok(match);const context = vm.createContext({});vm.runInContext(match[0],context);
    assert.match(context.getChannelBadge('IG'),/purple/);
    assert.match(context.getChannelBadge('Instagram'),/purple/);
    assert.match(context.getChannelBadge('Facebook'),/blue/);
    assert.match(context.getChannelBadge('Line'),/green/);
});
