'use strict';
function validateCaptureSource(settings, handle, expectedHandle, expectedOrigin) {
    if (settings?.displaySurface !== 'browser') throw new Error('กรุณาเลือกแท็บ Chrome ของหน้าสาธิตนี้ แทนหน้าต่างหรือทั้งหน้าจอ');
    if (!handle || handle.handle !== expectedHandle || handle.origin !== expectedOrigin) throw new Error('แท็บที่เลือกไม่ใช่หน้าสาธิตนี้ กรุณาเลือก “CAR CRM · สาธิต Instagram รอบจริง”');
    return true;
}
if (typeof module !== 'undefined' && module.exports) module.exports = {validateCaptureSource};
if (typeof document !== 'undefined') {
const $ = id => document.getElementById(id);
let recording = null, stream = null, chunks = [], previewUrl = null, timer = null, startedAt = 0;
let reviewKey = '', sendState = 'idle';
let recordedBlob = null;
const captureHandle = crypto.randomUUID();
const captureSupported = !!navigator.mediaDevices?.setCaptureHandleConfig && typeof MediaStreamTrack !== 'undefined' && 'getCaptureHandle' in MediaStreamTrack.prototype;
if (captureSupported) navigator.mediaDevices.setCaptureHandleConfig({handle:captureHandle,exposeOrigin:true,permittedOrigins:[location.origin]});
$('new-round').addEventListener('click',async()=>{
    try {
        const response=await fetch('/api/new-round',{method:'POST',headers:{'Content-Type':'application/json','X-Review-Key':reviewKey},body:JSON.stringify({confirm:true})});
        const result=await response.json();if(!response.ok) throw new Error(result.message);
        sendState=result.sendState;$('new-round').hidden=true;$('reply-confirm').checked=false;$('reply').disabled=true;
        $('reply-status').textContent='พร้อมสาธิตการตอบ Test ใหม่';$('new-round-status').textContent='';
    } catch(error) {$('new-round-status').textContent=error.message;}
});
function threadStatus(state) {
    $('thread-status').textContent=state==='controlled' ? 'CAR CRM รับช่วงเฉพาะแชตทดสอบแล้ว · พร้อมตอบข้อความ' : state==='released' ? 'คืนการควบคุมแชตให้ระบบเดิมแล้ว' : state==='unknown' ? 'ยังยืนยันการควบคุมแชตไม่ได้ · กรุณาตรวจสถานะก่อนทำซ้ำ' : 'ยังไม่ได้รับช่วงแชตทดสอบ';
    $('thread-take').disabled=['taking','controlled','releasing','unknown'].includes(state);
}
for(const action of ['take','release']) $('thread-'+action).addEventListener('click',async()=>{
    $('thread-'+action).disabled=true;
    try {
        const response=await fetch('/api/test-thread',{method:'POST',headers:{'Content-Type':'application/json','X-Review-Key':reviewKey},body:JSON.stringify({action})});
        const result=await response.json();
        if(!response.ok) throw new Error(result.message);
        threadStatus(result.threadState);
    } catch(error) {$('thread-status').textContent=error.message;}
    finally {$('thread-release').disabled=false;}
});
$('thread-check').addEventListener('click',async()=>{
    try {const result=await api('/api/test-thread');threadStatus(result.threadState);$('thread-status').textContent+=result.owner==='crm' ? ' · เจ้าของแชตคือ CAR CRM' : result.owner==='idle' ? ' · แชตพร้อมให้ระบบเดิมรับช่วง' : ' · แอปเดิมเป็นผู้ควบคุมแชต';}
    catch(error) {$('thread-status').textContent=error.message;}
});

$('secret-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const secret=$('app-secret').value.trim();
    $('app-secret').value='';
    try {
        const response=await fetch('/api/review-secret',{method:'POST',headers:{'Content-Type':'application/json','X-Review-Key':reviewKey},body:JSON.stringify({secret})});
        const result=await response.json();
        if (!response.ok) throw new Error(result.message);
        $('webhook-status').textContent='App Secret พร้อมสำหรับรอบนี้ · รอตั้งค่า URL HTTPS และ Webhook ของ Instagram';
    } catch(error) { $('webhook-status').textContent=error.message; }
});

async function api(path) {
    const response = await fetch(path, {cache:'no-store'});
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'ยังตรวจการเชื่อมต่อไม่ได้');
    return result;
}
function connection(message, success = false) {
    $('connection-status').textContent = message;
    $('connection-status').className = success ? 'success' : 'error';
}
$('verify').addEventListener('click', async () => {
    $('verify').disabled = true;
    connection('กำลังตรวจข้อความทดสอบจริงผ่าน Meta API…',true);
    try {
        const result = await api('/api/verify');
        connection(`พบ @${result.username} · ข้อความ Test เมื่อ ${new Date(result.receivedAt).toLocaleString('th-TH')} · พร้อมเตรียมการตอบข้อความ`,true);
        sendState=result.sendState;
        $('new-round').hidden=sendState!=='sent';
        $('reply-panel').hidden=false;
        $('reply-confirm').checked=false;
        $('reply').disabled=true;
    } catch (error) { connection(error.message); }
    finally { $('verify').disabled = false; }
});
$('reply-confirm').addEventListener('change',()=>{ $('reply').disabled=!$('reply-confirm').checked || ['sending','sent','unknown'].includes(sendState); });
$('reply').addEventListener('click',async()=>{
    if (!$('reply-confirm').checked || ['sending','sent','unknown'].includes(sendState)) return;
    sendState='sending'; $('reply').disabled=true;
    $('reply-status').textContent='กำลังส่งข้อความทดสอบจาก @mhlcarfilm…';
    try {
        const response=await fetch('/api/send-test',{method:'POST',headers:{'Content-Type':'application/json','X-Review-Key':reviewKey},body:JSON.stringify({confirm:true})});
        const result=await response.json();
        if (!response.ok) throw new Error(result.message);
        sendState='sent';
        $('new-round').hidden=false;
        threadStatus(result.threadState);
        $('reply-status').textContent=`Meta รับข้อความแล้ว · เปิดแชต Instagram ของ @Crazyoilly เพื่อแสดงข้อความที่ได้รับ · Message ID: ${result.messageId}`;
    } catch(error) {
        $('reply-status').textContent=error.message || 'ยังยืนยันผลการส่งไม่ได้ กรุณาตรวจแชตก่อนส่งอีกครั้ง';
        try { const state=await api('/api/status'); sendState=state.sendState;threadStatus(state.threadState); } catch { sendState='unknown'; }
        $('reply').disabled=['sending','sent','unknown'].includes(sendState);
    }
});

function resetRecordingControls() {
    clearInterval(timer);
    $('start').disabled = false;
    $('stop').disabled = true;
}
function stopRecording() {
    if (recording?.state === 'recording') recording.stop();
    if (stream) { const tracks = stream.getTracks(); stream = null; tracks.forEach(track => track.stop()); }
}
$('start').addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined' || !captureSupported) {
        $('record-status').textContent = 'เบราว์เซอร์นี้ยังตรวจแท็บที่อัดไม่ได้ กรุณาเปิดหน้าสาธิตใน Chrome รุ่นปัจจุบัน';
        return;
    }
    $('start').disabled = true;
    $('download').hidden = true;
    $('save-local').hidden = true;
    $('preview').hidden = true;
    try {
        stream = await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30,displaySurface:'browser'},audio:false,preferCurrentTab:true,selfBrowserSurface:'include',surfaceSwitching:'include',monitorTypeSurfaces:'exclude',systemAudio:'exclude'});
        const captureTrack=stream.getVideoTracks()[0];
        validateCaptureSource(captureTrack.getSettings(),captureTrack.getCaptureHandle(),captureHandle,location.origin);
        const mimeType = ['video/mp4;codecs=avc1.42001E','video/mp4','video/webm;codecs=vp9','video/webm'].find(type => MediaRecorder.isTypeSupported(type));
        if (!mimeType) throw new Error('เบราว์เซอร์นี้ไม่มีรูปแบบวิดีโอที่รองรับ');
        chunks = [];
        recording = new MediaRecorder(stream, {mimeType,videoBitsPerSecond:3500000});
        recording.addEventListener('dataavailable',event => { if (event.data.size) chunks.push(event.data); });
        recording.addEventListener('error', () => { $('record-status').textContent = 'การอัดหยุดเพราะเบราว์เซอร์พบข้อผิดพลาด'; stopRecording(); });
        recording.addEventListener('stop', () => {
            resetRecordingControls();
            const blob = new Blob(chunks, {type:mimeType});
            if (!blob.size) { $('record-status').textContent = 'ยังไม่มีข้อมูลวิดีโอ กรุณาอัดใหม่'; return; }
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            previewUrl = URL.createObjectURL(blob);
            recordedBlob=blob;
            $('preview').src = previewUrl;
            $('preview').hidden = false;
            $('download').href = previewUrl;
            $('download').download = `CAR-CRM-Instagram-AppReview-${new Date().toISOString().replace(/[:.]/g,'-')}.${mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
            $('download').hidden = false;
            $('save-local').hidden = false;
            $('record-status').textContent = `อัดเสร็จแล้ว · ${(blob.size / 1048576).toFixed(1)} MB · ตรวจวิดีโอก่อนดาวน์โหลด`;
            stopRecording();
        },{once:true});
        stream.getVideoTracks()[0].addEventListener('ended',stopRecording,{once:true});
        startedAt = Date.now();
        timer = setInterval(() => {
            const seconds = Math.floor((Date.now()-startedAt)/1000);
            $('timer').textContent = `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
        },1000);
        $('stop').disabled = false;
        recording.start(1000);
        $('record-status').textContent = 'กำลังอัด · ตรวจแล้วว่าเป็นแท็บสาธิตนี้ · หลังส่งสำเร็จ เปิด Instagram แล้วกด “แชร์แท็บนี้แทน” บนแถบของ Chrome';
    } catch (error) {
        stopRecording(); resetRecordingControls();
        $('record-status').textContent = error.name === 'NotAllowedError' ? 'ยังไม่ได้เลือกแท็บที่จะแชร์ กดเริ่มใหม่เมื่อพร้อม' : error.message;
    }
});
$('stop').addEventListener('click',stopRecording);
$('save-local').addEventListener('click',async()=>{
    if (!recordedBlob) return;
    $('save-local').disabled=true;
    try {
        const response=await fetch('/api/save-recording',{method:'POST',headers:{'Content-Type':recordedBlob.type.startsWith('video/mp4') ? 'video/mp4' : 'video/webm','X-Review-Key':reviewKey},body:recordedBlob});
        const result=await response.json();
        if (!response.ok) throw new Error(result.message);
        $('record-status').textContent=`บันทึกวิดีโอจริงไว้ในเครื่องแล้ว · ${result.filePath}`;
    } catch(error) { $('record-status').textContent=error.message; }
    finally { $('save-local').disabled=false; }
});
window.addEventListener('beforeunload',() => { stopRecording(); if (previewUrl) URL.revokeObjectURL(previewUrl); });
api('/api/status').then(result => {
    reviewKey=result.reviewKey;
    sendState=result.sendState;
    $('thread-panel').hidden=!result.threadControlAllowed;
    threadStatus(result.threadState);
    $('webhook-verify-token').value=result.verifyToken;
    if (result.webhookReady) $('webhook-status').textContent='App Secret พร้อมสำหรับรอบนี้ · รอตั้งค่า URL HTTPS และ Webhook ของ Instagram';
    connection(result.configured ? `ตั้งค่า @${result.account} แล้ว · รอตรวจข้อความ Test ของ @${result.recipient}` : 'ยังไม่ได้ตั้งค่า Instagram',result.configured);
}).catch(error => connection(error.message));
}
