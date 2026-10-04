'use strict';
const APP_ID='1703232694436408';
const fail=(message,status=502)=>Object.assign(new Error(message),{status});
function validateTest(recipient,now) {
    const received=Date.parse(recipient?.receivedAt);
    if(recipient?.username!=='crazyoilly' || !/^\d{5,30}$/.test(recipient?.recipientId||'') || !Number.isFinite(received) || now-received<0 || now-received>=86400000) throw fail('รับช่วงได้เฉพาะแชต Test ใหม่ของ @crazyoilly',409);
}
async function request(settings,recipient,resource,method,fetchImpl) {
    const url=new URL(`https://graph.facebook.com/v25.0/${settings.facebookPage}/${resource}`);
    if(method==='GET') url.searchParams.set('recipient',recipient.recipientId);
    let response,result;
    try {
        response=await fetchImpl(url,{method,redirect:'error',headers:{Authorization:`Bearer ${settings.instagramToken}`,...(method==='POST' ? {'Content-Type':'application/json'} : {})},...(method==='POST' ? {body:JSON.stringify({recipient:{id:recipient.recipientId}})} : {}),signal:AbortSignal.timeout(20000)});
        result=await response.json();
    } catch {const error=fail('ยังยืนยันการควบคุมแชตไม่ได้ กรุณาตรวจสถานะก่อนทำซ้ำ');error.uncertain=true;throw error;}
    if(!response.ok || result.error) throw fail(`Meta ยังไม่อนุญาตการควบคุมแชตทดสอบ (HTTP ${response.status} · รหัส ${Number(result.error?.code)||'ไม่ระบุ'}${Number(result.error?.error_subcode) ? ` · รหัสย่อย ${Number(result.error.error_subcode)}` : ''})`);
    return result;
}
async function readTestThreadOwner(settings,recipient,fetchImpl=fetch,now=Date.now()) {
    validateTest(recipient,now);
    const result=await request(settings,recipient,'thread_owner','GET',fetchImpl);
    if(!Array.isArray(result.data)) throw fail('Meta ส่งสถานะการควบคุมแชตที่ตรวจไม่ได้');
    if(!result.data.length) return 'idle';
    const owner=result.data[0]?.thread_owner;
    if(!owner || typeof owner!=='object') throw fail('Meta ส่งสถานะการควบคุมแชตที่ตรวจไม่ได้');
    return String(owner.app_id||'')===APP_ID ? 'crm' : 'other';
}
async function changeTestThread(settings,recipient,action,fetchImpl=fetch,now=Date.now()) {
    validateTest(recipient,now);
    if(!['take','release'].includes(action)) throw fail('ไม่รองรับคำสั่งนี้',400);
    const result=await request(settings,recipient,action==='take' ? 'take_thread_control' : 'release_thread_control','POST',fetchImpl);
    if(result.success!==true) {const error=fail('Meta ยังไม่ยืนยันผลการควบคุมแชต กรุณาตรวจสถานะก่อนทำซ้ำ');error.uncertain=true;throw error;}
    return {success:true};
}
module.exports={readTestThreadOwner,changeTestThread};
