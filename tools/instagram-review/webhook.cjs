'use strict';
const http=require('node:http');
const crypto=require('node:crypto');
const WEBHOOK_PATH='/instagram-review-webhook';
const RECIPIENT='crazyoilly';
const fail=message=>Object.assign(new Error(message),{status:502});

async function verifyWebhookRecipient(settings,recipient,fetchImpl=fetch,now=Date.now()) {
    if (recipient?.username!==RECIPIENT || !/^\d{5,30}$/.test(recipient.recipientId||'') || !Number.isFinite(Date.parse(recipient.receivedAt)) || now-Date.parse(recipient.receivedAt)<0 || now-Date.parse(recipient.receivedAt)>=86400000) throw fail('ยังไม่มีข้อความ Test ที่ยืนยันได้จาก @crazyoilly');
    async function get(resource,fields) {
        const url=new URL(`https://graph.facebook.com/v25.0/${resource}`);
        url.searchParams.set('fields',fields);
        let response,value;
        try { response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{Authorization:`Bearer ${settings.instagramToken}`},signal:AbortSignal.timeout(15000)}); value=await response.json(); }
        catch { throw fail('Meta ยังตรวจผู้ส่งข้อความทดสอบไม่ได้'); }
        if (!response.ok || value.error) throw fail(`Meta ยังตรวจผู้ส่งไม่ได้ (HTTP ${response.status} · รหัส ${Number(value.error?.code)||'ไม่ระบุ'})`);
        return value;
    }
    const page=await get('me','id,instagram_business_account{id,username}');
    if (String(page.id)!==settings.facebookPage || String(page.instagram_business_account?.id)!==settings.instagramAccount || page.instagram_business_account?.username?.toLowerCase()!=='mhlcarfilm') throw fail('บัญชีทดสอบไม่ตรงกับ @mhlcarfilm');
    const profile=await get(recipient.recipientId,'username');
    if (String(profile.username||'').toLowerCase()!==RECIPIENT) throw fail('ผู้ส่งข้อความไม่ใช่ @crazyoilly');
    return {...recipient,source:'webhook'};
}

function createTestWebhook({getSettings,getSecret,verifyToken,onVerified,fetchImpl=fetch,now=Date.now}) {
    const started=now(),seen=new Set();
    const diagnostics={signedEvents:0,testCandidates:0,verifiedTests:0,senderCheck:'waiting',lastError:''};
    let processing=false;
    const server=http.createServer(async(req,res)=>{
        function reply(status,value) { res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(value); }
        try {
            const url=new URL(req.url,'http://127.0.0.1');
            if (url.pathname!==WEBHOOK_PATH) return reply(404,'Not found');
            const secret=getSecret();
            if (!/^[a-fA-F0-9]{32}$/.test(secret||'')) return reply(503,'Test receiver not configured');
            if (now()-started>7200000) return reply(410,'Test session ended');
            if (req.method==='GET') {
                const challenge=url.searchParams.get('hub.challenge');
                if (url.searchParams.get('hub.mode')!=='subscribe' || url.searchParams.get('hub.verify_token')!==verifyToken || !/^\d{1,64}$/.test(challenge||'')) return reply(403,'Verification failed');
                return reply(200,challenge);
            }
            if (req.method!=='POST') return reply(405,'Method not allowed');
            let raw=Buffer.alloc(0);
            for await (const chunk of req) { if (raw.length+chunk.length>65536) return reply(413,'Payload too large'); raw=Buffer.concat([raw,chunk]); }
            const signature=req.headers['x-hub-signature-256'];
            if (typeof signature!=='string' || !/^sha256=[a-fA-F0-9]{64}$/.test(signature) || !crypto.timingSafeEqual(crypto.createHmac('sha256',secret).update(raw).digest(),Buffer.from(signature.slice(7),'hex'))) return reply(403,'Signature rejected');
            let payload; try { payload=JSON.parse(raw); } catch { return reply(400,'Invalid JSON'); }
            diagnostics.signedEvents++;
            const settings=getSettings(),candidates=[];
            if (payload.object==='instagram' && Array.isArray(payload.entry)) for (const entry of payload.entry) {
                if (String(entry.id)!==settings.instagramAccount || !Array.isArray(entry.messaging)) continue;
                for (const event of entry.messaging) {
                    const sender=String(event.sender?.id||''),time=event.timestamp,mid=event.message?.mid;
                    if (String(event.recipient?.id)!==settings.instagramAccount || !/^\d{5,30}$/.test(sender) || [settings.instagramAccount,settings.facebookPage].includes(sender) || event.message?.is_echo || String(event.message?.text||'').trim().toLowerCase()!=='test' || typeof mid!=='string' || !mid || mid.length>512 || typeof time!=='number' || !Number.isFinite(time) || time<started || time>now() || now()-time>=86400000 || seen.has(mid)) continue;
                    candidates.push({username:RECIPIENT,recipientId:sender,receivedAt:new Date(time).toISOString(),mid});
                    if (candidates.length>=4) break;
                }
                if (candidates.length>=4) break;
            }
            reply(200,'EVENT_RECEIVED');
            if (processing || !candidates.length) return;
            processing=true;
            diagnostics.senderCheck='checking';
            try { for (const candidate of candidates) {
                diagnostics.testCandidates++;
                seen.add(candidate.mid); while(seen.size>100) seen.delete(seen.values().next().value);
                try {
                    const result=await verifyWebhookRecipient(settings,candidate,fetchImpl,now());
                    onVerified({username:result.username,recipientId:result.recipientId,receivedAt:result.receivedAt,source:'webhook'});
                    diagnostics.verifiedTests++; diagnostics.senderCheck='verified'; diagnostics.lastError='';
                } catch(error) {
                    diagnostics.senderCheck='rejected'; diagnostics.lastError=error.message;
                    /* Never retain or log message payloads or unrelated profiles. */
                }
            } } finally { processing=false; }
        } catch { if (!res.headersSent) reply(400,'Request rejected'); }
    });
    server.requestTimeout=10000;
    server.headersTimeout=10000;
    server.getReviewDiagnostics=()=>({...diagnostics});
    return server;
}
module.exports={createTestWebhook,verifyWebhookRecipient,WEBHOOK_PATH};
