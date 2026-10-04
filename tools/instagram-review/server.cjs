'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {config} = require('../../lead-data-server.cjs');
const {createTestWebhook,verifyWebhookRecipient,WEBHOOK_PATH}=require('./webhook.cjs');
const {readTestThreadOwner,changeTestThread}=require('./thread.cjs');
const RECIPIENT = 'crazyoilly';
const TEST_REPLY = 'ทดสอบเชื่อมต่อ CAR CRM สำหรับขอสิทธิ์ Meta';
const assets = new Map([['/',['index.html','text/html']],['/review.js',['review.js','text/javascript']],['/review.css',['review.css','text/css']]]);
const fail = (message,status=502) => Object.assign(new Error(message),{status});
function safeSendFailure(result,settings,recipient,status) {
    const error=result?.error || {};
    let detail=String(error.message || '').slice(0,800);
    for (const value of [settings.instagramToken,settings.facebookPage,settings.instagramAccount,recipient.recipientId]) if (value) detail=detail.split(String(value)).join('[redacted]');
    detail=detail.replace(/https?:\/\/\S+/gi,'[URL]').replace(/\b(?:EAA|IGAA)[A-Za-z0-9_-]{16,}\b/g,'[token]').replace(/\b\d{10,30}\b/g,'[id]');
    const subcode=Number(error.error_subcode);
    return fail(`Meta ยังไม่รับข้อความทดสอบ (HTTP ${status} · รหัส ${Number(error.code)||'ไม่ระบุ'}${subcode ? ` · รหัสย่อย ${subcode}` : ''})${detail ? ` · ${detail}` : ''}`);
}

async function verifyRecipient(settings, fetchImpl = fetch, now = Date.now()) {
    if (!settings.instagramToken) throw fail('ยังไม่ได้ตั้งค่าโทเคน Instagram',503);
    async function get(resource,params) {
        const url = new URL(`https://graph.facebook.com/v25.0/${resource}`);
        for (const [key,value] of Object.entries(params)) url.searchParams.set(key,value);
        let response,result;
        try {
            response = await fetchImpl(url,{method:'GET',redirect:'error',headers:{Authorization:`Bearer ${settings.instagramToken}`},signal:AbortSignal.timeout(20000)});
            result = await response.json();
        } catch { throw fail('Meta API ยังอ่านข้อความทดสอบไม่สำเร็จ กรุณาตรวจสิทธิ์ก่อนเริ่มอัด'); }
        if (!response.ok || result.error) {
            if ([10,200,230,3].includes(result.error?.code)) throw fail('Meta ยังไม่อนุญาตการอ่านแชตทดสอบ กรุณาตรวจบทบาทของบัญชีทดสอบและสิทธิ์ Instagram',403);
            if (result.error?.code === 190) throw fail('โทเคน Instagram หมดอายุ กรุณาอัปเดตสิทธิ์เชื่อมต่อ',401);
            throw fail(`Meta API ยังอ่านแชตไม่ได้ (HTTP ${response.status} · รหัส ${Number(result.error?.code) || 'ไม่ระบุ'})`);
        }
        return result;
    }
    const page = await get('me',{fields:'id,instagram_business_account{id,username}'});
    if (String(page.id) !== settings.facebookPage || String(page.instagram_business_account?.id) !== settings.instagramAccount) throw fail('บัญชีที่เชื่อมอยู่ไม่ตรงกับ @mhlcarfilm',403);
    if (String(page.instagram_business_account?.username || '').toLowerCase() !== 'mhlcarfilm') throw fail('บัญชีที่เชื่อมอยู่ไม่ตรงกับ @mhlcarfilm',403);
    let after = '', target;
    const visited = new Set();
    for (let pageNumber=0;pageNumber<4;pageNumber++) {
        const result = await get(`${settings.facebookPage}/conversations`,{platform:'instagram',fields:'id,participants,updated_time',limit:'25',...(after ? {after} : {})});
        if (!Array.isArray(result.data)) throw fail('Meta ส่งข้อมูลบทสนทนาในรูปแบบที่ตรวจไม่ได้');
        for (const conversation of result.data) {
            const person = (conversation.participants?.data || []).find(person => String(person.username || '').replace(/^@/,'').toLowerCase() === RECIPIENT);
            if (person && /^\d{5,30}$/.test(String(person.id)) && ![settings.facebookPage,settings.instagramAccount].includes(String(person.id))) { target={id:String(person.id),conversationId:conversation.id}; break; }
        }
        if (target || !result.paging?.next) break;
        after = result.paging.cursors?.after;
        if (typeof after !== 'string' || !after || after.length>2048 || visited.has(after)) throw fail('Meta ส่งรหัสหน้าถัดไปที่ตรวจไม่ได้');
        visited.add(after);
    }
    if (!target) throw fail('ยังไม่พบบทสนทนาของ @Crazyoilly ผ่าน API กรุณาตรวจบทบาทบัญชีทดสอบ และทัก Test ใหม่',409);
    const messages = await get(`${encodeURIComponent(target.conversationId)}/messages`,{fields:'id,from,created_time,message',limit:'20'});
    const inbound = (messages.data || []).find(message => String(message.from?.id) === target.id && String(message.message || '').trim().toLowerCase() === 'test' && Number.isFinite(Date.parse(message.created_time)) && now-Date.parse(message.created_time)>=0 && now-Date.parse(message.created_time)<86400000);
    if (!inbound) throw fail('ยังไม่พบข้อความ Test จาก @Crazyoilly ภายใน 24 ชั่วโมง กรุณาทัก Test มาใหม่',409);
    return {username:RECIPIENT,receivedAt:inbound.created_time,recipientId:target.id};
}

async function sendTestReply(settings,recipient,fetchImpl=fetch,now=Date.now()) {
    if (recipient?.username !== RECIPIENT || !/^\d{5,30}$/.test(recipient.recipientId || '') || !Number.isFinite(Date.parse(recipient.receivedAt)) || now-Date.parse(recipient.receivedAt)<0 || now-Date.parse(recipient.receivedAt)>=86400000) throw fail('กรุณาตรวจข้อความ Test ใหม่ก่อนตอบ',409);
    let response,result;
    try {
        response=await fetchImpl(`https://graph.facebook.com/v25.0/${settings.facebookPage}/messages`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${settings.instagramToken}`,'Content-Type':'application/json'},body:JSON.stringify({recipient:{id:recipient.recipientId},message:{text:TEST_REPLY}}),signal:AbortSignal.timeout(20000)});
        result=await response.json();
    } catch { const error=fail('ยังยืนยันผลการส่งไม่ได้ กรุณาดูแชต @Crazyoilly ก่อน ห้ามส่งซ้ำอัตโนมัติ'); error.uncertain=true; throw error; }
    if (!response.ok || result.error) throw safeSendFailure(result,settings,recipient,response.status);
    if (String(result.recipient_id)!==recipient.recipientId || typeof result.message_id !== 'string' || !result.message_id) { const error=fail('Meta ตอบกลับไม่ครบ กรุณาดูแชต @Crazyoilly ก่อนส่งอีกครั้ง'); error.uncertain=true; throw error; }
    return {messageId:result.message_id};
}

function createReviewServer(getSettings = config, fetchImpl = fetch, options = {}) {
    const reviewKey=crypto.randomBytes(32).toString('hex');
    const verifyToken=/^[a-f0-9]{64}$/.test(options.verifyToken||'') ? options.verifyToken : crypto.randomBytes(32).toString('hex');
    let verified=null,sendState='idle',reviewSecret='',threadState='idle',lastSendAttemptAt=0;
    async function releaseTestThread() {
        if(!verified || !['controlled','unknown'].includes(threadState)) return;
        const settings=getSettings();
        const owner=await readTestThreadOwner(settings,verified,fetchImpl);
        if(owner!=='crm') {threadState='released';return;}
        threadState='releasing';
        try {await changeTestThread(settings,verified,'release',fetchImpl);threadState='released';}
        catch(error) {threadState=error.uncertain ? 'unknown' : 'controlled';throw error;}
    }
    const server=http.createServer(async (req,res) => {
        function json(status,value) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(value)); }
        try {
            if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) throw fail('ไม่อนุญาต host นี้',403);
            if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw fail('ไม่อนุญาต origin นี้',403);
            const url = new URL(req.url,`http://${req.headers.host}`);
            if(url.pathname==='/api/new-round' && req.method==='POST') {
                if(req.headers.origin!==`http://${req.headers.host}` || req.headers['x-review-key']!==reviewKey || req.headers['content-type']!=='application/json') throw fail('ไม่อนุญาตให้เริ่มรอบใหม่จากหน้านี้',403);
                let raw='';for await(const chunk of req) {raw+=chunk;if(Buffer.byteLength(raw)>128) throw fail('คำขอมีขนาดเกินกำหนด',413);}
                let value;try {value=JSON.parse(raw);} catch {throw fail('รูปแบบคำขอไม่ถูกต้อง',400);}
                if(Object.keys(value||{}).length!==1 || value.confirm!==true) throw fail('ต้องยืนยันการเริ่มรอบใหม่',400);
                if(sendState!=='sent' || !['idle','released'].includes(threadState)) throw fail('เริ่มรอบใหม่ได้หลังยืนยันการส่งและคืนการควบคุมแล้วเท่านั้น',409);
                if(!verified || verified.source!=='webhook' || Date.parse(verified.receivedAt)<=lastSendAttemptAt || Date.now()-verified.checkedAt>300000) throw fail('ต้องได้รับ Test ใหม่หลังส่งครั้งก่อนจึงเริ่มรอบใหม่ได้',409);
                const fresh=await verifyWebhookRecipient(getSettings(),verified,fetchImpl);
                if(fresh.recipientId!==verified.recipientId) throw fail('บัญชีทดสอบไม่ตรงกับที่ตรวจไว้',409);
                sendState='idle';json(200,{sendState});return;
            }
            if(url.pathname==='/api/test-thread' && req.method==='POST') {
                if(!options.allowThreadControl) throw fail('ยังไม่ได้อนุญาตการรับช่วงแชตสำหรับรอบนี้',403);
                if(req.headers.origin!==`http://${req.headers.host}` || req.headers['x-review-key']!==reviewKey || req.headers['content-type']!=='application/json') throw fail('ไม่อนุญาตให้ควบคุมแชตจากหน้านี้',403);
                let raw='';for await(const chunk of req) {raw+=chunk;if(Buffer.byteLength(raw)>128) throw fail('คำขอมีขนาดเกินกำหนด',413);}
                let value;try {value=JSON.parse(raw);} catch {throw fail('รูปแบบคำขอไม่ถูกต้อง',400);}
                if(Object.keys(value||{}).length!==1 || !['take','release'].includes(value.action)) throw fail('คำสั่งรับช่วงแชตไม่ถูกต้อง',400);
                if(!verified || verified.source!=='webhook') throw fail('ต้องมี Test ที่ยืนยันผ่าน Webhook ก่อน',409);
                if(value.action==='release') {await releaseTestThread();json(200,{threadState});return;}
                if(Date.now()-verified.checkedAt>300000) throw fail('กรุณาตรวจข้อความ Test ใหม่ก่อนรับช่วงแชต',409);
                if(['taking','controlled','releasing','unknown'].includes(threadState)) throw fail('กรุณาตรวจสถานะการควบคุมก่อนทำซ้ำ',409);
                const fresh=await verifyWebhookRecipient(getSettings(),verified,fetchImpl);
                if(fresh.recipientId!==verified.recipientId) throw fail('บัญชีทดสอบไม่ตรงกับที่ตรวจไว้',409);
                threadState='taking';
                try {await changeTestThread(getSettings(),fresh,'take',fetchImpl);threadState='controlled';json(200,{threadState});}
                catch(error) {threadState=error.uncertain ? 'unknown' : 'idle';throw error;}
                return;
            }
            if (url.pathname==='/api/review-secret' && req.method==='POST') {
                if (req.headers.origin!==`http://${req.headers.host}` || req.headers['x-review-key']!==reviewKey || req.headers['content-type']!=='application/json') throw fail('ไม่อนุญาตให้ตั้งค่าจากหน้านี้',403);
                let raw=''; for await(const chunk of req) { raw+=chunk; if(Buffer.byteLength(raw)>256) throw fail('คำขอมีขนาดเกินกำหนด',413); }
                let value; try { value=JSON.parse(raw); } catch { throw fail('รูปแบบคำขอไม่ถูกต้อง',400); }
                if (Object.keys(value||{}).length!==1 || !/^[a-fA-F0-9]{32}$/.test(value.secret||'')) throw fail('App Secret ต้องเป็นรหัส 32 ตัวจากแอป CRM_LEAD',400);
                reviewSecret=value.secret; json(200,{configured:true}); return;
            }
            if (url.pathname==='/api/save-recording' && req.method==='POST') {
                if (req.headers.origin!==`http://${req.headers.host}` || req.headers['x-review-key']!==reviewKey) throw fail('ไม่อนุญาตให้บันทึกจากหน้านี้',403);
                const type=req.headers['content-type'];
                if (!['video/mp4','video/webm'].includes(type)) throw fail('รองรับเฉพาะวิดีโอ MP4 หรือ WebM',400);
                const limit=64*1024*1024;
                if (Number(req.headers['content-length'])>limit) throw fail('วิดีโอต้องมีขนาดไม่เกิน 64 MB',413);
                const chunks=[]; let size=0;
                for await (const chunk of req) { size+=chunk.length; if(size>limit) throw fail('วิดีโอต้องมีขนาดไม่เกิน 64 MB',413); chunks.push(chunk); }
                const video=Buffer.concat(chunks);
                const valid=type==='video/mp4' ? video.length>12 && video.toString('ascii',4,8)==='ftyp' : video.length>4 && video.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
                if (!valid) throw fail('ไม่พบข้อมูลวิดีโอที่รองรับ',400);
                const directory=path.join(__dirname,'recordings');
                fs.mkdirSync(directory,{recursive:true});
                const fileName=`CAR-CRM-Instagram-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(4).toString('hex')}.${type==='video/mp4' ? 'mp4' : 'webm'}`;
                const filePath=path.join(directory,fileName);
                fs.writeFileSync(filePath,video,{flag:'wx'});
                json(200,{filePath,size}); return;
            }
            if (url.pathname === '/api/send-test' && req.method==='POST') {
                const key=req.headers['x-review-key'];
                if (req.headers.origin !== `http://${req.headers.host}` || typeof key!=='string' || !/^[a-f0-9]{64}$/.test(key) || !crypto.timingSafeEqual(Buffer.from(key),Buffer.from(reviewKey))) throw fail('ไม่อนุญาตให้ส่งจากหน้านี้',403);
                if (['sending','sent','unknown'].includes(sendState)) throw fail('ส่งคำขอไปแล้ว กรุณาตรวจแชต @Crazyoilly ก่อน',409);
                if (!verified || Date.now()-verified.checkedAt>300000) throw fail('กรุณาตรวจข้อความ Test ใหม่ก่อนตอบ',409);
                if (req.headers['content-type']!=='application/json') throw fail('รูปแบบคำขอไม่ถูกต้อง',400);
                let raw=''; for await (const chunk of req) { raw+=chunk; if (Buffer.byteLength(raw)>1024) throw fail('คำขอมีขนาดเกินกำหนด',413); }
                let value; try { value=JSON.parse(raw); } catch { throw fail('รูปแบบคำขอไม่ถูกต้อง',400); }
                if (value?.confirm !== true || Object.keys(value).length!==1) throw fail('กรุณายืนยันข้อความทดสอบที่แสดงบนหน้าจอ',400);
                sendState='sending';lastSendAttemptAt=Date.now();
                try {
                    const settings=getSettings();
                    const fresh=verified.source==='webhook' ? await verifyWebhookRecipient(settings,verified,fetchImpl) : await verifyRecipient(settings,fetchImpl);
                    if (fresh.recipientId!==verified.recipientId) throw fail('บัญชีทดสอบไม่ตรงกับที่ตรวจไว้',409);
                    const result=await sendTestReply(settings,fresh,fetchImpl);
                    sendState='sent';
                    try {await releaseTestThread();} catch {}
                    json(200,{...result,message:TEST_REPLY,recipient:RECIPIENT,threadState});
                } catch(error) { sendState=error.uncertain ? 'unknown' : 'failed';try {await releaseTestThread();} catch {}throw error; }
                return;
            }
            if (req.method !== 'GET') throw fail('ไม่รองรับคำขอนี้',405);
            if (url.pathname === '/api/status') { const settings=getSettings(); json(200,{configured:Boolean(settings.instagramToken),account:'mhlcarfilm',recipient:RECIPIENT,reviewKey,sendState,threadState,threadControlAllowed:Boolean(options.allowThreadControl),webhookReady:Boolean(reviewSecret),webhookTestReceived:Boolean(verified?.source==='webhook'),webhookPath:WEBHOOK_PATH,webhookPort:3095,verifyToken,webhookDiagnostics:server.reviewWebhook.getReviewDiagnostics()}); return; }
            if(url.pathname==='/api/test-thread') {
                if(!options.allowThreadControl || !verified || verified.source!=='webhook') throw fail('ยังไม่มีแชตทดสอบที่อนุญาตให้ตรวจ',409);
                const owner=await readTestThreadOwner(getSettings(),verified,fetchImpl);
                if(threadState==='unknown') threadState=owner==='crm' ? 'controlled' : 'released';
                json(200,{owner,threadState});return;
            }
            if (url.pathname === '/api/verify') {
                if (reviewSecret && verified?.source!=='webhook') {
                    const diagnostics=server.reviewWebhook.getReviewDiagnostics();
                    throw fail(diagnostics.lastError || 'ยังไม่ได้รับ Test ที่ยืนยันผู้ส่งได้ผ่าน Webhook กรุณาส่ง Test หลังเปิดรับข้อความแล้ว',409);
                }
                const settings=getSettings(); const result=verified?.source==='webhook' ? await verifyWebhookRecipient(settings,verified,fetchImpl) : await verifyRecipient(settings,fetchImpl);
                verified={...result,checkedAt:Date.now()}; json(200,{username:result.username,receivedAt:result.receivedAt,sendState,source:result.source||'api'}); return;
            }
            const asset = assets.get(url.pathname);
            if (!asset) throw fail('ไม่พบหน้านี้',404);
            res.writeHead(200,{'Content-Type':`${asset[1]}; charset=utf-8`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'"});
            res.end(fs.readFileSync(path.join(__dirname,asset[0])));
        } catch(error) { json(error.status || 500,{message:error.status ? error.message : 'ตรวจการเชื่อมต่อไม่สำเร็จ'}); }
    });
    server.reviewWebhook=createTestWebhook({getSettings,getSecret:()=>reviewSecret,verifyToken,fetchImpl,onVerified:result=>{verified={...result,checkedAt:Date.now()};}});
    return server;
}
if (require.main === module) {
    const server=createReviewServer(config,fetch,{verifyToken:process.env.CAR_IG_REVIEW_VERIFY_TOKEN,allowThreadControl:process.env.CAR_IG_REVIEW_THREAD_CONTROL==='1'});
    server.listen(3094,'127.0.0.1',()=>console.log('Instagram review recorder: http://127.0.0.1:3094/'));
    server.reviewWebhook.listen(3095,'127.0.0.1',()=>console.log('Isolated Instagram test webhook: loopback port 3095'));
}
module.exports={verifyRecipient,sendTestReply,createReviewServer,TEST_REPLY};
