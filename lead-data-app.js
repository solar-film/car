/* CAR lead page only. Independent LINE/FB/Instagram intake and installation storage. */
(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const core = window.CarLeadCore;
    const cloudLead = location.hostname === 'solar-film.github.io' || document.documentElement.dataset.leadTransport === 'apps-script';
    // Pause Instagram intake while retaining its integration and saved records.
    const INSTAGRAM_ENABLED = false;
    document.querySelector('[data-tab="instagram"]').hidden = !INSTAGRAM_ENABLED;
    $('instagram-connection').hidden = !INSTAGRAM_ENABLED;
    // Booking page "add lead": this page runs in its frame and shows only the new-lead editor.
    const embeddedNewLead = window.parent !== window && new URLSearchParams(location.search).get('embed') === 'new-lead';
    let embeddedLeadSaved = false;
    if (embeddedNewLead) {
        document.documentElement.dataset.leadEmbed = 'new-lead';
        document.querySelector('[data-car-crm-sidebar]')?.remove();
    }
    function postToBooking(state, detail = {}) {
        if (embeddedNewLead) window.parent.postMessage({type:'car-lead-embed',state,...detail},location.origin);
    }
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
    const empty = text => `<p class="lead-empty">${esc(text)}</p>`;
    // Display labels never replace the channel's display_name or contact identity.
    const unnamedProfile = (row, platform) => {
        const channel = platform === 'instagram' ? 'Instagram' : platform === 'line' ? 'LINE' : 'Facebook';
        const userId = String((platform === 'instagram' ? row?.instagram_user_id : platform === 'line' ? row?.line_user_id : row?.facebook_user_id) || '').trim();
        if (platform === 'line') {
            const hints = {
                unavailable:'ขณะนี้ LINE API ไม่คืนชื่อโปรไฟล์ของผู้ติดต่อนี้',
                'temporary-error':'ยังโหลดชื่อโปรไฟล์จาก LINE ไม่สำเร็จ กรุณากดอัปเดตข้อมูลล่าสุดเพื่อลองใหม่',
                'not-configured':'ระบบยังไม่พร้อมอ่านชื่อโปรไฟล์จาก LINE',
                'configuration-error':'ระบบเชื่อมต่อ LINE ยังอ่านชื่อโปรไฟล์ไม่ได้',
                deferred:'ระบบยังไม่ได้อ่านชื่อโปรไฟล์ของผู้ติดต่อนี้ กรุณากดอัปเดตข้อมูลล่าสุด'
            };
            const hint = Object.hasOwn(hints,row?.profile_status) ? hints[row.profile_status] : 'ยังไม่มีชื่อโปรไฟล์ที่โหลดได้จาก LINE';
            return {label:`LINE ยังโหลดชื่อไม่ได้${userId.length >= 6 ? ` · …${userId.slice(-6)}` : ''}`,
                hint:`${hint}${userId ? ` · รหัส ${userId}` : ''}`};
        }
        return {label:`${channel} ไม่ส่งชื่อ${userId.length >= 6 ? ` · …${userId.slice(-6)}` : ''}`,
            hint:`${channel} ไม่ส่งชื่อโปรไฟล์ของผู้ติดต่อนี้${userId ? ` · รหัส ${userId}` : ''}`};
    };
    function usableLineName(value, userId) {
        const name = typeof value === 'string' ? value.trim() : '';
        if (!name || name === userId || /^U[0-9a-f]{32}$/i.test(name) || /^[-—]$/.test(name) || /^(?:LINE|Facebook|Instagram)\s+(?:ไม่ส่งชื่อ|ยังโหลดชื่อไม่ได้)(?:\s*·.*)?$/i.test(name)) return '';
        return name;
    }
    function lineContactProfile(row, lead) {
        const userId = String(row?.line_user_id || '').trim();
        const profile = usableLineName(row?.display_name, userId);
        if (profile) return {name:profile,label:profile,hint:''};
        const source = lead?.source;
        const exact = userId && lead?.identity === core.identity('line', account, userId)
            && (!source || source.platform === 'line' && source.account === account && source.userId === userId);
        if (exact) {
            const savedName = [lead.sheetData?.contact,source?.displayName,lead.name].map(value => usableLineName(value,userId)).find(Boolean);
            if (savedName) return {name:savedName,label:savedName,hint:'ชื่อจากข้อมูล Lead ที่บันทึกไว้ของผู้ติดต่อ LINE คนนี้'};
        }
        return {name:'',...unnamedProfile(row,'line')};
    }
    function contactNameMarkup(row, platform, lead) {
        if (platform === 'line') {
            const profile = lineContactProfile(row,lead);
            return `<strong class="lead-contact-name"${profile.hint ? ` title="${esc(profile.hint)}"` : ''}>${esc(profile.label)}</strong>`;
        }
        return String(row.display_name || '').trim() ? `<strong class="lead-contact-name">${esc(row.display_name)}</strong>`
            : `<strong class="lead-contact-name" title="${esc(unnamedProfile(row,platform).hint)}">${esc(unnamedProfile(row,platform).label)}</strong>`;
    }
    let session, settings, tab = 'line', page = 0, installationPage = 0, contacts = [], account = core.LINE_ACCOUNT, summary = {total:0,fresh:0,selected:0};
    let contactPage = 0, sheetLeads = [], leadsFromSnapshot = false, leadRefreshError = '';
    const followUpStatuses = ['สอบถามใหม่','เลื่อนติดตั้ง','ติดตามผล / รอตัดสินใจ'];
    const followUpAlertDays = 3;
    const normalizeFollowUp = value => {
        const status = String(value || '').replace(/[^ก-๙a-zA-Z0-9/]/g,'');
        return status === 'ไม่เกี่ยวข้อง' ? 'ยกเลิก/ไม่เกี่ยวข้อง' : status;
    };
    const unrelatedStatus = '⚪ ยกเลิก / ไม่เกี่ยวข้อง';
    const followUpLabel = value => normalizeFollowUp(value) === normalizeFollowUp(unrelatedStatus) ? unrelatedStatus : value;
    const newLeadStatuses = ['สอบถามใหม่','ส่งเสนอราคาแล้ว','ยกเลิก / ไม่สนใจ',unrelatedStatus];
    const isNewLeadStatus = value => newLeadStatuses.some(status => normalizeFollowUp(status) === normalizeFollowUp(value));
    const isAutomaticClosedStatus = value => normalizeFollowUp(value) === normalizeFollowUp('ปิดการขายสำเร็จ');
    const isFollowUp = lead => followUpStatuses.some(status => normalizeFollowUp(status) === normalizeFollowUp(customerFollowUp(lead)));
    const initialTab = () => location.hash === '#followups' ? 'followups' : location.hash === '#leads' ? 'leads' : INSTAGRAM_ENABLED && location.hash === '#instagram' ? 'instagram' : 'line';
    function renderStatusOptions() {
        const previousStatus = $('lead-status').value;
        const statuses = [...new Set(sheetLeads.filter(lead => tab !== 'followups' || isFollowUp(lead)).map(lead => lead.status))];
        $('lead-status').innerHTML = '<option value="">ทุกสถานะ</option>' + statuses.map(value => '<option value="' + esc(value) + '">' + esc(value) + '</option>').join('');
        if (statuses.includes(previousStatus)) $('lead-status').value = previousStatus;
    }
    let records = { leads: [], installations: [] }, saveEditor, legacy = [], legacySources = null, request = 0, connection = 0;
    let leadEditorSnapshot = '', leadEditorHistoryChanged = false;
    let savedLeadRevision = 0;
    let accessKey = sessionStorage.getItem('carLeadAccessKey') || '';
    let rangeMode = 'today', rangeStart = '', rangeEnd = '';
    let inboxSource = 'webhook', inboxLoading = false, inboxIncomplete = false, lineProfilesConfigured;
    let instagramError = null;
    let sheetContacts = [], sheetSaved = null, sheetChecked = false, recordsLoaded = false;
    async function checkSheetContacts({refresh = false} = {}) {
        const currentSession = session, currentService = service, currentRevision = savedLeadRevision;
        if (refresh) sheetContactCache.clear();
        const result = await sheetContactCache.get().catch(error => {
            if (session === currentSession && service === currentService && currentRevision === savedLeadRevision) {
                sheetChecked = false; renderInbox();
            }
            throw error;
        });
        if (session !== currentSession || service !== currentService || currentRevision !== savedLeadRevision) return;
        sheetContacts = result.contacts;
        // Apps Script also lists the saved LINE/Facebook contacts, so the buttons need not wait for the full lead records.
        sheetSaved = Array.isArray(result.saved) ? result.saved : null;
        sheetChecked = true;
        renderInbox();
    }
    function existsInLeadSheet(row, lead) {
        const normalize = value => String(value || '').trim().toLowerCase();
        const channel = tab === 'instagram' ? 'ig' : tab === 'line' ? 'line' : 'fb';
        const candidates = [row.display_name,tab === 'instagram' ? row.instagram_user_id : tab === 'line' ? row.line_user_id : row.facebook_user_id,lead?.sheetData?.contact].map(normalize).filter(Boolean);
        return sheetChecked && sheetContacts.some(entry => (normalize(entry.channel) === channel || channel === 'fb' && normalize(entry.channel) === 'facebook' || channel === 'ig' && normalize(entry.channel) === 'instagram') && candidates.includes(normalize(entry.contact)));
    }
    let service = localStorage.getItem('carLeadServiceUrl') || (/^https?:$/.test(location.protocol) ? location.origin : 'http://127.0.0.1:3093');
    const formOptions = core.createOptionsCache(() => api('options'));
    const sheetContactCache = core.createOptionsCache(() => api('sheet-status'), {ttlMs:60000});
    const inboxLoader = core.createInboxLoader(({platform,page,start,date,cursor,refresh}) =>
        api(`inbox?platform=${platform}&page=${page}&date=${date}${platform === 'line' && start ? '&start='+encodeURIComponent(start) : ''}&cursor=${encodeURIComponent(cursor)}${refresh ? '&refresh=1' : ''}`));
    let editorOpenRequest = 0;
    function prefetchFormOptions() { void formOptions.get().catch(() => {}); }
    function notice(text, failure = false) { $('notice').hidden = !text; $('notice').textContent = text; $('notice').classList.toggle('error', failure); }
    function renderLineProfileWarning() {
        const warning = $('line-profile-warning');
        if (!warning) return;
        const configured = lineProfilesConfigured ?? settings?.lineProfilesConfigured;
        warning.hidden = !(session && tab === 'line' && (configured === false || contacts.some(row => row.profile_status === 'configuration-error')));
    }
    function updateLineProfileConfiguration(value, fresh = false) {
        if (tab !== 'line' || typeof value?.profilesConfigured !== 'boolean') return;
        // A stored success must not dismiss a fresh config failure; a fresh success can recover it.
        if (value.profilesConfigured === false || fresh) lineProfilesConfigured = value.profilesConfigured;
    }
    async function api(action, input) {
        if (cloudLead) {
            const route = new URL(action,'https://car.invalid/');
            return window.CarCrmAuth.leadRequest(route.pathname.slice(1),{query:Object.fromEntries(route.searchParams),input});
        }
        const headers = {};
        if (accessKey) headers['X-Car-Lead-Key'] = accessKey;
        if (input) headers['Content-Type'] = 'application/json';
        let response;
        try { response = await fetch(`${service}/api/lead-data/${action}`, { method: input ? 'POST' : 'GET', headers,
            body: input ? JSON.stringify(input) : undefined, cache: 'no-store', signal: AbortSignal.timeout(action === 'legacy-preview' ? 65000 : 30000) }); }
        catch { throw new Error('ติดต่อระบบรับข้อมูล CAR ไม่ได้ กรุณาตรวจว่าเซิร์ฟเวอร์เปิดอยู่'); }
        let result;
        try { result = await response.json(); } catch { throw new Error('URL นี้ยังไม่มีระบบลีด กรุณาตรวจการเชื่อมต่อ'); }
        if (!response.ok) throw Object.assign(new Error(result.error || 'ดำเนินการไม่สำเร็จ'), {status:response.status,code:result.code});
        return result;
    }
    function guard(fn) { return async event => { try { await fn(event); } catch (e) { if (!e.carLeadReadHandled) notice(e.message, true); } }; }
    function requireSession() { if (!session) throw new Error('ยังไม่ได้เชื่อมต่อระบบรับข้อมูล CAR กรุณาตรวจการตั้งค่าฝั่งเซิร์ฟเวอร์'); }
    function resetRecords() {
        formOptions.clear(); sheetContactCache.clear(); inboxLoader.clear(); editorOpenRequest++;
        sheetContacts = []; sheetSaved = null; sheetChecked = false; recordsLoaded = false; intakeRecordsRequest = null; inboxLoading = false; inboxIncomplete = false;
        lineProfilesConfigured = undefined;
        instagramError = null;
        sheetLeads = []; leadsFromSnapshot = false; leadRefreshError = ''; request++; records = { leads: [], installations: [] }; contacts = []; legacy = []; legacySources = null; session = null;
        $('current-user').textContent = 'ยังไม่ได้เชื่อมต่อระบบลีด'; $('signout').hidden = true;
        $('editor').close(); $('legacy-dialog').close(); renderLeads(); renderInstallations(); renderInbox();
    }
    async function connect(signedIn = true) {
        const attempt = ++connection;
        resetRecords();
        // Both reads are independent: start the session check while configuration loads.
        const sessionRequest = api('session');
        sessionRequest.catch(() => {});
        // The embedded form needs only the sheet options; read them alongside the start-up checks.
        if (embeddedNewLead) prefetchFormOptions();
        else startEarlyIntake(attempt);
        settings = await api('config');
        if (attempt !== connection) return;
        $('instagram-connection').textContent = settings.instagramConfigured ? `Instagram: @${settings.instagramUsername} · ตรวจสิทธิ์อ่านแชตเมื่อเปิดแท็บ` : 'Instagram: รอตั้งค่าเชื่อมต่อบัญชี CAR';
        $('facebook-connection').textContent = settings.facebookAccount ? `Facebook: ${settings.facebookAccount}` : 'Facebook: ยังไม่ได้ระบุเพจ CAR';
        $('line-connection').textContent = settings.lineConfigured ? 'LINE: รถยนต์ @maholan · ตั้งค่ารับข้อมูลแล้ว' : 'LINE: รถยนต์ @maholan · รอตั้งค่า webhook CAR';
        $('access-label').hidden = settings.local || cloudLead;
        $('service-form').hidden = cloudLead;
        const current = await sessionRequest;
        if (attempt !== connection) return;
        // GitHub Pages: these reads start together with the sign-in check; nothing is shown until it confirms the sign-in.
        if (!await signedIn || attempt !== connection) return;
        session = current;
        $('current-user').textContent = session.name; $('signout').hidden = session.mode === 'local';
        if (embeddedNewLead) { await openEmbeddedLead(); return; }
        const entryUrl = new URL(location.href);
        if (entryUrl.searchParams.get('newLead') === '1' && initialTab() === 'leads') {
            entryUrl.searchParams.delete('newLead');
            history.replaceState(null,'',entryUrl.pathname + entryUrl.search + entryUrl.hash);
            await Promise.all([showTab('leads'),editLead()]);
            return;
        }
        // From the customer page: lead-data.html?openLead=<Lead ID>#leads opens that lead once the list is read.
        const openLeadId = String(entryUrl.searchParams.get('openLead') || '').trim();
        if (openLeadId && initialTab() === 'leads') {
            entryUrl.searchParams.delete('openLead');
            history.replaceState(null,'',entryUrl.pathname + entryUrl.search + entryUrl.hash);
            await showTab('leads');
            if (attempt !== connection) return;
            const target = sheetLeads.find(item => item.leadId === openLeadId);
            if (target) await showLeadDetails(target.id);
            else notice('ไม่พบลีด ' + openLeadId + ' ในรายการ', true);
            return;
        }
        const entryTab = initialTab();
        if (['line','facebook','instagram'].includes(entryTab)) await Promise.all([intakeRecords(),showTab(entryTab)]);
        else await showTab(entryTab);
    }
    async function loadInstallationDates() {
        // AE is the Lead ID header verified against the current Bookings metadata. Reject a changed schema below.
        const response = await fetch('https://docs.google.com/spreadsheets/d/1u__xYWoWZpmrnquc-Fpk19WtpcrckxSd0-_G35NWxXQ/gviz/tq?tqx=out:csv&sheet=Bookings&tq=' + encodeURIComponent('select A,B,D,T,AE'), {cache:'no-store',signal:AbortSignal.timeout(15000)});
        if (!response.ok) throw new Error('โหลดวันนัดไม่สำเร็จ');
        const rows = core.csv(await response.text()), dates = new Map();
        if (rows.length && ['CustID','JobID','Lead ID','วันที่ติดตั้ง','Status'].some(key=>!Object.hasOwn(rows[0],key))) throw new Error('หัวตารางคิวนัดไม่ตรง');
        for (const row of rows) {
            if (!row.JobID || !row.CustID) continue;
            const raw = String(row['วันที่ติดตั้ง'] || '').trim();
            const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(raw);
            let date = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0,10) : '';
            if (match) { let year=Number(match[3]); if(year>2400)year-=543;else if(year<100)year+=year>=40?1957:2000; date=year+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0'); }
            const parsedDate = new Date(date+'T00:00:00Z');
            const validDate = date && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0,10)===date;
            const label = validDate ? new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'2-digit'}).format(new Date(date+'T00:00:00+07:00')) : raw || 'ยังไม่ระบุวัน';
            const id=String(row.CustID).trim(); if(!dates.has(id))dates.set(id,[]);
            dates.get(id).push({jobId:row.JobID,leadId:String(row['Lead ID']||'').trim(),date:validDate ? date : '',label,status:row.Status || '',cancelled:/ยกเลิก|cancel/i.test(row.Status || '')});
        }
        for (const items of dates.values()) items.sort((a,b) => b.date.localeCompare(a.date) || a.jobId.localeCompare(b.jobId));
        return dates;
    }
    function bookingMatchesLead(item,lead) {
        const owner=String(item['Lead ID']||item.leadId||'').trim();
        if(owner)return owner===String(lead.leadId||'').trim();
        return sheetLeads.filter(other=>other.customerId===lead.customerId).length===1;
    }
    function installationDatesForLead(dates,lead) {
        const items=dates.get(lead.customerId)||[],matched=items.filter(item=>bookingMatchesLead(item,lead));
        if(items.some(item=>!item.leadId&&!bookingMatchesLead(item,lead)))matched.push({jobId:'',date:'',label:'มีคิวเก่าที่ต้องตรวจสอบการเชื่อม Lead',status:'',cancelled:false});
        return matched.length?matched:'—';
    }
    function renderInstallationDates(value) {
        const content = Array.isArray(value) ? value.map(item => '<span class="contact-installation-date' + (item.cancelled ? ' cancelled' : '') + '" title="' + esc(item.jobId + (item.status ? ' · ' + item.status : '')) + '">' + esc(item.label) + (item.cancelled ? ' · ยกเลิก' : '') + '</span>').join('') : esc(value || '—');
        return '<div class="contact-report-field contact-installation-dates" aria-label="วันที่นัดติดตั้ง">' + content + '</div>';
    }
    // GitHub Pages: the contact report reads start together with the sign-in check instead of after it.
    // Only the first list load uses them; a failed or late early read falls back to the normal request.
    let earlyLeads = null;
    function startEarlyLeads() {
        if (!cloudLead || embeddedNewLead || !['leads','followups'].includes(initialTab())) return;
        const records = api('records'), dates = loadInstallationDates();
        records.catch(() => {}); dates.catch(() => {});
        earlyLeads = {records,dates,startedAt:Date.now(),revision:savedLeadRevision};
    }
    function takeEarlyLeads() {
        const early = earlyLeads;
        earlyLeads = null;
        return early && early.revision === savedLeadRevision && Date.now() - early.startedAt < 60000 ? early : null;
    }
    // GitHub Pages, Line page: the contact list, the saved-contact check and the lead records start with the sign-in
    // and configuration checks. The first list load joins the same requests (the loader and check share pending reads).
    let earlyIntake = null, intakeRecordsRequest = null;
    function startEarlyIntake(attempt) {
        if (!cloudLead || embeddedNewLead || initialTab() !== 'line') return;
        void inboxLoader.load({platform:'line',start:rangeStart,end:rangeEnd,isCurrent:() => attempt === connection}).catch(() => {});
        void sheetContactCache.get().catch(() => {});
        const records = api('records?scope=intake');
        records.catch(() => {});
        earlyIntake = {records,attempt,revision:savedLeadRevision};
    }
    function takeEarlyIntake() {
        const early = earlyIntake;
        earlyIntake = null;
        return early && early.attempt === connection && early.revision === savedLeadRevision ? early : null;
    }
    // One shared read of the lead records on the Line/Facebook pages; a button clicked before it answers waits for it.
    function intakeRecords() {
        if (recordsLoaded) return Promise.resolve();
        if (!intakeRecordsRequest) {
            const request = loadRecords(true).finally(() => { if (intakeRecordsRequest === request) intakeRecordsRequest = null; });
            intakeRecordsRequest = request;
        }
        return intakeRecordsRequest;
    }
    async function loadRecords(intake = ['line','facebook','instagram'].includes(tab), {reportErrors = false} = {}) {
        const currentSession = session, currentService = service, currentRevision = savedLeadRevision;
        const isCurrent = () => session === currentSession && service === currentService && currentRevision === savedLeadRevision;
        const early = intake ? takeEarlyIntake() : takeEarlyLeads();
        // Installation dates do not depend on the lead list, so both reads run at the same time.
        const datesRequest = intake ? null : early ? early.dates : loadInstallationDates();
        if (datesRequest) datesRequest.catch(() => {});
        const stored = !intake && !sheetLeads.length ? readLeadsSnapshot() : null;
        if (stored && stored.length) {
            // Paint the last complete list at once; it stays view-only until the fresh read replaces it.
            leadsFromSnapshot = true;
            sheetLeads = stored.map(lead => ({...lead,status:customerFollowUp(lead),installationDate:lead.customerId ? 'กำลังโหลด…' : '—'}));
            renderStatusOptions(); renderLeads();
            notice('แสดงรายการล่าสุดที่โหลดไว้ · กำลังอัปเดต…');
        }
        let result;
        const path = intake ? 'records?scope=intake' : 'records';
        try { result = await (early ? early.records.catch(() => api(path)) : api(path)); }
        catch (error) { if (!isCurrent()) return; if (!intake) retainLeadsAfterReadFailure(error); throw error; }
        if (!isCurrent()) return;
        records = result; recordsLoaded = true; renderInstallations(); renderInbox();
        if (intake) {
            void (result.sheetLeads ? Promise.resolve({leads:result.sheetLeads}) : api('sheet-leads')).then(sheet => {
                if(!isCurrent()) return;
                updateFollowUpCount(sheet.leads);
                // The contact report tab can then paint this list at once while it reads a fresh one.
                writeLeadsSnapshot(sheet.leads);
            }).catch(() => { if(isCurrent()) updateFollowUpCount(null); });
            return;
        }
        try { const sheet = result.sheetLeads ? {leads:result.sheetLeads} : await api('sheet-leads'); if (!isCurrent()) return; sheetLeads=sheet.leads.map(lead => ({...lead,status:customerFollowUp(lead)}));
            writeLeadsSnapshot(sheet.leads);
            if (leadsFromSnapshot || leadRefreshError) { leadsFromSnapshot = false; leadRefreshError = ''; notice(''); }
            renderStatusOptions();
            sheetLeads.forEach(lead => { lead.installationDate = lead.customerId ? 'กำลังโหลด…' : '—'; });
            renderLeads();
            try { const dates = await datesRequest; if(!isCurrent()) return; sheetLeads.forEach(lead => { lead.installationDate = installationDatesForLead(dates,lead); }); }
            catch { if(!isCurrent()) return; sheetLeads.forEach(lead => { lead.installationDate = lead.customerId ? 'โหลดไม่สำเร็จ' : '—'; }); }
            renderLeads(); }
        catch(e) { if(!isCurrent()) return; retainLeadsAfterReadFailure(e); if(reportErrors) throw e; }
    }
    // A failed refresh keeps the last complete list visible and view-only until a fresh read succeeds.
    function retainLeadsAfterReadFailure(error) {
        error.carLeadReadHandled = true;
        leadRefreshError = error.message || 'ติดต่อแหล่งข้อมูลไม่ได้';
        leadsFromSnapshot = sheetLeads.length > 0;
        renderLeads(); updateFollowUpCount(null);
        notice((sheetLeads.length ? 'แสดงข้อมูลเดิม · ยังยืนยันข้อมูลล่าสุดไม่ได้ · ' : '') + 'โหลดชีต lead ไม่สำเร็จ: ' + leadRefreshError, true);
    }
    async function showTab(next) {
        if (next === 'instagram' && !INSTAGRAM_ENABLED) next = 'line';
        editorOpenRequest++;
        // Contact reports share the same timeline panel.
        if (!['line','facebook','instagram','leads','followups','connection'].includes(next)) next = 'line';
        const inbox = ['line','facebook','instagram'].includes(next);
        if (session && !inbox) prefetchFormOptions();
        $('add-lead').hidden = next !== 'leads';
        if (next !== 'connection') history.replaceState(null,'',['leads','followups','instagram'].includes(next) ? '#' + next : location.pathname + location.search);
        $('range-buttons').hidden = !inbox;
        if (!inbox) $('range-form').hidden = true;
        document.querySelector('.lead-refresh-control').hidden = !inbox;
        if (tab !== next) { contactPage = 0; $('lead-status').value = ''; }
        request++; tab = next; instagramError = null;
        updatePageHeading();
        $('contact-report-title').textContent = next === 'followups' ? 'รายการติดตาม' : 'รายงานข้อมูลการติดต่อ';
        document.querySelector('.contact-report-scroll').classList.toggle('followup-report', next === 'followups');
        $('followup-updated-header').hidden = next !== 'followups';
        renderStatusOptions(); renderLeads();
        notice('');
        $('refresh-inbox').disabled = false;
        document.querySelectorAll('[data-tab]').forEach(button => {
            if (button.dataset.tab === next) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
        });
        const panel = ['line','facebook','instagram'].includes(next) ? 'inbox' : next === 'followups' ? 'leads' : next;
        document.querySelectorAll('[data-panel]').forEach(el => { el.hidden = el.dataset.panel !== panel; });
        renderLineProfileWarning();
        if (['leads','followups'].includes(next) && session) await loadRecords(false);
        if (panel === 'inbox') {
            contacts = []; page = 0; summary = {total:0,fresh:0,selected:0};
            inboxSource = 'webhook'; inboxLoading = Boolean(session); inboxIncomplete = false;
            renderInbox(); if (session) await loadInbox();
        }
    }
    async function loadInbox({refresh = false} = {}) {
        requireSession();
        const currentRequest = ++request;
        const currentTab = tab;
        const currentSession = session, currentService = service;
        if (currentTab === 'instagram') instagramError = null;
        const isCurrent = () => currentRequest === request && tab === currentTab && session === currentSession && service === currentService;
        let optionsPrefetched = false;
        const query = {platform:currentTab,start:rangeStart,end:rangeEnd};
        const cached = inboxLoader.peek(query);
        const stored = cached ? null : readInboxSnapshot(query);
        if (cached) {
            contacts = core.inboxActivities(cached); account = cached.account; inboxSource = cached.source || 'webhook';
            updateLineProfileConfiguration(cached);
        } else if (stored) {
            // Show the last complete list from this tab at once, then replace it when the fresh read completes.
            contacts = core.inboxActivities(stored); account = stored.account; inboxSource = stored.source || 'webhook';
            updateLineProfileConfiguration(stored);
        }
        page = 0; inboxLoading = !cached || refresh; inboxIncomplete = false;
        $('refresh-inbox').disabled = true;
        renderInbox();
        notice(inboxLoading ? (stored ? 'แสดงรายชื่อล่าสุดที่โหลดไว้ · กำลังอัปเดต…' : 'กำลังอ่านรายชื่อ CAR…') : '');
        const sheetStatus = checkSheetContacts({refresh}).then(() => null, error => error);
        try {
            const result = await inboxLoader.load({...query,refresh,isCurrent,onPage:(value,{complete,cached}) => {
                updateLineProfileConfiguration(value,!cached);
                renderLineProfileWarning();
                if (stored && !complete) { notice(`แสดงรายชื่อล่าสุดที่โหลดไว้ · กำลังอัปเดต ${value.contacts.length} รายชื่อ…`); return; }
                contacts = core.inboxActivities(value); account = value.account; summary = null;
                inboxSource = value.source || 'webhook'; inboxIncomplete = !complete;
                renderInbox();
                if (!refresh && !optionsPrefetched && isCurrent()) { optionsPrefetched = true; prefetchFormOptions(); }
                notice(complete ? '' : `แสดงข้อมูลแล้ว ${value.contacts.length} รายชื่อ · กำลังโหลดเพิ่มเติม สถิติยังไม่ครบ`);
            }});
            if (!result || !isCurrent()) return;
            writeInboxSnapshot(query,result);
            const sheetError = await sheetStatus;
            if (!isCurrent()) return;
            if (sheetError) throw sheetError;
            inboxLoading = false; inboxIncomplete = false; renderInbox();
            if (currentTab === 'line' && !['line-sheet','line-daily'].includes(inboxSource) && page === 0 && !contacts.length) {
                $('inbox-summary').hidden = true;
                $('inbox-list').innerHTML = empty('CAR ยังไม่มีรายชื่อจาก LINE · ต้องรับข้อมูลผ่าน webhook ก่อนจึงจะแสดงรายชื่อได้');
                notice(result.configured ? 'มีค่าตั้งค่า LINE แล้ว แต่ CAR ยังไม่มีข้อมูลผู้ติดต่อ · กรุณาตรวจ Bot User ID และเส้นทาง webhook' : 'LINE ยังไม่ได้เชื่อมช่องทางรับข้อมูล CAR · คงปลายทางเดิมไว้เพื่อไม่ให้กระทบระบบที่ใช้อยู่');
                return;
            }
            if (!result.configured && !contacts.length) {
                $('inbox-summary').hidden = true;
                $('inbox-list').innerHTML = empty('รอเชื่อมช่องทางรับข้อมูล LINE @maholan ของ CAR');
            }
            if (result.stale) {
                // The service could not reach the channel and returned the last list it read.
                const savedAt = Number.isFinite(Date.parse(result.staleSavedAt)) ? new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(result.staleSavedAt)) : '';
                notice(`แสดงรายการล่าสุดที่จำไว้${savedAt ? ' (อ่านเมื่อ ' + savedAt + ' น.)' : ''} · ยังไม่ใช่ข้อมูลปัจจุบัน · ${result.staleReason || 'ติดต่อช่องทางนี้ไม่ได้'}`,true);
                return;
            }
            notice(inboxSource === 'line-sheet'
                ? 'LINE: แสดงกิจกรรมรายวันที่ตรวจพบ · ประวัติอาจไม่ครบ ชีตเก็บเฉพาะครั้งแรกและล่าสุด ต้องรับเหตุการณ์ทุกครั้งจึงจะนับวันทักได้ครบ'
                : result.contacts.some(row => !row.history_complete) && ['facebook-conversations','instagram-conversations'].includes(inboxSource)
                    ? `${currentTab === 'instagram' ? 'Instagram' : 'Facebook'}: บางบทสนทนาอ่านประวัติได้ไม่ครบ สถิติเป็นจำนวนวันที่พบข้อความลูกค้า` : '');
        } catch (error) {
            if (!isCurrent()) return;
            if (currentTab === 'instagram') instagramError = error;
            inboxLoading = false; inboxIncomplete = true; renderInbox();
            if (!contacts.length && currentTab !== 'instagram') { $('inbox-list').innerHTML = empty(error.message); $('inbox-summary').hidden = true; }
            notice(currentTab === 'instagram' && !contacts.length ? '' : (contacts.length ? 'อัปเดตข้อมูลยังไม่ครบ · แสดงรายการที่โหลดได้แล้ว · ' : '') + error.message,true);
        } finally { if (isCurrent()) { inboxLoading = false; $('refresh-inbox').disabled = false; } }
    }
    // Per-tab snapshot (sessionStorage, cleared when the tab closes or on sign-out) used only on the GitHub Pages build.
    function inboxSnapshotKey(query) { return 'carLeadInbox:' + JSON.stringify([query.platform,query.start,query.end]); }
    function snapshotsEnabled() { return typeof cloudLead !== 'undefined' && cloudLead && typeof sessionStorage !== 'undefined'; }
    function readInboxSnapshot(query) {
        if (!snapshotsEnabled()) return null;
        try {
            const saved = JSON.parse(sessionStorage.getItem(inboxSnapshotKey(query)) || 'null');
            return saved && Date.now() - saved.savedAt < 15 * 60 * 1000 && saved.value && Array.isArray(saved.value.contacts) ? saved.value : null;
        } catch { return null; }
    }
    function writeInboxSnapshot(query, value) {
        if (!snapshotsEnabled()) return;
        try { sessionStorage.setItem(inboxSnapshotKey(query), JSON.stringify({savedAt:Date.now(),value})); } catch {}
    }
    function clearInboxSnapshots() {
        if (!snapshotsEnabled()) return;
        try { Object.keys(sessionStorage).filter(key => key.startsWith('carLeadInbox:') || key === LEADS_SNAPSHOT_KEY || key === 'carLeadFollowUpCount').forEach(key => sessionStorage.removeItem(key)); } catch {}
    }
    // The contact report list uses the same per-tab snapshot rules: shown only until the fresh read answers.
    const LEADS_SNAPSHOT_KEY = 'carLeadRecords:sheetLeads';
    function readLeadsSnapshot() {
        if (!snapshotsEnabled()) return null;
        try {
            const saved = JSON.parse(sessionStorage.getItem(LEADS_SNAPSHOT_KEY) || 'null');
            return saved && Date.now() - saved.savedAt < 15 * 60 * 1000 && Array.isArray(saved.leads) ? saved.leads : null;
        } catch { return null; }
    }
    function writeLeadsSnapshot(leads) {
        if (!snapshotsEnabled()) return;
        try { sessionStorage.setItem(LEADS_SNAPSHOT_KEY, JSON.stringify({savedAt:Date.now(),leads})); } catch {}
    }
    function clearLeadsSnapshot() {
        if (!snapshotsEnabled()) return;
        try { sessionStorage.removeItem(LEADS_SNAPSHOT_KEY); } catch {}
    }
    function instagramConnection(error) {
        const waiting = error.code === 'INSTAGRAM_PERMISSION_REQUIRED';
        const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor" stroke="none"/></svg>';
        return '<div class="lead-instagram-connection" role="status"><span class="lead-instagram-icon">' + icon + '</span><h2>' + (waiting ? 'Instagram · รอสิทธิ์อ่านแชต' : 'ยังโหลด Instagram ไม่ได้') + '</h2><p>' + esc(error.message) + '</p>' + (waiting ? '<small>เมื่ออนุญาตสิทธิ์แล้ว กดอัปเดตข้อมูลล่าสุดเพื่อแสดงรายชื่อและเก็บข้อมูล Lead</small><a class="lead-button" href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">ตั้งค่าสิทธิ์ใน Meta ↗</a>' : '') + '</div>';
    }
    function selectedLead(row) {
        const userId = tab === 'instagram' ? row.instagram_user_id : tab === 'line' ? row.line_user_id : row.facebook_user_id;
        return records.leads.find(l => l.identity === core.identity(tab, account, userId));
    }
    // Apps Script mode: a saved lead carries the key of the contact it came from (intakeSource), not a local identity.
    function savedSheetLeads(row) {
        const userId = tab === 'instagram' ? row.instagram_user_id : tab === 'line' ? row.line_user_id : row.facebook_user_id;
        if (!userId || !Array.isArray(records.sheetLeads)) return [];
        return records.sheetLeads.filter(lead => lead.intakeSource?.platform === tab && lead.intakeSource.userId === userId);
    }
    // The same saved-contact rule from the light sheet check, before the full lead records arrive.
    function savedContactKey(row) {
        const userId = tab === 'instagram' ? row.instagram_user_id : tab === 'line' ? row.line_user_id : row.facebook_user_id;
        return Boolean(userId && sheetSaved?.some(item => item.platform === tab && item.userId === userId));
    }
    const day = core.dayKey;
    function renderInbox() {
        renderLineProfileWarning();
        if (!['line','facebook','instagram'].includes(tab)) return;
        if (!session) { $('inbox-list').innerHTML = empty('กำลังรอการเชื่อมต่อระบบรับข้อมูล CAR'); $('inbox-summary').textContent = ''; $('inbox-summary-scope').textContent = ''; return; }
        if (tab === 'instagram' && instagramError && !contacts.length) {
            $('inbox-summary').hidden = true;
            $('inbox-summary-scope').textContent = `Instagram : @${settings?.instagramUsername || 'mhlcarfilm'} · ยังอ่านแชตไม่ได้`;
            $('inbox-list').innerHTML = instagramConnection(instagramError);
            $('page-label').closest('.lead-pagination').hidden = true;
            return;
        }
        $('page-label').closest('.lead-pagination').hidden = false;
        const direct = ['facebook-conversations','instagram-conversations'].includes(inboxSource);
        const fromSheet = ['line-sheet','line-daily'].includes(inboxSource);
        $('inbox-summary').hidden = false; $('inbox-date').parentElement.hidden = direct || fromSheet;
        $('inbox-filter').parentElement.hidden = true;
        $('inbox-stats-panel').hidden = false;
        $('inbox-date').closest('.lead-toolbar').hidden = true;
        const typeOf = row => direct ? row.customer_type : core.customerTag(row.first_seen_at, row.last_seen_at);
        const counts = rows => {
            const fresh = rows.filter(row => typeOf(row) === 'new').length;
            const old = rows.filter(row => typeOf(row) === 'existing').length;
            return [['ลูกค้าใหม่',fresh],['ลูกค้าเก่า',old],...(rows.length-fresh-old ? [['ยังไม่ทราบ',rows.length-fresh-old]] : []),['ทั้งหมด',rows.length]];
        };
        const summaryRows = contacts.filter(row => { const date = day(row.last_seen_at); return !row.legacy && date && date >= rangeStart && date <= rangeEnd; });
        const totals = [...counts(summaryRows), ['เก็บข้อมูล Lead', summaryRows.filter(row => existsInLeadSheet(row, selectedLead(row))).length]];
        const summaryPeriod = ({today:'วันนี้','3':'3 วันล่าสุด','7':'7 วันล่าสุด','15':'15 วันล่าสุด',month:'เดือนนี้',year:'ปีนี้'})[rangeMode] || `${rangeStart} – ${rangeEnd}`;
        const progressLabel = inboxLoading ? ' · กำลังโหลด สถิติยังไม่ครบ' : inboxIncomplete ? ' · อัปเดตข้อมูลยังไม่ครบ' : '';
        const selectionReady = sheetChecked && (recordsLoaded || sheetSaved !== null);
        $('inbox-summary-scope').textContent = `สรุปสถิติจากช่องทาง ${tab === 'instagram' ? 'Instagram' : tab === 'line' ? 'Line OA' : 'Facebook'} ${summaryPeriod}${inboxSource === 'line-daily' ? ' · เฉพาะบันทึกรายวันใหม่' : ''}${progressLabel}`;
        $('inbox-summary').innerHTML = totals.map(([label,count]) => `<div class="lead-stat ${label === 'ลูกค้าใหม่' ? 'stat-new' : label === 'ลูกค้าเก่า' ? 'stat-old' : label === 'ทั้งหมด' ? 'stat-total' : label === 'เก็บข้อมูล Lead' ? 'stat-saved' : 'stat-unknown'}"><span class="lead-stat-label"><i aria-hidden="true"></i>${label}</span><strong>${inboxLoading && !contacts.length || label === 'เก็บข้อมูล Lead' && !selectionReady ? '…' : count.toLocaleString('th-TH')}<small>${rangeStart === rangeEnd ? "คน" : "คน-วัน"}</small></strong></div>`).join('');
        const dated = contacts.filter(row => day(row.last_seen_at)>=rangeStart && day(row.last_seen_at)<=rangeEnd);
        page = Math.max(0,Math.min(page,Math.ceil(dated.length/30)-1));
        const visible = dated.slice(page*30,page*30+30);
        const groups = new Map();
        for (const row of visible) {
            const key = (row.legacy ? 'legacy:' : '') + day(row.last_seen_at);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        }
        const calendar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 2v6m8-6v6M4 10h16"/></svg>';
        $('inbox-list').innerHTML = [...groups].map(([dateGroup, rows]) => {
            const title = dateGroup ? new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'long',year:'numeric'}).format(new Date(rows[0].last_seen_at)) : 'ไม่มีวันที่';
            return `<section class="lead-timeline-group"><h3 class="lead-day"><span>${calendar}${rows[0].legacy ? 'ประวัติเดิมบางส่วน' : inboxSource === 'line-sheet' ? 'กิจกรรมรายวันที่ตรวจพบ' : 'ทักในวันที่'} · ${esc(title)}</span><span class="lead-day-count">${counts(rows).map(([label,count]) => `${label} ${count}`).join(" · ")} <small>(ในหน้านี้)</small></span></h3><div class="lead-timeline">${rows.map(row => {
                const selected = selectedLead(row);
                const savedInSheet = existsInLeadSheet(row,selected) || savedSheetLeads(row).length > 0 || savedContactKey(row);
                const firstDay = row.first_seen_at ? day(row.first_seen_at) : '';
                const contactDays = new Set((row.daily_activity || []).map(at => day(at)).filter(Boolean)).size;
                const daysBadge = contactDays ? `<span class="lead-contact-days" title="จำนวนวันที่มีข้อความติดต่อ · นับวันละหนึ่งครั้ง${row.history_complete === false ? ' · ประวัติที่อ่านได้ยังไม่ครบ' : ''}">${contactDays}${row.history_complete === false ? '+' : ''} วัน</span>` : ''; 
                const badge = selected?.sheetSavedAt ? '' : selected ? '<span class="lead-contact-badge selected">เก็บในเครื่องแล้ว</span>' : '';
                const type = direct ? row.customer_type : core.customerTag(row.first_seen_at, row.last_seen_at);
                const customerTag = `<span class="lead-contact-badge ${type === 'new' ? 'fresh' : 'returning'}" title="อัตโนมัติจากประวัติข้อความลูกค้า เทียบกับวันที่ของรายการ ตามเวลาไทย">${type === 'new' ? 'ลูกค้าใหม่' : type === 'existing' ? 'ลูกค้าเก่า' : 'ยังตรวจประวัติไม่ได้'}</span>`;
                const time = dateGroup ? new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(row.last_seen_at)) : '—';
                return `<article class="lead-timeline-row"><time class="lead-timeline-time" datetime="${esc(row.last_seen_at || '')}">${esc(time)}</time><div class="lead-contact-card">${daysBadge}${contactNameMarkup(row,tab,selected)}${badge}${row.legacy ? '<span class="lead-contact-badge returning">ประวัติเดิม · ไม่รวมสถิติ</span>' : customerTag}${firstDay ? `<span class="lead-contact-first">ทักครั้งแรก ${esc(core.dateTH(row.first_seen_at))}</span>` : ['facebook','instagram'].includes(tab) ? '<span class="lead-contact-first">ทักครั้งแรก: ยังตรวจสอบวันที่ไม่ได้</span>' : ''}<button class="lead-button ${savedInSheet ? 'saved' : 'select'}" data-contact="${esc(row.id)}" data-contact-day="${esc(day(row.last_seen_at))}" ${selectionReady ? '' : 'disabled'}>${!selectionReady ? 'กำลังตรวจข้อมูล…' : savedInSheet ? 'ดู / แก้ไขข้อมูล' : 'เก็บข้อมูล'}</button></div></article>`;
            }).join('')}</div></section>`;
        }).join('') || empty(inboxLoading ? 'กำลังโหลดรายชื่อในช่วงที่เลือก…' : 'ยังไม่มีรายชื่อในหน้านี้');
        $('page-label').textContent = `หน้า ${page+1} · ${dated.length} รายการรายวัน · คนเดิมนับหนึ่งครั้งต่อวัน${progressLabel}`;
        $('previous-page').hidden = false; $('next-page').hidden = false;
        $('previous-page').disabled = page === 0; $('next-page').disabled = (page+1)*30 >= dated.length;
    }
    function sourceLabel(lead) { return ({ line:'LINE @maholan', facebook:'Facebook CAR', instagram:'Instagram CAR', legacy:'ประวัติ CAR CRM', manual:'เพิ่มเอง' })[lead.source?.platform] || 'เพิ่มเอง'; }
    function contactDate(l) {
        const sheetDate = inputDate(l.sheetData?.date);
        return sheetDate || day(l.createdAt);
    }
    function customerFollowUp(lead) {
        return followUpLabel(lead.sheetData?.followUp || lead.status || 'ใหม่');
    }
    function contactTimestamp(value) {
        const text=String(value||'').trim().replace(' ','T');
        return /^\d{4}-\d{2}-\d{2}$/.test(text) ? Date.parse(text+'T00:00:00+07:00') : Date.parse(text + (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(text) ? '+07:00' : ''));
    }
    function latestContactTimestamp(lead, now = Date.now()) {
        const entries=[...(lead.contactHistory||[]),...window.CarLeadSheet.splitHistory(lead.sheetData?.note || lead.note || '').history];
        const times=entries.map(item=>contactTimestamp(item.at)).filter(at=>Number.isFinite(at)&&at<=now);
        const fallback=contactTimestamp((lead.sheetData?.date || '') + (lead.sheetData?.time ? 'T'+lead.sheetData.time.padStart(8,'0') : ''));
        return {at:times.length ? Math.max(...times) : fallback,fromHistory:times.length > 0};
    }
    function renderFollowUpUpdated(lead) {
        const {at,fromHistory}=latestContactTimestamp(lead);
        const valid=Number.isFinite(at);
        const value=valid ? new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(at)) : '—';
        const title=valid ? (fromHistory ? 'วันที่บันทึกประวัติการติดต่อล่าสุด' : 'วันที่บันทึกลีดครั้งแรก · ยังไม่มีประวัติการอัปเดต') + ' · ' + value : 'ยังไม่มีวันที่อัปเดต';
        return `<div class="contact-report-field" aria-label="อัปเดตล่าสุด"><span class="contact-inline-detail" title="${esc(title)}">${esc(value)}</span></div>`;
    }
    // A reminder date followUpAlertDays Bangkok calendar days after the given time.
    function twoDaysAfter(at) {
        return new Date(at + 7*3600000 + followUpAlertDays*86400000).toISOString().slice(0,10);
    }
    function followUpAge(lead, now = Date.now()) {
        const {at:latest,fromHistory}=latestContactTimestamp(lead,now);
        const note=window.CarLeadSheet.splitHistory(lead.sheetData?.note || lead.note || '').note;
        const reminderDate=lead.sheetData?.reminderDate || window.CarLeadSheet.splitReminder(note).reminderDate;
        const explicit=window.CarLeadSheet.validReminderDate(reminderDate);
        // Without a saved reminder the due date is followUpAlertDays Bangkok days after the latest contact.
        const dueDate=explicit ? reminderDate : Number.isFinite(latest) ? twoDaysAfter(latest) : '';
        const today=new Date(now+7*3600000).toISOString().slice(0,10), tomorrow=new Date(now+7*3600000+86400000).toISOString().slice(0,10);
        // ครบกำหนดก่อนวันนี้ = 'overdue' (เกินกำหนด), ครบวันนี้ = 'today', ครบพรุ่งนี้ = 'tomorrow' (สีอ่อน), หลังจากนั้นไม่มีป้าย
        // ตัวนับบนแท็บ/เมนูยังนับทุกค่าที่ไม่ว่าง จึงนับ "เกินกำหนด" รวมกับ "วันนี้" เหมือนเดิม ต่างกันแค่การแสดงผล
        const highlight=!isFollowUp(lead) || !dueDate ? '' : dueDate < today ? 'overdue' : dueDate === today ? 'today' : dueDate === tomorrow ? 'tomorrow' : '';
        const shortDate=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'short'});
        const format=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'});
        const updated=Number.isFinite(latest) ? (fromHistory?'อัปเดตล่าสุด ':'อ้างอิงวันที่ลีด ') + format.format(new Date(latest)) : 'ไม่มีวันที่สำหรับตรวจการติดตาม';
        const label=explicit ? 'วันที่แจ้งเตือน ' + shortDate.format(new Date(contactTimestamp(reminderDate))) + ' · ' + updated : updated;
        // จำนวนวันที่เกินกำหนดนับตามวันปฏิทินไทย (วันที่ ISO ทั้งสองค่าเป็นวันตามเวลาไทยแล้ว)
        const days=highlight === 'overdue' ? Math.round((Date.parse(today+'T00:00:00Z')-Date.parse(dueDate+'T00:00:00Z'))/86400000) : 0;
        const overdue=highlight === 'overdue' ? {days,dueDate,text:'เกินกำหนด '+days+' วัน',
            title:'เกินกำหนด '+days+' วัน · ครบกำหนด '+shortDate.format(new Date(contactTimestamp(dueDate)))} : null;
        return {highlight,label,overdue};
    }
    function updateFollowUpCount(leads, now = Date.now()) {
        const badge=$('followup-tab-count');
        if (!badge) return;
        if (!leads || !session) { badge.textContent='—'; badge.title='ยังโหลดจำนวนงานไม่สำเร็จ'; if (session) window.carCrmSetFollowUpCount?.(null); return; }
        const count=leads.filter(lead => followUpAge(lead,now).highlight).length;
        badge.textContent=count.toLocaleString('th-TH');
        badge.title='งานที่ต้องติดตามวันนี้ (รวมที่เลยกำหนด) และพรุ่งนี้ '+count+' รายการ';
        badge.setAttribute('aria-label',badge.title);
        window.carCrmSetFollowUpCount?.(count);
    }
    function renderLeads() {
        const now=Date.now();
        const staleWarning = $('lead-stale-warning');
        if (staleWarning) {
            staleWarning.hidden = !leadRefreshError;
            staleWarning.textContent = (sheetLeads.length ? 'แสดงข้อมูลเดิม · ยังยืนยันข้อมูลล่าสุดไม่ได้ · งดแก้ไขและจองคิวจนกว่าจะโหลดสำเร็จ' : 'ยังโหลดรายการไม่สำเร็จ กรุณาลองอัปเดตข้อมูลล่าสุด') + (leadRefreshError ? ' · ' + leadRefreshError : '');
        }
        // An empty list means the contact report has not been read yet; the Line/Facebook tabs set the count from their own read.
        if (sheetLeads.length || !session) updateFollowUpCount(sheetLeads,now);
        const followUps = tab === 'followups';
        const query = $('lead-search').value.trim().toLowerCase(), status = $('lead-status').value;
        const newestLeadFirst = (a,b) => contactDate(b).localeCompare(contactDate(a))
            || String(b.sheetData?.time || '00:00:00').padStart(8,'0').localeCompare(String(a.sheetData?.time || '00:00:00').padStart(8,'0'))
            || (Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0)
            || Number(String(b.id).replace('sheet-lead:',''))-Number(String(a.id).replace('sheet-lead:',''))
            || String(b.id).localeCompare(String(a.id));
        const list = sheetLeads.filter(l => (!followUps || isFollowUp(l)) && (!status || l.status === status) && [l.name,l.phone,l.salesperson,l.sheetData?.contact,l.sheetData?.admin,l.sheetData?.extraChannels].join(' ').toLowerCase().includes(query));
        // Follow-ups run from the oldest update to the latest and are grouped by Bangkok update date; leads without a usable date stay on top.
        const updatedAt = new Map(followUps ? sheetLeads.map(l => { const {at}=latestContactTimestamp(l,now); return [l,Number.isFinite(at) ? at : -Infinity]; }) : []);
        const groupDate = l => followUps ? (Number.isFinite(updatedAt.get(l)) ? new Date(updatedAt.get(l)+7*3600000).toISOString().slice(0,10) : '') : contactDate(l);
        list.sort((a,b) => followUps ? updatedAt.get(a)-updatedAt.get(b) || newestLeadFirst(b,a) : newestLeadFirst(a,b));
        const pageSize = 50, dailySummary = new Map();
        // Cancelled leads are absent from the follow-up list; its summary covers every lead last updated that day.
        (followUps ? sheetLeads : list).forEach(lead => {
            const date = groupDate(lead);
            if (!dailySummary.has(date)) dailySummary.set(date,{total:0,successful:0,unsuccessful:0});
            const summary = dailySummary.get(date);
            summary.total++;
            const followUp = customerFollowUp(lead);
            if (isAutomaticClosedStatus(followUp) || normalizeFollowUp(followUp) === normalizeFollowUp('มัดจำ/นัดติดตั้งแล้ว')) summary.successful++;
            if (normalizeFollowUp(followUp).startsWith('ยกเลิก')) summary.unsuccessful++;
        });
        const totalPages = Math.max(1,Math.ceil(list.length/pageSize));
        contactPage = Math.min(contactPage,totalPages-1);
        const offset = contactPage*pageSize, visible = list.slice(offset,offset+pageSize);
        $('contact-count').textContent = list.length.toLocaleString('th-TH') + ' ราย';
        $('contact-page-label').textContent = list.length ? `หน้า ${contactPage+1} / ${totalPages} · รายการ ${offset+1}–${offset+visible.length} จาก ${list.length.toLocaleString('th-TH')} · แสดง ${pageSize} รายการต่อหน้า` : '0 รายการ';
        $('contact-previous').disabled = contactPage === 0;
        $('contact-next').disabled = contactPage+1 >= totalPages;
        const renderLead = ({l,index}) => {
            const data=l.sheetData||{}, createdDay=day(l.createdAt);
            const age=followUpAge(l,now), date=contactDate(l);
            // Only the follow-up list highlights due leads; the contact report stays plain.
            const highlight=followUps ? age.highlight : '';
            const time = data.time || (date && date === createdDay ? new Date(l.createdAt).toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'}) : '—');
            const latestContact = [...(l.contactHistory || []),...window.CarLeadSheet.splitHistory(data.note || l.note || '').history]
                .sort((a,b) => String(b.at).localeCompare(String(a.at)))[0];
            const columns = [
                ['ชื่อลูกค้า',l.name||data.name||'ยังไม่มีชื่อ'],
                ['ช่องทางติดต่อ / ชื่อช่องทางติดต่อ',`${data.channel||sourceLabel(l)} : ${data.contact||'—'}`],
                ['เบอร์โทร',formatLeadPhone(data.phone||l.phone)||'—'],
                ['รุ่นรถยนต์',data.carModel||l.carModel||'—'],
                ['สถานะการติดตาม',l.status||data.followUp||'—'],
                ['วันที่นัดติดตั้ง',l.installationDate||'—'],
                ['ประวัติการติดต่อล่าสุด',latestContact?.text || '—']
            ];
            // "เกินกำหนด" แสดงต่างจาก "วันนี้" (คลาสเดิม followup-overdue) และมีข้อความกำกับใต้ชื่อลูกค้า ไม่สื่อด้วยสีอย่างเดียว
            const overdue=highlight === 'overdue' ? age.overdue : null;
            return `<article class="contact-timeline-item${{today:' followup-overdue',tomorrow:' followup-due-tomorrow',overdue:' followup-past-due'}[highlight] || ''}" title="${esc((overdue ? overdue.title + ' · ' : {today:'ต้องติดตามวันนี้ · ',tomorrow:'ต้องติดตามพรุ่งนี้ · '}[highlight] || '') + age.label)}" data-lead-details="${esc(l.id)}" tabindex="0" aria-label="รายละเอียด ${esc(l.name || 'ผู้ติดต่อ')}${overdue ? ' · ' + esc(overdue.text) : ''}"><div class="contact-time"><span>${esc(time)}</span><small>#${index}</small></div><div class="contact-timeline-card">${columns.map(([label,value],i)=>label === 'วันที่นัดติดตั้ง' ? renderInstallationDates(value) : `<div class="contact-report-field ${label === 'สถานะการติดตาม' ? 'contact-status-with-count' : ''}" aria-label="${esc(label)}">${label === 'สถานะการติดตาม' ? `<span class="contact-history-count ${Number(l.historyCount ?? 0) === 0 ? 'is-zero' : ''}" title="ประวัติการติดต่อ ${l.historyCount ?? 0} รายการ" aria-label="ประวัติการติดต่อ ${l.historyCount ?? 0} รายการ">${l.historyCount ?? 0}</span>` : ''}<${i===0?'strong':'span'} class="${i===0?'contact-inline-name':label==='สถานะการติดตาม'?'lead-badge':'contact-inline-detail'}" title="${esc(value)}">${esc(value)}</${i===0?'strong':'span'}>${i===0 && overdue ? `<small class="followup-past-due-note">${esc(overdue.text)}</small>` : ''}</div>`).join('')}${tab === 'followups' ? renderFollowUpUpdated(l) : ''}<button class="lead-button ${l.isCustomer ? 'existing-customer' : ''}" data-lead="${esc(l.id)}" ${l.isCustomer || l.pendingCustomerCheck || !leadHasPhone(l) ? 'disabled' : ''}${!l.isCustomer && !l.pendingCustomerCheck && !leadHasPhone(l) ? ` title="${esc(noPhoneCustomerHint)}"` : ''}>${l.isCustomer ? 'ลูกค้า' : l.pendingCustomerCheck ? 'กำลังตรวจข้อมูลลูกค้า' : !leadHasPhone(l) ? 'ใส่เบอร์โทรก่อน' : 'เพิ่มข้อมูลลูกค้า'}</button></div></article>`;
        };
        const track = items => `<div class="contact-day-track">${items.map(renderLead).join('')}</div>`;
        const groups = new Map();
        visible.forEach((l,index) => { const date=groupDate(l); if (!groups.has(date)) groups.set(date,[]); groups.get(date).push({l,index:offset+index+1}); });
        $('lead-list').innerHTML = [...groups].map(([date,dayItems]) => {
            const label = date ? new Date(date+'T12:00:00+07:00').toLocaleDateString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'long',year:'numeric'}) : 'ไม่ระบุวันที่';
            const {total,successful,unsuccessful} = dailySummary.get(date);
            const outcomeLabel = followUps ? 'ไม่สำเร็จ' : 'สำเร็จ';
            const outcomeCount = followUps ? unsuccessful : successful;
            const outcomeRate = (total ? outcomeCount/total*100 : 0).toLocaleString('th-TH',{maximumFractionDigits:1});
            const summaryTitle = followUps ? 'สถานะยกเลิกทุกประเภท ÷ Lead ทั้งหมดที่อัปเดตล่าสุดในวันนั้น × 100 รวมรายการที่ไม่ได้แสดงในหน้าติดตาม' : 'ปิดการขายสำเร็จและมัดจำ/นัดติดตั้งแล้ว ÷ Lead ทั้งหมดของวันตามตัวกรอง × 100';
            const prefix = followUps ? '' : (date ? 'วันนี้ ' : 'ไม่ระบุวันที่ ');
            return `<section class="contact-day-group"><h3 class="contact-day-heading"><span class="contact-day-dot"></span><time datetime="${esc(date)}">${esc(label)}</time><span title="${esc(summaryTitle)}">${prefix}${total.toLocaleString('th-TH')} รายการ · ${outcomeLabel} ${outcomeCount.toLocaleString('th-TH')} รายการ · คิดเป็น ${outcomeRate}%</span></h3>${track(dayItems)}</section>`;
        }).join('') || empty(session ? 'ยังไม่มีผู้ติดต่อที่ตรงกับรายการค้นหา' : 'กำลังเชื่อมต่อเพื่อโหลดรายชื่อผู้ติดต่อ');
    }
    function renderInstallations() {
        $('archive-summary').textContent = records.archiveCounts ? `เก็บต้นฉบับครบทุกแถว: ${Object.entries(records.archiveCounts).map(([name,count]) => `${name} ${count.toLocaleString('th-TH')}`).join(' · ')}` : '';
        $('archive-summary').textContent = records.archiveCounts ? `เก็บต้นฉบับครบทุกแถว: ${Object.entries(records.archiveCounts).map(([name,count]) => `${name} ${count.toLocaleString('th-TH')}`).join(' · ')}` : '';
        const query = $('installation-search').value.toLowerCase();
        const list = records.installations.map(i => ({...i, customerName:records.leads.find(l => l.id === i.leadId)?.name || i.customerName || '—'}))
            .filter(i => [i.customerName,i.plate,i.carModel,i.filmBrand,i.legacyJob,i.technician,i.status].join(' ').toLowerCase().includes(query))
            .sort((a,b) => (inputDate(b.date)+' '+inputTime(b.time)).localeCompare(inputDate(a.date)+' '+inputTime(a.time)));
        installationPage = Math.min(installationPage,Math.max(0,Math.ceil(list.length/30)-1));
        $('installation-count').textContent = `${list.length.toLocaleString('th-TH')} งาน · หน้า ${installationPage+1}/${Math.max(1,Math.ceil(list.length/30))}`;
        $('installation-previous').disabled = installationPage === 0;
        $('installation-next').disabled = (installationPage+1)*30 >= list.length;
        $('installation-list').innerHTML = list.slice(installationPage*30,installationPage*30+30).map(i => `<article class="lead-row"><div><strong>${esc(i.customerName)}</strong><span class="lead-badge">${esc(i.status || 'คิวใหม่')}</span><p>${esc(i.date || '—')} ${esc(i.time || '')} · ${esc(i.carModel || '—')} · ทะเบียน ${esc(i.plate || '—')}</p><p>${esc(i.filmBrand || '—')} ${esc(i.filmModel || '')} · ${esc(i.positions || '—')} · ยอดขาย ${esc(i.amount || '—')}</p>${i.legacyJob ? `<p>JobID เดิม ${esc(i.legacyJob)}</p>` : ''}</div><button class="lead-button" data-installation="${esc(i.id)}">รายละเอียด / แก้ไข</button></article>`).join('') || empty(session ? 'ยังไม่มีงานติดตั้ง · เพิ่มงานใหม่หรือนำเข้าประวัติเดิม' : 'กรุณาเชื่อมต่อระบบลีดก่อน');
    }
    function field(name, label, value = '', type = 'text', options = null, required = false) {
        let control;
        if (options) control = `<select name="${name}" ${required ? 'required' : ''}>${options.map(o => { const [v,l] = Array.isArray(o) ? o : [o,o]; return `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
        else if (type === 'textarea') control = `<textarea name="${name}" rows="3">${esc(value)}</textarea>`;
        else control = `<input name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''}>`;
        return `<label class="${type === 'textarea' ? 'full' : ''}"><span class="sheet-field-caption">${label}${required ? ' <span class="sheet-required-star" aria-hidden="true">*</span>' : ''}</span>${control}</label>`;
    }
    function formatLeadPhone(value) {
        const original = String(value || '').trim();
        let digits = original.replace(/\D/g,'');
        if (digits.length === 11 && digits.startsWith('66')) digits = '0' + digits.slice(2);
        return digits.length === 10 ? digits.slice(0,3)+'-'+digits.slice(3,6)+'-'+digits.slice(6) : original;
    }
    const sheetLabels = {admin:'ฝ่ายขาย',contact:'ชื่อช่องทางติดต่อ',positions:'ตำแหน่งติดตั้ง',filmBrand:'ยี่ห้อฟิล์ม',filmModel:'รุ่นฟิล์ม',knownFrom:'รู้จักเราจาก',note:'หมายเหตุ',extraChannels:'ช่องทางเพิ่มเติม'};
    function sheetSections(renderField, leadId = '', customerId = '') {
        return [
            ['01','ข้อมูลผู้ติดต่อ',['name','date','phone','channel','admin','contact','extraChannels','customerType','knownFrom']],
            ['02','รถยนต์และฟิล์มที่สนใจ',['carBrand','carModel','positions','filmBrand','filmModel','budget','note']],

        ].map(([number,title,names]) => `<section class="sheet-form-section"><h3><span>${number}</span>${title}${number === '01' ? `<small class="sheet-lead-id">Lead ID: ${esc(leadId || 'ยังไม่สร้าง')}${customerId ? `<span class="sheet-customer-id">Customer ID: ${esc(customerId)}</span>` : ''}</small>` : ''}</h3><div class="sheet-section-grid">${names.map(renderField).join('')}</div></section>`).join('');
    }
    function applyConfirmedLead(saved, values, previousLead, localLead = null) {
        savedLeadRevision++;
        clearLeadsSnapshot();
        if (localLead) {
            records.leads = records.leads.filter(item => item.id !== localLead.id && item.sheetKey !== localLead.sheetKey);
            records.leads.push(localLead);
        }
        const previous = sheetLeads.find(item => item.leadId === saved.leadId || item.id === previousLead.id);
        const data = Object.fromEntries(window.CarLeadSheet.fields.map(([name]) => [name, String(values[name] ?? '').trim()]));
        const confirmed = {...previous, id:previous?.id || 'sheet-lead:' + (Number(saved.rowNumber)-2),
            leadId:saved.leadId, name:data.name, phone:data.phone, salesperson:data.admin, note:data.note,
            status:data.followUp, sheetData:{...previous?.sheetData,...data}, sheetRow:saved.rowNumber,
            contactHistory:(values.contactHistory || []).map(item => ({...item})), historyCount:saved.historyCount ?? 0,
            source:{platform:'sheet-lead'}, readOnly:true, createdAt:localLead?.createdAt || previous?.createdAt,
            installationDate:previous?.installationDate || '—', pendingCustomerCheck:true};
        sheetLeads = sheetLeads.filter(item => item.id !== confirmed.id && item.leadId !== confirmed.leadId);
        sheetLeads.push(confirmed);
        if (sheetChecked) {
            // The saved names (main channel and other channels) count at once on the Line/Facebook tabs.
            for (const entry of [{channel:data.channel,contact:data.contact},...parseExtraChannels(data.extraChannels)].filter(item => item.contact)) {
                const sameContact = item => String(item.channel).trim().toLowerCase() === entry.channel.toLowerCase()
                    && String(item.contact).trim().toLowerCase() === entry.contact.toLowerCase();
                sheetContacts = [...sheetContacts.filter(item => !sameContact(item)),entry];
            }
        }
        renderStatusOptions(); renderLeads(); renderInbox();
    }
    function refreshAfterLeadSave(saved) {
        // The embedded form closes after saving and shows no lists to refresh.
        if (embeddedNewLead) return;
        const currentSession = session, currentService = service, currentRevision = savedLeadRevision;
        // These reads update the lists; they are not part of confirming the write.
        void Promise.allSettled([loadRecords(undefined,{reportErrors:true}),checkSheetContacts({refresh:true})]).then(results => {
            if (session !== currentSession || service !== currentService || currentRevision !== savedLeadRevision) return;
            if (results.some(result => result.status === 'rejected')) {
                notice(`บันทึกลงชีต lead แถว ${saved.rowNumber} แล้ว แต่ยังโหลดรายการล่าสุดไม่ครบ กรุณารีเฟรชหน้าเพื่ออัปเดตรายการ`,true);
            }
        });
    }
    function editor(title, html, save) {
        $('save-editor').hidden = false; $('editor').querySelector('.sheet-save-hint').hidden = false;
        for (const id of ['add-lead-customer','book-lead-installation']) { $(id).hidden = true; $(id).onclick = null; }
        $('editor-title').textContent = title; $('editor-fields').innerHTML = html; $('editor-error').textContent = '';
        const sheetForm = html.includes('sheet-form-section');
        $('editor').classList.toggle('sheet-editor', sheetForm);
        $('cancel-editor').textContent = save ? 'ยกเลิก' : 'ปิด';
        $('save-editor').textContent = sheetForm ? 'บันทึกข้อมูล' : 'บันทึก';
        saveEditor = save; editorGeneration++; $('editor').showModal();
    }
    function getLeadEditorSnapshot() {
        return JSON.stringify(Array.from(new FormData($('editor-form'))));
    }
    function openBookingFromLead(lead) {
        if ($('editor-form').getAttribute('aria-busy') === 'true') return;
        const customerId = String(lead.customerId || '').trim();
        if (!customerId) { $('editor-error').textContent = 'กรุณาเพิ่มข้อมูลลูกค้าก่อนนัดคิวติดตั้ง'; return; }
        if (getLeadEditorSnapshot() !== leadEditorSnapshot || $('history-text').value.trim() || leadEditorHistoryChanged) {
            $('editor-error').textContent = 'กรุณาบันทึกข้อมูลที่แก้ไขก่อนนัดคิวติดตั้ง';
            return;
        }
        // The queue keeps the lead's ID, so its status changes move only this lead.
        location.href = 'customer-data.html?bookingCustomer=' + encodeURIComponent(customerId) + (lead.leadId ? '&lead=' + encodeURIComponent(lead.leadId) : '');
    }
    // A lead is tied to its customer by phone number only, so a customer is added from a lead that has a saved phone;
    // otherwise the new customer's phone would exist on the customer alone and the lead would never be tied to it.
    const noPhoneCustomerHint = 'กรุณาใส่เบอร์โทรในลีดและบันทึกก่อนเพิ่มข้อมูลลูกค้า';
    function leadHasPhone(lead) { return String(lead?.phone || lead?.sheetData?.phone || '').replace(/\D/g,'').length >= 9; }
    // The customer page opens a new customer form prefilled from the saved lead row.
    function startCustomerFromLead(lead) {
        const draft = {...lead.sheetData,note:window.CarLeadSheet.splitReminder(window.CarLeadSheet.splitHistory(lead.sheetData?.note).note).note};
        sessionStorage.setItem('carLeadCustomerDraft',JSON.stringify({createdAt:Date.now(),leadId:lead.leadId || '',data:draft}));
        location.href = 'customer-data.html?fromLead=1';
    }
    function openCustomerFromLead(lead) {
        if ($('editor-form').getAttribute('aria-busy') === 'true' || $('add-lead-customer').disabled) return;
        if (getLeadEditorSnapshot() !== leadEditorSnapshot || $('history-text').value.trim() || leadEditorHistoryChanged) {
            $('editor-error').textContent = 'กรุณาบันทึกข้อมูลที่แก้ไขก่อนบันทึกข้อมูลลูกค้า';
            return;
        }
        startCustomerFromLead(lead);
    }
    // With a CustID the lead can book an installation; without one, the customer is added first from the saved lead row.
    function setLeadCustomerButtons(lead, platform) {
        const customerId = String(lead.customerId || '').trim();
        const booking = $('book-lead-installation'), customer = $('add-lead-customer');
        booking.hidden = false;
        booking.disabled = !customerId;
        booking.title = customerId ? 'เปิดฟอร์มนัดคิวติดตั้งสำหรับลูกค้ารายนี้' : 'บันทึกข้อมูลลูกค้าก่อนนัดคิวติดตั้ง';
        booking.onclick = () => openBookingFromLead(lead);
        customer.hidden = !!customerId;
        // Same limits as the list button, so a matched customer is never added twice.
        const blocked = platform !== 'sheet-lead' ? 'บันทึกข้อมูลลีดก่อนบันทึกข้อมูลลูกค้า'
            : lead.pendingCustomerCheck ? 'กำลังตรวจข้อมูลลูกค้า'
            : lead.isCustomer ? 'พบข้อมูลลูกค้าที่ตรงกันมากกว่า 1 รายการ กรุณาตรวจในหน้าข้อมูลลูกค้า'
            : !leadHasPhone(lead) ? noPhoneCustomerHint : '';
        customer.disabled = !!blocked;
        customer.title = blocked || 'เปิดฟอร์มบันทึกข้อมูลลูกค้าจากลีดนี้';
        customer.onclick = () => openCustomerFromLead(lead);
    }
    // Other channels of the same person ("ช่องทางเพิ่มเติม"), one "Channel: name" per line, e.g. a lead who phoned first and
    // wrote on Line later. The Line/Facebook tabs and the automatic lead capture treat these names as this lead.
    // A line in another form (typed in the sheet) is kept as an "Other" entry, so opening the form never drops it.
    const extraChannelChoices = ['Line','FB','IG','Tel','WalkIn','Email','Tiktok','Other'];
    function parseExtraChannels(value) {
        return String(value || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => {
            const match = /^([A-Za-z]+)\s*:\s*(.+)$/.exec(line);
            return match ? {channel:match[1],contact:match[2].trim()} : {channel:'Other',contact:line};
        });
    }
    const channelGroup = value => { const text = String(value || '').trim().toLowerCase(); return text === 'facebook' ? 'fb' : text === 'instagram' ? 'ig' : text; };
    const sameChannelName = (a, b) => channelGroup(a.channel) === channelGroup(b.channel) && String(a.contact || '').trim().toLowerCase() === String(b.contact || '').trim().toLowerCase();
    let extraChannelsControl = null;
    function extraChannelsField(value) {
        return '<div class="sheet-extra-channels full" data-extra-channels><span class="sheet-control-label" id="extra-channels-label">ช่องทางเพิ่มเติม</span>'
            + '<input type="hidden" name="extraChannels" value="' + esc(value) + '"><div class="sheet-extra-list" role="group" aria-labelledby="extra-channels-label"></div>'
            + '<div class="sheet-extra-actions"><button type="button" class="lead-button sheet-extra-add">+ เพิ่มช่องทาง</button></div>'
            + '<small>ช่องทางอื่นของลูกค้าคนเดียวกัน เช่น โทรมาก่อนแล้วทัก Line ทีหลัง</small><span class="sheet-extra-status" role="status"></span></div>';
    }
    function watchExtraChannels() {
        const box = $('editor-fields').querySelector('[data-extra-channels]');
        extraChannelsControl = null;
        if (!box) return;
        const hidden = box.querySelector('input[name="extraChannels"]'), list = box.querySelector('.sheet-extra-list'), status = box.querySelector('.sheet-extra-status');
        const row = (channel = 'Line', contact = '') => '<div class="sheet-extra-row"><select aria-label="ช่องทาง">'
            + [...new Set([...extraChannelChoices,channel])].map(choice => '<option' + (choice === channel ? ' selected' : '') + '>' + esc(choice) + '</option>').join('')
            + '</select><input type="text" maxlength="200" aria-label="ชื่อในช่องทางนี้" placeholder="ชื่อโปรไฟล์ / เบอร์" value="' + esc(contact) + '">'
            + '<button type="button" class="sheet-extra-remove" aria-label="ลบช่องทางนี้">×</button></div>';
        const sync = () => {
            hidden.value = [...list.querySelectorAll('.sheet-extra-row')]
                .map(item => [item.querySelector('select').value,item.querySelector('input').value.replace(/\s+/g,' ').trim()])
                .filter(([,contact]) => contact).map(([channel,contact]) => channel + ': ' + contact).join('\n');
        };
        list.innerHTML = parseExtraChannels(hidden.value).map(item => row(item.channel,item.contact)).join('');
        box.querySelector('.sheet-extra-add').addEventListener('click',() => {
            if ($('editor-form').getAttribute('aria-busy') === 'true') return;
            list.insertAdjacentHTML('beforeend',row());
            list.lastElementChild.querySelector('input').focus();
        });
        list.addEventListener('input',sync); list.addEventListener('change',sync);
        list.addEventListener('click',event => {
            const remove = event.target.closest('.sheet-extra-remove');
            if (!remove || $('editor-form').getAttribute('aria-busy') === 'true') return;
            remove.closest('.sheet-extra-row').remove(); sync();
        });
        extraChannelsControl = {
            // Adds a channel unless it is already listed; the lead is linked once the form is saved.
            add(channel, contact) {
                if (!parseExtraChannels(hidden.value).some(item => sameChannelName(item,{channel,contact}))) { list.insertAdjacentHTML('beforeend',row(channel,contact)); sync(); }
                status.textContent = 'เพิ่ม ' + channel + ': ' + contact + ' แล้ว · กดบันทึกการแก้ไขเพื่อผูกแชตนี้กับลีด';
            }
        };
    }
    // Checked before saving: at most 10 entries, none repeated, none the same as the main channel name.
    function checkExtraChannels(values) {
        const extras = parseExtraChannels(values.extraChannels);
        if (extras.length > 10) throw new Error('ช่องทางเพิ่มเติมใส่ได้ไม่เกิน 10 รายการ');
        if (extras.some(item => item.channel.length > 20 || item.contact.length > 200)) throw new Error('ชื่อในช่องทางเพิ่มเติมยาวเกิน 200 ตัวอักษร');
        if (extras.some((item,index) => extras.findIndex(other => sameChannelName(item,other)) !== index)) throw new Error('ช่องทางเพิ่มเติมมีรายการซ้ำกัน');
        if (extras.some(item => sameChannelName(item,{channel:values.channel,contact:values.contact}))) throw new Error('ช่องทางเพิ่มเติมซ้ำกับช่องทางติดต่อหลัก');
        values.extraChannels = extras.map(item => item.channel + ': ' + item.contact).join('\n');
    }
    // Leads whose main channel name or other channels match a Line/Facebook chat (a chat saved without its contact key).
    function contactSheetLeads(row) {
        if (!row || !Array.isArray(records.sheetLeads)) return [];
        const channel = tab === 'instagram' ? 'IG' : tab === 'line' ? 'Line' : 'FB';
        const names = [row.display_name,tab === 'instagram' ? row.instagram_user_id : tab === 'line' ? row.line_user_id : row.facebook_user_id].map(value => String(value || '').trim()).filter(Boolean);
        return records.sheetLeads.filter(lead => [{channel:lead.sheetData?.channel,contact:lead.sheetData?.contact},...parseExtraChannels(lead.sheetData?.extraChannels)]
            .some(item => names.some(contact => sameChannelName(item,{channel,contact}))));
    }
    // A chat from someone who already has a lead: pick that lead, and the chat's name is added to its other channels
    // (saved with the lead) instead of saving a second lead for the same person.
    function linkChatButton(channel, name) {
        const box = $('editor-fields').querySelector('[data-extra-channels] .sheet-extra-actions');
        if (!box || !name) return;
        box.insertAdjacentHTML('beforeend','<button type="button" class="lead-button sheet-link-open" aria-expanded="false" aria-controls="sheet-link-panel">ผูกกับลีดเดิม</button>');
        box.parentElement.insertAdjacentHTML('beforeend','<div class="sheet-link-panel" id="sheet-link-panel" hidden><input type="search" placeholder="ค้นหาชื่อ เบอร์โทร หรือ Lead ID" aria-label="ค้นหาลีดเดิม" autocomplete="off"><div class="sheet-link-results" role="list"></div><small>เลือกแล้วจะเปิดลีดเดิมพร้อมเพิ่ม ' + esc(channel + ': ' + name) + ' · ข้อมูลที่กรอกในฟอร์มนี้จะไม่ถูกบันทึก</small></div>');
        const open = box.querySelector('.sheet-link-open'), panel = $('sheet-link-panel'), search = panel.querySelector('input'), results = panel.querySelector('.sheet-link-results');
        let leads = null;
        const render = () => {
            const query = search.value.trim().toLowerCase(), digits = query.replace(/\D/g,'');
            if (!leads) { results.innerHTML = '<p class="lead-muted">กำลังโหลดรายการลีด…</p>'; return; }
            if (!query) { results.innerHTML = ''; return; }
            const found = leads.filter(lead => [lead.leadId,lead.name,lead.sheetData?.contact].some(value => String(value || '').toLowerCase().includes(query))
                || digits.length >= 4 && String(lead.phone || '').replace(/\D/g,'').includes(digits)).slice(0,8);
            results.innerHTML = found.map(lead => '<div class="sheet-link-item" role="listitem"><span>' + esc([lead.leadId,lead.name,lead.phone,lead.sheetData?.channel,customerFollowUp(lead)].filter(Boolean).join(' · ')) + '</span><button type="button" class="lead-button" data-link-lead="' + esc(lead.id) + '">เลือก</button></div>').join('') || '<p class="lead-muted">ไม่พบลีดที่ค้นหา</p>';
        };
        open.addEventListener('click',guard(async () => {
            panel.hidden = !panel.hidden; open.setAttribute('aria-expanded',String(!panel.hidden));
            if (panel.hidden) return;
            search.focus(); render();
            if (!leads) { await intakeRecords(); leads = Array.isArray(records.sheetLeads) ? records.sheetLeads : []; if (panel.isConnected) render(); }
        }));
        search.addEventListener('input',render);
        results.addEventListener('click',guard(async event => {
            const button = event.target.closest('[data-link-lead]');
            if (!button || $('editor-form').getAttribute('aria-busy') === 'true') return;
            const target = (leads || []).find(lead => lead.id === button.dataset.linkLead);
            if (!target) return;
            $('editor').close();
            if (await editLead({...target,status:customerFollowUp(target)})) {
                $('editor-title').textContent = 'รายละเอียดข้อมูลผู้ติดต่อ';
                extraChannelsControl?.add(channel,name);
            }
        }));
    }
    // Facebook leads: the customer's Facebook id from the inbox contact, the saved contact key or the lead's intake source.
    function facebookChatUser(lead, source) {
        if (source?.platform === 'facebook' && /^\d{5,30}$/.test(source.userId || '')) return source.userId;
        const key = /^facebook:[^:]+:(\d{5,30})$/.exec(lead.sheetKey || '');
        if (key) return key[1];
        return lead.intakeSource?.platform === 'facebook' && /^\d{5,30}$/.test(lead.intakeSource.userId || '') ? lead.intakeSource.userId : '';
    }
    // Reads a customer's own chat messages for the lead form. A value is taken only when it is certain enough:
    // a 10-digit mobile number, names from the form's own lists (car models, film brands and models, window positions),
    // a number right after "งบ", or a name right after "ชื่อ". Two different cars or numbers are reported, not chosen.
    function chatLeadDetails(messages, lists) {
        const arabic = text => String(text || '').replace(/[๐-๙]/g, digit => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)));
        const key = text => arabic(text).toLowerCase().replace(/[\s\-_.()/,:'"]+/g, '');
        const texts = (messages || []).map(item => arabic(item && item.text)).filter(Boolean);
        const newestFirst = texts.slice().reverse();
        const joined = texts.map(key).join('|');
        // Short English names (HRV, GLE, 3M) count only as a whole word or two joined words ("C 200"), never inside "google".
        const words = new Set(texts.flatMap(text => {
            const runs = (text.toLowerCase().match(/[a-z0-9]+(?:[-.][a-z0-9]+)*/g) || []).map(run => run.replace(/[-.]/g, ''));
            return runs.concat(runs.slice(1).map((run, index) => runs[index] + run));
        }));
        const appears = item => /^[a-z0-9]{1,5}$/.test(item) ? words.has(item) : joined.includes(item);
        const hasLetter = value => /[a-zก-๙]/i.test(value);
        // Longest match per list value; a value whose match sits inside a longer match of another value gives way to it.
        const matchValues = (values, keysOf) => {
            const hits = [];
            for (const value of new Set(values.map(item => String(item || '').trim()).filter(Boolean))) {
                const found = keysOf(value).filter(appears).sort((a, b) => b.length - a.length)[0];
                if (found) hits.push({value, found});
            }
            return hits.filter(hit => !hits.some(other => other.found !== hit.found && other.found.includes(hit.found))).map(hit => hit.value);
        };
        const phones = [];
        for (const text of texts) {
            for (const match of text.matchAll(/(?<!\d)(?:\+?66[\s.-]?|0)([689](?:[\s.-]?\d){8})(?!\d)/g)) {
                const digits = '0' + match[1].replace(/\D/g, '');
                if (digits.length === 10 && !phones.includes(digits)) phones.push(digits);
            }
        }
        const modelBrands = lists.Car_model_brand || {};
        // A model name that is also a film brand (Mini "Cooper") counts only with its car brand.
        const filmBrandKeys = (lists.film_Brand || []).map(key);
        const cars = matchValues(lists.Car_model || [], model => {
            const brand = String(modelBrands[model] || '').trim();
            const rest = brand && model.toLowerCase().startsWith(brand.toLowerCase()) ? model.slice(brand.length) : model.split(/\s+/).slice(1).join(' ');
            return [key(model), key(rest)].filter((item, index) => item.length >= 3 && hasLetter(item) && !(index && filmBrandKeys.includes(item)));
        });
        // "Mini Cooper" is a car, not the Cooper film.
        const cooperCar = cars.some(car => key(car).includes('cooper'));
        const filmBrandList = (lists.film_Brand || []).filter(brand => brand && brand !== 'อื่นๆ' && !(cooperCar && key(brand).includes('cooper')));
        const filmBrandOf = model => filmBrandList.find(brand => key(model).startsWith(key(brand)));
        const filmModels = matchValues((lists.film_series || []).filter(model => !['ผสม','No Brand','รอเลือก'].includes(String(model).trim()) && !(cooperCar && key(model).includes('cooper'))), model => {
            const brand = filmBrandOf(model), whole = key(model), rest = brand ? whole.slice(key(brand).length) : '';
            return [whole, rest].filter(item => item.length >= (item === whole ? 3 : 4) && hasLetter(item));
        });
        const filmBrands = [...new Set([...matchValues(filmBrandList, brand => [key(brand)].filter(item => item.length >= 2)), ...filmModels.map(filmBrandOf).filter(Boolean)])];
        const positions = matchValues(lists['ตำแหน่งกระจก'] || [], value => [key(value)].filter(item => item.length >= 3));
        let budget = '';
        for (const text of newestFirst) {
            const match = /งบ(?:ประมาณ)?[^0-9]{0,15}?(\d[\d,]*(?:\.\d+)?)\s*(k|พัน|หมื่น|แสน)?/i.exec(text);
            if (!match) continue;
            const amount = Number(match[1].replace(/,/g, '')) * ({k:1000, 'พัน':1000, 'หมื่น':10000, 'แสน':100000}[String(match[2] || '').toLowerCase()] || 1);
            if (Number.isFinite(amount) && amount >= 100 && amount <= 1000000) { budget = String(Math.round(amount)); break; }
        }
        let name = '';
        for (const text of newestFirst) {
            const match = /ชื่อ(?:จริง|เล่น)?\s*(?:คือ|ว่า)?\s*[:：]?\s*(?:คุณ|นางสาว|นาย|นาง|น\.ส\.)?\s*([A-Za-zก-๙][A-Za-zก-๙.]*(?:\s+[A-Za-zก-๙][A-Za-zก-๙.]*)?)/.exec(text);
            if (!match) continue;
            const value = match[1].replace(/\s+(เบอร์|โทร|รถ|tel|ครับ|ค่ะ|คะ|นะ)\S*$/i, '').replace(/(ค่ะ|คะ|ครับ|คับ|นะคะ|นะครับ|นะ|จ้า|จ้ะ|ค่า|ฮะ)+$/, '').trim();
            if (value.length >= 2 && value.length <= 60 && !/^(รุ่น|ร้าน|ฟิล์ม|เพจ|ไลน์|line|facebook|เฟส|อะไร|ลูกค้า)/i.test(value)) { name = value; break; }
        }
        return {
            phone:{value:phones.length === 1 ? phones[0] : '', candidates:phones},
            carModel:{value:cars.length === 1 ? cars[0] : '', brand:cars.length === 1 ? String(modelBrands[cars[0]] || '') : '', candidates:cars},
            filmBrand:filmBrands, filmModel:filmModels, positions, budget, name
        };
    }
    // Puts the chat values into empty fields of the open lead form only, marks them, and returns the status text.
    function applyChatDetails(details) {
        const fields = $('editor-fields'), filled = [], kept = [], notes = [];
        const mark = element => element?.classList.add('sheet-chat-filled');
        const nameInput = fields.querySelector('input[name="name"]'), contactInput = fields.querySelector('input[name="contact"]');
        if (details.name && nameInput) {
            const current = nameInput.value.trim();
            if (!current || current === String(contactInput?.value || '').trim()) { if (current !== details.name) { nameInput.value = details.name; mark(nameInput.closest('label')); filled.push('ชื่อ'); } }
            else if (current !== details.name) kept.push('ชื่อ');
        }
        const phoneInput = fields.querySelector('input[name="phone"]');
        if (details.phone.value && phoneInput) {
            if (!phoneInput.value.trim()) {
                phoneInput.value = formatLeadPhone(details.phone.value);
                phoneInput.dispatchEvent(new Event('input', {bubbles:true}));
                mark(phoneInput.closest('label')); filled.push('เบอร์โทร');
            } else if (formatLeadPhone(phoneInput.value) !== formatLeadPhone(details.phone.value)) kept.push('เบอร์โทร');
        }
        if (details.phone.candidates.length > 1) notes.push('พบหลายเบอร์ ' + details.phone.candidates.map(formatLeadPhone).join(', ') + ' (ยังไม่เติม)');
        const modelField = fields.querySelector('input[name="carModel"]')?.closest('.sheet-search-field');
        if (details.carModel.value && modelField) {
            const current = modelField.querySelector('input[type="hidden"]').value;
            if (!current) {
                setSearchValue(modelField, details.carModel.value);
                setCarBrand(details.carModel.brand);
                mark(modelField); mark(fields.querySelector('.sheet-auto-field')); filled.push('รุ่นรถ');
            } else if (current !== details.carModel.value) kept.push('รุ่นรถ');
        }
        if (details.carModel.candidates.length > 1) notes.push('พบหลายรุ่นรถ ' + details.carModel.candidates.join(', ') + ' (ยังไม่เติม)');
        for (const [name, label] of [['filmBrand','ยี่ห้อฟิล์ม'],['filmModel','รุ่นฟิล์ม']]) {
            const container = fields.querySelector('input[name="' + name + '"]')?.closest('.sheet-search-field');
            if (!details[name].length || !container) continue;
            const input = container.querySelector('input[type="hidden"]');
            if (input.value.trim()) { kept.push(label); continue; }
            input.value = details[name].join(', ');
            container.querySelector('.sheet-search-value').textContent = input.value;
            for (const option of container.querySelectorAll('[data-option-value]')) {
                const checked = details[name].includes(option.dataset.optionValue);
                option.setAttribute('aria-pressed', String(checked));
                const box = option.querySelector('span');
                if (box) box.textContent = checked ? '☑' : '☐';
            }
            mark(container); filled.push(label);
        }
        const positionsField = fields.querySelector('.sheet-positions-field');
        if (details.positions.length && positionsField) {
            if (positionsField.querySelector('[name="positions"]').value.trim()) kept.push('ตำแหน่งติดตั้ง');
            else {
                const boxes = [...positionsField.querySelectorAll('[data-position-value]')].filter(input => details.positions.includes(input.dataset.positionValue));
                boxes.forEach(input => { input.checked = true; });
                if (boxes.length) { boxes[boxes.length - 1].dispatchEvent(new Event('change', {bubbles:true})); mark(positionsField); filled.push('ตำแหน่งติดตั้ง'); }
            }
        }
        const budgetInput = fields.querySelector('input[name="budget"]');
        if (details.budget && budgetInput) {
            if (!budgetInput.value.trim()) { budgetInput.value = details.budget; mark(budgetInput.closest('label')); filled.push('งบประมาณ'); }
            else if (budgetInput.value.replace(/,/g, '').trim() !== details.budget) kept.push('งบประมาณ');
        }
        const parts = [filled.length ? 'เติมจากแชตแล้ว: ' + filled.join(', ') + ' · กรุณาตรวจก่อนกดบันทึก' : 'ไม่พบข้อมูลใหม่ที่เติมได้จากแชต'];
        if (kept.length) parts.push('ไม่ทับช่องที่กรอกไว้แล้ว: ' + kept.join(', '));
        return parts.concat(notes).join(' · ');
    }
    // Adds the button above the form. The request reads only this customer's Facebook messages; nothing is saved.
    function chatFillButton(user, lists) {
        const column = $('editor-fields').querySelector('.sheet-main-column');
        if (!column) return;
        const box = document.createElement('div');
        box.className = 'sheet-chat-fill';
        box.innerHTML = '<button type="button" class="lead-button sheet-chat-fill-button">ดึงข้อมูลจากแชต Facebook</button><span class="sheet-chat-fill-status" role="status"></span>';
        column.prepend(box);
        const button = box.querySelector('button'), status = box.querySelector('[role="status"]');
        button.addEventListener('click', async () => {
            if (button.disabled || $('editor-form').getAttribute('aria-busy') === 'true') return;
            button.disabled = true; button.setAttribute('aria-busy','true'); status.textContent = 'กำลังอ่านแชต…';
            try {
                const result = await api('facebook-chat?user=' + encodeURIComponent(user));
                if (!box.isConnected) return;
                const messages = Array.isArray(result.messages) ? result.messages : [];
                status.textContent = !messages.length ? 'ยังไม่มีข้อความจากลูกค้าในแชตนี้'
                    : applyChatDetails(chatLeadDetails(messages, lists)) + (result.truncated ? ' · อ่าน 200 ข้อความล่าสุด' : '');
            } catch (error) {
                if (box.isConnected) status.textContent = 'ดึงข้อมูลจากแชตไม่สำเร็จ: ' + error.message;
            } finally {
                button.disabled = false; button.removeAttribute('aria-busy');
            }
        });
    }
    // Same phone in another lead: a note under the phone field, and the first save with that number stops once.
    // A second save goes ahead, since one customer can have more than one car. The leads come from the loaded list,
    // this tab's snapshot, or (e.g. on the Line/Facebook tabs before the list is read) one fresh read per editor.
    function duplicatePhoneCheck(lead, originalPhone) {
        const key = value => { const digits = String(value || '').replace(/\D/g,''); return digits.startsWith('66') && digits.length === 11 ? '0' + digits.slice(2) : digits; };
        const original = key(originalPhone), own = new Set([lead.id,lead.leadId].filter(Boolean));
        const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'2-digit'}).format(new Date(value + 'T12:00:00+07:00')) : '';
        let source = null, confirmed = '', note = null;
        const known = () => {
            if (sheetLeads.length) return sheetLeads;
            const stored = readLeadsSnapshot();
            return stored && stored.length ? stored : null;
        };
        const pick = (list, target) => list.filter(item => !own.has(item.id) && !own.has(item.leadId) && key(item.phone) === target);
        // An array when the list is at hand, otherwise a promise of one read.
        const matches = phone => {
            const target = key(phone);
            if (target.length !== 10 || target === original) return [];
            const list = known();
            if (list) return pick(list,target);
            source = source || api('sheet-leads').then(sheet => sheet.leads,error => { source = null; throw error; });
            return source.then(all => pick(all,target));
        };
        const show = (list, failed = false) => {
            if (!note) return;
            note.hidden = !failed && !list.length;
            if (failed) { note.textContent = 'ตรวจเบอร์ซ้ำไม่สำเร็จ บันทึกต่อได้ แต่ควรค้นเบอร์นี้ในรายการก่อน'; return; }
            const openable = item => !embeddedNewLead && sheetLeads.some(saved => saved.id === item.id);
            note.innerHTML = '<strong>เบอร์นี้มีในลีดแล้ว ' + list.length + ' รายการ</strong>' + list.slice(0,3).map(item =>
                '<span class="sheet-phone-duplicate-item"><span>' + esc([item.leadId,item.name,dateLabel(item.sheetData?.date),item.sheetData?.channel,item.status || item.sheetData?.followUp].filter(Boolean).join(' · ')) + '</span>'
                + (openable(item) ? '<button type="button" data-open-duplicate="' + esc(item.id) + '" title="ข้อมูลที่กรอกในฟอร์มนี้จะไม่ถูกบันทึก">เปิดรายการเดิม</button>' : '') + '</span>').join('')
                + (list.length > 3 ? '<span class="sheet-phone-duplicate-item">และอีก ' + (list.length - 3) + ' รายการ</span>' : '');
        };
        return {
            watch(input) {
                const label = input.closest('label'), caption = label?.querySelector('.sheet-field-caption');
                note = document.createElement('span');
                note.id = 'phone-duplicate'; note.className = 'sheet-phone-duplicate'; note.hidden = true; note.setAttribute('role','status');
                // The note sits inside the field's label; the caption alone stays the field's name.
                if (caption) { caption.id = 'phone-caption'; input.setAttribute('aria-labelledby','phone-caption'); }
                input.setAttribute('aria-describedby','phone-duplicate');
                (label || input.parentElement).append(note);
                note.addEventListener('click',guard(async event => {
                    const button = event.target.closest('[data-open-duplicate]');
                    if (!button) return;
                    event.preventDefault();
                    if ($('editor-form').getAttribute('aria-busy') === 'true' || leadsSnapshotBusy()) return;
                    $('editor').close();
                    await showLeadDetails(button.dataset.openDuplicate);
                }));
                let request = 0;
                const check = async () => {
                    const current = ++request;
                    try { const list = await Promise.resolve(matches(input.value)); if (current === request) show(list); }
                    catch { if (current === request) show([],true); }
                };
                input.addEventListener('input',check);
                void check();
            },
            // Called by the save: stops once per number that matches another lead; a failed check never blocks the save.
            // Answers at once when the list is at hand; returns a promise only when it has to read the list first.
            confirm(phone) {
                const decide = list => {
                    show(list);
                    const target = key(phone);
                    if (!list.length || confirmed === target) return;
                    confirmed = target;
                    throw new Error('เบอร์นี้มีในลีดแล้ว ' + list.length + ' รายการ (ดูใต้ช่องเบอร์โทร) ถ้าเป็นงานใหม่ เช่น รถคันใหม่ กดบันทึกข้อมูลอีกครั้ง');
                };
                const result = matches(phone);
                return Array.isArray(result) ? decide(result) : result.then(decide,() => show([],true));
            }
        };
    }
    // The phone already belongs to a customer: a note under the phone with a button that fills the lead form's empty
    // fields from that customer (name, channel name, first-known source) and marks the lead as an existing customer.
    // The customer list is read once per page (the same public sheet read as the booking list) and only when needed.
    let customerListRequest = null;
    function customerList() {
        customerListRequest ||= fetch('https://docs.google.com/spreadsheets/d/1u__xYWoWZpmrnquc-Fpk19WtpcrckxSd0-_G35NWxXQ/gviz/tq?tqx=out:csv&sheet=Customer', {cache:'no-store',signal:AbortSignal.timeout(30000)})
            .then(response => { if (!response.ok) throw new Error('โหลดข้อมูลลูกค้าไม่สำเร็จ'); return response.text(); })
            .then(text => core.csv(text))
            .catch(error => { customerListRequest = null; throw error; });
        return customerListRequest;
    }
    function customerPhoneFill(input) {
        const key = value => { const digits = String(value || '').replace(/\D/g,''); return digits.startsWith('66') && digits.length === 11 ? '0' + digits.slice(2) : digits; };
        const label = input.closest('label');
        const box = document.createElement('span');
        box.className = 'sheet-customer-fill'; box.hidden = true; box.setAttribute('role','status');
        (label || input.parentElement).append(box);
        const form = $('editor-fields');
        const field = name => form.querySelector('[name="' + name + '"]');
        const filled = value => { const text = String(value || '').trim(); return text && text !== '-' && text !== '—' ? text : ''; };
        let customer = null, request = 0;
        const check = async () => {
            const current = ++request, target = key(input.value);
            customer = null; box.hidden = true;
            if (target.length !== 10) return;
            let rows;
            try { rows = await customerList(); } catch { return; }
            if (current !== request || !box.isConnected) return;
            const matches = rows.filter(row => key(row['เบอร์โทรศัพท์']) === target);
            if (matches.length !== 1) return;
            customer = matches[0];
            box.innerHTML = '<span>เบอร์นี้เป็นลูกค้าเดิม: ' + esc([customer.CustID, filled(customer['ชื่อลูกค้า']), filled(customer['ช่องทางติดต่อ'])].filter(Boolean).join(' · ')) + '</span>'
                + '<button type="button" data-customer-fill>ดึงข้อมูลลูกค้า</button><small class="sheet-customer-fill-status"></small>';
            box.hidden = false;
        };
        box.addEventListener('click', event => {
            if (!event.target.closest('[data-customer-fill]') || !customer || $('editor-form').getAttribute('aria-busy') === 'true') return;
            const done = [];
            const setIfEmpty = (name, value, text) => { const el = field(name); if (el && value && !filled(el.value)) { el.value = value; el.dispatchEvent(new Event('input',{bubbles:true})); done.push(text); } };
            setIfEmpty('name', filled(customer['ชื่อลูกค้า']), 'ชื่อลูกค้า');
            setIfEmpty('contact', filled(customer['ชื่อช่องทางติดต่อ']), 'ชื่อช่องทาง');
            const known = field('knownFrom'), source = filled(customer['รู้จักครั้งแรก']);
            if (known && source && !known.value && [...known.options].some(option => option.value === source)) { known.value = source; done.push('รู้จักเราจาก'); }
            const old = form.querySelector('input[name="customerType"][value="ลค.เก่า"]');
            if (old && !old.checked) { old.checked = true; done.push('ประเภทลูกค้า = ลค.เก่า'); }
            box.querySelector('.sheet-customer-fill-status').textContent = done.length ? 'เติมแล้ว: ' + done.join(', ') + ' · กดบันทึกเพื่อเก็บ' : 'ไม่มีช่องว่างให้เติม';
        });
        input.addEventListener('input', check);
        void check();
    }
    async function editLead(lead = {}, contact = null) {
        requireSession();
        const openRequest = ++editorOpenRequest;
        const platform = contact ? tab : lead.source?.platform;
        const isNewLead = platform !== 'sheet-lead' && !lead.id && !lead.leadId && !lead.sheetKey && !lead.sheetSavedAt;
        const source = contact ? {platform,account,userId:platform === 'instagram' ? contact.instagram_user_id : platform === 'line' ? contact.line_user_id : contact.facebook_user_id,displayName:contact.display_name} : lead.source;
        if ([lead.leadId,lead.id].some(id => id && backgroundSaves.has(id))) throw new Error('กำลังบันทึกรายการนี้อยู่ กรุณารอให้บันทึกเสร็จก่อนเปิดอีกครั้ง');
        const key = platform === 'sheet-lead' ? `sheet-edit:${crypto.randomUUID()}` : lead.sheetKey || (source?.userId ? `${source.platform}:${source.account}:${source.userId}` : `manual:${lead.id || crypto.randomUUID()}`);
        const previous = {...lead.sheetData};
        const originalSheetData = {...previous};
        const historyData = window.CarLeadSheet.splitHistory(previous.note ?? lead.note ?? '');
        const reminderData = window.CarLeadSheet.splitReminder(historyData.note);
        previous.note = reminderData.note;
        const contactHistory = historyData.history.slice();
        for (const entry of lead.contactHistory || []) {
            if (!contactHistory.some(item => entry.id && item.id === entry.id || item.at === entry.at && item.by === entry.by && item.text === entry.text)) contactHistory.push(entry);
        }
        const savedHistory = new Map(contactHistory.filter(item => item.id).map(item => [String(item.id),{...item}]));
        const removedHistory = [];
        const initialHistory = isNewLead && !contactHistory.length
            ? {id:crypto.randomUUID(),at:new Date(Date.now()+7*3600000).toISOString().slice(0,16),by:'ระบบ',text:'เริ่มต้นการติดต่อใหม่'} : null;
        if (initialHistory) contactHistory.push(initialHistory);
        if (previous.channel === 'Tel' && !Object.hasOwn(previous,'phone') && previous.contact) { previous.phone = previous.contact; previous.contact = ''; }
        notice('กำลังโหลดตัวเลือกจากชีต…');
        const lists = await formOptions.get();
        if (openRequest !== editorOpenRequest) return false;
        notice('');
        const profileName = platform === 'line'
            ? lineContactProfile(contact || {line_user_id:source?.userId},lead).name
            : contact?.display_name || source?.displayName || (lead.name !== source?.userId ? lead.name : '') || '';
        if (platform === 'line') {
            if (Object.hasOwn(previous,'name') && !usableLineName(previous.name,source?.userId)) previous.name = profileName;
            if (!usableLineName(previous.contact,source?.userId)) {
                const legacyUserId = source?.userId && String(previous.contact ?? '').trim() === String(source.userId);
                previous.contact = profileName || (legacyUserId ? lead.phone || '' : '');
            }
        } else if (source?.userId && previous.contact === source.userId) previous.contact = profileName || lead.phone || '';
        const defaults = {date:day(new Date()),name:platform === 'line' ? profileName : lead.name || contact?.display_name || '',admin:lead.salesperson || '',
            channel:platform === 'instagram' ? 'IG' : platform === 'line' ? 'Line' : platform === 'facebook' ? 'FB' : 'Tel',
            ...(platform === 'instagram' ? {knownFrom:'Instagram'} : {}),
            contact:['line','facebook','instagram'].includes(platform) ? profileName : '',phone:lead.phone || '',note:lead.note || '',customerType:(contact?.customer_type || (contact ? core.customerTag(contact.first_seen_at,contact.last_seen_at) : 'new')) === 'existing' ? 'ลค.เก่า' : 'ลค.ใหม่',followUp:'🟡 สอบถามใหม่'};
        const labels = sheetLabels;
        // Car model -> brand (Car_model sheet), spelled as in the brand list, so choosing a model fills the brand.
        const carModelBrand = model => {
            const brands = lists.Car_model_brand || {};
            const brand = Object.hasOwn(brands,model) ? String(brands[model] || '').trim() : '';
            return brand && ((lists.Car_Brand || []).find(choice => choice.toLowerCase() === brand.toLowerCase()) || brand);
        };
        const placeholders = {admin:'ชื่อฝ่ายขาย',name:'ชื่อ-นามสกุล',contact:'ชื่อโปรไฟล์ เช่น Weerachon',phone:'เบอร์โทรศัพท์',carBrand:'เช่น Toyota',carModel:'เช่น Vios',positions:'เช่น เต็มคัน, ซันรูฟ',filmBrand:'ยี่ห้อที่สนใจ',filmModel:'รุ่นที่สนใจ',budget:'เช่น 3,200',knownFrom:'เช่น Facebook',note:'รายละเอียดเพิ่มเติม / สิ่งที่ต้องติดตาม'};
        const renderField = name => {
            if (name === 'extraChannels') return extraChannelsField(previous.extraChannels ?? '');
            if (name === 'positions') {
                const selected = String(previous.positions || '').split(',').map(value => value.trim()).filter(Boolean);
                const choices = [...new Set([...lists['ตำแหน่งกระจก'],...selected])];
                return `<div class="sheet-positions-field"><span class="sheet-control-label">ตำแหน่งติดตั้ง</span><input type="hidden" name="positions" value="${esc(selected.join(', '))}"><details class="sheet-position-menu"><summary><span class="sheet-position-summary">${esc(selected.join(', ') || 'เลือกตำแหน่งติดตั้ง')}</span><span aria-hidden="true">⌄</span></summary><div class="sheet-position-list">${choices.map(value => `<label class="sheet-position-item"><input type="checkbox" data-position-value="${esc(value)}" ${selected.includes(value) ? 'checked' : ''}><span>${esc(value)}</span></label>`).join('')}</div></details><small>เลือกได้หลายรายการ</small></div>`;
            }
            if (name === 'customerType') {
                const selected = previous.customerType ?? defaults.customerType ?? '';
                const choices = [...new Set([...window.CarLeadSheet.fields.find(item => item[0] === name)[3], ...[selected].filter(Boolean)])];
                return `<fieldset class="sheet-admin-field sheet-customer-type"><legend>ประเภทลูกค้า</legend><div class="sheet-admin-options">${choices.map(value => `<label class="sheet-admin-choice"><input type="radio" name="customerType" value="${esc(value)}" ${selected === value ? 'checked' : ''}><span>${esc(value)}</span></label>`).join('')}</div></fieldset>`;
            }
            if (name === 'admin') {
                const selected = String(previous.admin ?? defaults.admin ?? '').split(',').map(value => value.trim()).filter(Boolean);
                const choices = [...new Set([...(lists['พนักงานขาย'] || []),...selected])];
                return `<fieldset class="sheet-admin-field" data-sales-multiple><legend>ฝ่ายขาย <span class="sheet-required-star" aria-hidden="true">*</span></legend><div class="sheet-admin-options">${choices.map(value => `<label class="sheet-admin-choice"><input type="checkbox" name="admin" value="${esc(value)}" ${selected.includes(value) ? 'checked' : ''}><span>${esc(value)}</span></label>`).join('')}</div><small>เลือกได้มากกว่า 1 คน</small></fieldset>`;
            }
            const [,label,type = 'text',options] = window.CarLeadSheet.fields.find(item => item[0] === name);
            if (name === 'knownFrom') {
                const value = previous[name] ?? defaults[name] ?? '';
                return field(name,labels[name] || label,value,'text',[['','— เลือก —'],...window.CarFirstKnownOptions.choices(value)],true);
            }
            const sheet = {carBrand:'Car_Brand',carModel:'Car_model',filmBrand:'film_Brand',filmModel:'film_series',followUp:'สถานะการติดตาม'}[name];
            if (sheet) {
                const storedValue = previous[name] ?? defaults[name] ?? '';
                const value = name === 'followUp' ? followUpLabel(storedValue) : storedValue;
                const multiple = ['filmBrand','filmModel'].includes(name);
                const selected = multiple ? String(value).split(',').map(v => v.trim()).filter(Boolean) : [value];
                const listOptions = name === 'followUp' ? lists[sheet].map(followUpLabel) : lists[sheet];
                const extraOptions = name === 'followUp' && !listOptions.some(option => normalizeFollowUp(option) === normalizeFollowUp(unrelatedStatus)) ? [unrelatedStatus] : [];
                const choices = [...new Set([...listOptions,...extraOptions,...selected.filter(Boolean)])].filter(option => name !== 'followUp' || (isNewLead ? isNewLeadStatus(option) : !isAutomaticClosedStatus(option)));
                if (name === 'followUp' && isAutomaticClosedStatus(value)) {
                    return `<div class="sheet-status-automatic"><span class="sheet-control-label">${esc(labels[name] || label)}</span><input type="hidden" name="followUp" value="${esc(value)}"><strong>${esc(value)}</strong><small>สถานะอัปเดตอัตโนมัติจากคิวติดตั้ง</small></div>`;
                }
                if (name === 'carBrand') {
                    // Filled from the chosen car model (Car_model sheet), never typed or picked by hand.
                    return `<div class="sheet-search-field sheet-auto-field"><span class="sheet-control-label">${esc(labels[name] || label)}</span><input type="hidden" name="carBrand" value="${esc(value)}"><div class="sheet-auto-value" aria-live="polite">${esc(value || '—')}</div><small>อัตโนมัติจากรุ่นรถยนต์</small></div>`;
                }
                if (['carModel','filmBrand','filmModel'].includes(name)) {
                    return `<div class="sheet-search-field" data-multiple="${multiple}"><span class="sheet-control-label">${esc(labels[name] || label)}</span><input type="hidden" name="${esc(name)}" value="${esc(value)}"><details class="sheet-search-menu"><summary><span class="sheet-search-value">${esc(value || '— เลือก —')}</span><span aria-hidden="true">⌄</span></summary><div class="sheet-search-panel"><input type="search" class="sheet-option-search" placeholder="พิมพ์ค้นหา..." aria-label="ค้นหา${esc(labels[name] || label)}" autocomplete="off"><div class="sheet-search-options">${['',...choices].map(option => `<button type="button" class="sheet-search-option" data-option-value="${esc(option)}"${name === 'carModel' && lists.Car_model_brand ? ` data-option-brand="${esc(carModelBrand(option) || '')}"` : ''} aria-pressed="${selected.includes(option)}">${multiple && option ? `<span aria-hidden="true">${selected.includes(option) ? '☑' : '☐'}</span> ` : ''}${esc(option || '— ไม่ระบุ —')}</button>`).join('')}</div><small class="sheet-search-empty" hidden>ไม่พบรายการที่ค้นหา</small></div></details></div>`;
                }
                const newLeadFollowUp = name === 'followUp' && isNewLead;
                return field(name,labels[name] || label,value,'text',newLeadFollowUp ? choices : [['','— เลือก —'],...choices],newLeadFollowUp) + (name === 'followUp' ? '<small class="sheet-status-hint">ปิดการขายอัตโนมัติเมื่อคิวติดตั้งเสร็จสิ้น</small>' : '');
            }
            let result = field(name,labels[name] || label,previous[name] ?? defaults[name] ?? '',type,options,['date','name','admin','channel'].includes(name));
            if (placeholders[name]) result = result.replace(type === 'textarea' ? '<textarea ' : '<input ', `${type === 'textarea' ? '<textarea' : '<input'} placeholder="${esc(placeholders[name])}" `);
            if (name === 'positions') result = result.replace('</label>','<small>หลายตำแหน่งคั่นด้วยจุลภาค</small></label>');
            if (name === 'budget') result = result.replace('<input ', '<input inputmode="decimal" ');
            if (name === 'phone') result = result.replace('<input ', '<input inputmode="tel" autocomplete="tel" ').replace('placeholder="เบอร์โทรศัพท์"','placeholder="xxx-xxx-xxxx"');
            return result;
        };
        const statusChangeId = crypto.randomUUID();
        const storedReminderDate = previous.reminderDate || reminderData.reminderDate;
        // มีวันแจ้งเตือนที่บันทึกไว้: แสดงวันนั้นและบังคับกรอกเหมือนเดิม
        // ไม่มี: เว้นช่องว่างและไม่บังคับ ช่องว่างบันทึกเป็น "ไม่มีวันแจ้งเตือน" จึงไม่เอาวันที่แก้ข้อมูลไปตั้งเป็นวันแจ้งเตือน
        // วันครบกำหนดยังนับจากเวลาติดต่อล่าสุด + followUpAlertDays วัน จนกว่าผู้ใช้จะเลือกวันเอง
        const reminderDate = window.CarLeadSheet.validReminderDate(storedReminderDate) ? storedReminderDate : '';
        const reminderField = '<label>วันที่แจ้งเตือน<input id="history-reminder-date" name="reminderDate" type="date" value="' + esc(reminderDate) + '"' + (reminderDate ? ' required' : '') + ' aria-describedby="history-reminder-hint"></label>';
        const reminderHint = reminderDate ? 'ค่าเริ่มต้น วันนี้ + ' + followUpAlertDays + ' วัน · เลือกวันเองได้'
            : 'ยังไม่ได้ตั้ง · ระบบเตือนเมื่อครบ ' + followUpAlertDays + ' วันหลังติดต่อล่าสุด · เลือกวันเองได้';
        const contactDetails = '<div class="sheet-main-column" role="region" aria-label="รายละเอียดข้อมูลผู้ติดต่อ" tabindex="0">' + sheetSections(renderField, lead.leadId || '', lead.customerId || '') + '</div>';
        const html = contactDetails +
            '<div class="sheet-side-column" role="region" aria-label="สถานะและประวัติการติดต่อ" tabindex="0"><section class="sheet-status-card"><div class="sheet-section-grid">' + renderField('followUp') + '</div></section><aside class="sheet-history-card"><h3>ประวัติการติดต่อ</h3><div class="history-meta-row"><label>ผู้บันทึก<select id="history-by"><option value="">— เลือก —</option>' + (lists['พนักงานขาย'] || []).map(value => '<option>' + esc(value) + '</option>').join('') + '</select></label>' + reminderField + '</div><small id="history-reminder-hint">' + esc(reminderHint) + '</small><label>รายละเอียด<textarea id="history-text" rows="3" placeholder="บันทึกการติดต่อ..."></textarea></label><button type="button" class="lead-button primary" id="add-contact-history">+ เพิ่มประวัติ</button><small>บันทึกพร้อมข้อมูลลูกค้า</small><p id="history-error" role="alert"></p><div id="contact-history-list"></div></aside></div>';
        const duplicatePhone = duplicatePhoneCheck(lead,previous.phone ?? lead.phone);
        editor('เพิ่มข้อมูลผู้ติดต่อ', html, async values => {
            values.phone = formatLeadPhone(values.phone);
            if (values.phone && !/^\d{3}-\d{3}-\d{4}$/.test(values.phone)) throw new Error('กรุณากรอกเบอร์โทร 10 หลัก รูปแบบ xxx-xxx-xxxx');
            checkExtraChannels(values);
            const phoneCheck = duplicatePhone.confirm(values.phone);
            if (phoneCheck) await phoneCheck;
            if ($('history-text').value.trim()) throw new Error('กรุณากดเพิ่มประวัติก่อนบันทึก หรือเคลียร์ข้อความประวัติที่ยังไม่ได้เพิ่ม');
            if (contactHistory.some(item => item.editing)) throw new Error('กรุณากด ตกลง หรือ ยกเลิก ที่ประวัติที่กำลังแก้ไขก่อนบันทึก');
            values.note = String(values.note || '');
            if (values.reminderDate !== undefined) values.note = window.CarLeadSheet.joinReminder(values.note, values.reminderDate);
            if (isNewLead && !isNewLeadStatus(values.followUp)) throw new Error('ลีดใหม่เลือกสถานะได้เฉพาะ สอบถามใหม่, ส่งเสนอราคาแล้ว, ยกเลิก / ไม่สนใจ หรือ ยกเลิก / ไม่เกี่ยวข้อง');
            const originalStatus = originalSheetData?.followUp || previous.followUp || defaults.followUp;
            if (isAutomaticClosedStatus(originalStatus)) values.followUp = originalStatus;
            else if (isAutomaticClosedStatus(values.followUp)) throw new Error('ระบบจะปิดการขายอัตโนมัติเมื่อคิวติดตั้งเสร็จสิ้น');
            if (normalizeFollowUp(values.followUp) !== normalizeFollowUp(originalStatus)) {
                const text = 'เปลี่ยนสถานะ: ' + originalStatus + ' → ' + values.followUp;
                if (!contactHistory.some(item => item.id === statusChangeId)) contactHistory.push({id:statusChangeId,at:new Date(Date.now()+7*3600000).toISOString().slice(0,19),by:values.admin || 'ระบบ',text});
                else { const item=contactHistory.find(item=>item.id===statusChangeId); item.text=text; }
            } else { const index=contactHistory.findIndex(item=>item.id===statusChangeId); if(index>=0)contactHistory.splice(index,1); }
            values.contactHistory = contactHistory;
            const editedHistory = contactHistory.flatMap(item => { const old = savedHistory.get(String(item.id)); return old && !String(old.id).startsWith('CAR-BOOKING:') && (old.by !== item.by || old.text !== item.text) ? [{id:String(item.id),previous:{at:old.at,by:old.by,text:old.text},current:{at:item.at,by:item.by,text:item.text}}] : []; });
            if (editedHistory.length) values.editedContactHistory = editedHistory;
            values.deletedContactHistory = removedHistory.filter(item => savedHistory.has(String(item.id))).map(item => ({...savedHistory.get(String(item.id))}));
            // Every check above runs before the form closes; the sheet write below starts now and may finish after it closes.
            const commit = async () => {
                const saved = await window.CarLeadSheet.save(key,values,platform === 'sheet-lead' || lead.sheetSavedAt ? originalSheetData : null);
                if (typeof saved.followUp === 'string') values.followUp = saved.followUp;
                if (Array.isArray(saved.contactHistory)) values.contactHistory = saved.contactHistory.map(item => ({...item}));
                if (platform === 'sheet-lead') {
                    applyConfirmedLead(saved,values,lead);
                    refreshAfterLeadSave(saved);
                    notice(`บันทึกการแก้ไขลงชีต lead แล้ว · แถว ${saved.rowNumber}`);
                    return;
                }
                const local = {...lead,id:lead.id,name:values.name,phone:values.phone,salesperson:values.admin,note:values.note,
                    leadId:saved.leadId,sheetKey:key,sheetData:values,sheetRow:saved.rowNumber,sheetSavedAt:new Date().toISOString()};
                if (typeof cloudLead !== 'undefined' && cloudLead) {
                    // The verified Sheet row is the durable record. No second database commit is needed.
                    lead = {...local,id:'sheet-lead:' + saved.leadId,source:source || {platform:'manual'}};
                    applyConfirmedLead(saved,values,lead,lead);
                    refreshAfterLeadSave(saved);
                    notice(`บันทึกลงชีต lead แล้ว · แถว ${saved.rowNumber}`);
                    return;
                }
                try {
                    const result = contact ? await api('select',{platform,contactId:contact.id,lead:local}) : await api('lead',local);
                    if (!result.lead?.id) throw new Error('ไม่พบรหัสรายการที่บันทึก');
                    lead = {...result.lead,leadId:saved.leadId};
                } catch {
                    throw new Error(`บันทึกลงชีต lead แถว ${saved.rowNumber} แล้ว แต่ยังอัปเดตรายการในเครื่องไม่ได้ กดบันทึกซ้ำเพื่ออัปเดตโดยใช้แถวเดิม`);
                }
                applyConfirmedLead(saved,values,lead,lead);
                refreshAfterLeadSave(saved);
                notice(`บันทึกลงชีต lead แล้ว · แถว ${saved.rowNumber}`);
            };
            const done = commit();
            done.catch(() => {});
            return {leadRef:lead.leadId || lead.id || key,name:values.name,commit,done};
        });
        const phoneInput = $('editor-fields').querySelector('[name="phone"]');
        phoneInput.value = formatLeadPhone(phoneInput.value);
        phoneInput.addEventListener('input',() => {
            const formatted = formatLeadPhone(phoneInput.value);
            if (formatted !== phoneInput.value) phoneInput.value = formatted;
        });
        phoneInput.addEventListener('blur',() => { phoneInput.value = formatLeadPhone(phoneInput.value); });
        duplicatePhone.watch(phoneInput);
        customerPhoneFill(phoneInput);
        watchExtraChannels();
        // Only a new lead from a chat offers the link; the embedded form (booking page) has no lead lists.
        if (contact && isNewLead && !embeddedNewLead && typeof cloudLead !== 'undefined' && cloudLead) linkChatButton(defaults.channel,profileName);
        const facebookUser = typeof cloudLead !== 'undefined' && cloudLead ? facebookChatUser(lead, platform === 'facebook' ? source : null) : '';
        if (facebookUser) chatFillButton(facebookUser, lists);
        const bookingHistory = document.createElement('div');
        bookingHistory.className = 'booking-history-list';
        $('contact-history-list').after(bookingHistory);
        if (lead.customerId) {
            bookingHistory.innerHTML = '<p class="lead-muted">กำลังโหลดคิวนัด…</p>';
            (async () => {
                try {
                    const query = 'select A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,AE';
                    const response = await fetch('https://docs.google.com/spreadsheets/d/1u__xYWoWZpmrnquc-Fpk19WtpcrckxSd0-_G35NWxXQ/gviz/tq?tqx=out:csv&sheet=Bookings&tq=' + encodeURIComponent(query), {cache:'no-store',signal:AbortSignal.timeout(30000)});
                    if (!response.ok) throw new Error('โหลดคิวนัดไม่สำเร็จ');
                    const rows = core.csv(await response.text());
                    if (rows.length && ['CustID','JobID','Lead ID'].some(key=>!Object.hasOwn(rows[0],key))) throw new Error('หัวตารางคิวนัดไม่ตรง');
                    const customerAppointments = rows.filter(row => String(row.CustID || '').trim() === String(lead.customerId).trim() && row.JobID);
                    const appointments = customerAppointments.filter(row=>bookingMatchesLead(row,lead));
                    const needsReview = customerAppointments.some(row=>!String(row['Lead ID']||'').trim()&&!bookingMatchesLead(row,lead));
                    const appointmentOrder = row => {
                        const date = inputDate(String(row['วันที่ติดตั้ง'] || '').trim());
                        return date ? date + 'T' + (inputTime(String(row['เวลานัด'] || '').trim()) || '00:00') : '';
                    };
                    appointments.sort((a,b) => appointmentOrder(b).localeCompare(appointmentOrder(a)));
                    bookingHistory.innerHTML = '<h4>คิวนัด (' + appointments.length + ')</h4>' + (needsReview?'<p role="status" class="lead-muted">มีคิวเก่าที่ยังไม่ได้เชื่อม Lead กรุณาตรวจสอบก่อนอ้างอิง</p>':'') + (appointments.map(row => {
                        const details = [row['รุ่นรถยนต์'],row['ทะเบียนรถ'],row['ยี่ห้อฟิล์ม'],row['ตำแหน่งติดตั้ง']].filter(Boolean).join(' · ');
                        return '<article class="contact-history-entry booking-history-entry' + (/ยกเลิก|cancel/i.test(row.Status || '') ? ' cancelled' : '') + '"><div class="contact-history-header"><time>' + esc(row['วันที่ติดตั้ง'] || 'ยังไม่ระบุวัน') + ' ' + esc(row['เวลานัด'] || '') + '</time><span>' + esc(row['พน.ขาย'] || '') + '</span></div><p><strong>คิวนัด ' + esc(row.JobID) + '</strong></p><p>' + esc(details) + '</p><p class="booking-history-status">' + esc(row.Status || 'ยังไม่ระบุสถานะ') + '</p></article>';
                    }).join('') || '<p class="lead-muted">ยังไม่มีคิวนัด</p>');
                } catch {
                    bookingHistory.innerHTML = '<p role="alert" class="lead-muted">โหลดคิวนัดไม่สำเร็จ กรุณาปิดแล้วเปิดรายละเอียดอีกครั้ง</p>';
                }
            })();
        }
        const renderHistory = () => {
            const entries = contactHistory.map((item,index) => ({item,index})).sort((a,b) => String(b.item.at).localeCompare(String(a.item.at))).map(({item,index}) => '<article class="contact-history-entry"><div class="contact-history-header"><time>' + esc(String(item.at).replace('T',' ')) + '</time><div class="contact-history-actions"><span>' + esc(item.by) + '</span>' + (editableHistory(item) && !item.editing ? '<button type="button" class="contact-history-edit" data-edit-history="' + index + '" aria-label="แก้ไขประวัติ ' + esc(String(item.at).replace('T',' ')) + '">แก้ไข</button>' : '') + '<button type="button" class="contact-history-delete" data-delete-history="' + index + '" aria-label="ลบประวัติ ' + esc(String(item.at).replace('T',' ')) + '">ลบ</button></div></div>' + (item.editing ? historyEditor(item) : '<p>' + esc(item.text) + '</p>') + '</article>').join('');
            const removed = removedHistory.map((item,index) => '<div class="contact-history-pending"><span>รอลบ: ' + esc(item.text) + '</span><button type="button" class="contact-history-undo" data-restore-history="' + index + '">คืนค่า</button></div>').join('');
            $('contact-history-list').innerHTML = (entries || '<p class="lead-muted">ยังไม่มีประวัติ</p>') + removed;
        };
        // A saved entry can be edited (recorder and text only); entries the installation queue creates stay fixed.
        const editableHistory = item => Boolean(item.id) && !String(item.id).startsWith('CAR-BOOKING:');
        const historyEditor = item => {
            const names = [...new Set([...[...$('history-by').options].map(option => option.value).filter(Boolean), item.by])];
            return '<div class="contact-history-editing"><label>ผู้บันทึก<select data-history-edit-by>' + names.map(name => '<option value="' + esc(name) + '"' + (name === item.by ? ' selected' : '') + '>' + esc(name) + '</option>').join('') + '</select></label><label>รายละเอียด<textarea data-history-edit-text rows="3">' + esc(item.text) + '</textarea></label><div class="contact-history-edit-actions"><button type="button" class="lead-button select" data-confirm-history-edit>ตกลง</button><button type="button" class="lead-button" data-cancel-history-edit>ยกเลิก</button></div></div>';
        };
        const storedReminder = window.CarLeadSheet.validReminderDate(storedReminderDate), addedHistoryIds = new Set();
        let reminderPicked = false;
        $('history-reminder-date').addEventListener('input',() => { reminderPicked = true; });
        // Lead ที่มีวันแจ้งเตือนบันทึกไว้ (และผู้ใช้ยังไม่เลือกวันเอง): เพิ่มประวัติในฟอร์มนี้เลื่อนเป็นวันนี้ + followUpAlertDays วัน
        // ไม่มีประวัติที่เพิ่มใหม่ก็คืนเป็นวันที่บันทึกไว้
        // Lead ที่ไม่มีวันแจ้งเตือน: คงช่องว่างไว้ วันครบกำหนดตามประวัติการติดต่อล่าสุดเอง ไม่บันทึกวันที่จากการแก้ข้อมูล
        const updateDefaultReminder = () => {
            if (reminderPicked || !storedReminder) return;
            const added = contactHistory.some(item => addedHistoryIds.has(item.id));
            $('history-reminder-date').value = added ? twoDaysAfter(Date.now()) : storedReminderDate;
        };
        $('contact-history-list').onclick = event => {
            if ($('editor-form').getAttribute('aria-busy') === 'true') return;
            const edit = event.target.closest('[data-edit-history]');
            if (edit) {
                const index = Number(edit.dataset.editHistory);
                if (!Number.isInteger(index) || index < 0 || index >= contactHistory.length || !editableHistory(contactHistory[index])) return;
                contactHistory.forEach(item => { delete item.editing; });
                contactHistory[index].editing = true; $('history-error').textContent = ''; renderHistory(); return;
            }
            if (event.target.closest('[data-cancel-history-edit]')) { contactHistory.forEach(item => { delete item.editing; }); $('history-error').textContent = ''; renderHistory(); return; }
            if (event.target.closest('[data-confirm-history-edit]')) {
                const entry = event.target.closest('.contact-history-entry'), item = contactHistory.find(entry => entry.editing);
                const by = entry.querySelector('[data-history-edit-by]').value, text = entry.querySelector('[data-history-edit-text]').value.trim();
                if (!item || !by || !text) { $('history-error').textContent = 'กรุณาระบุผู้บันทึก และรายละเอียด'; return; }
                if (item.by !== by || item.text !== text) { item.by = by; item.text = text; leadEditorHistoryChanged = true; $('history-error').textContent = 'แก้ไขแล้ว · รอกดบันทึกข้อมูล'; }
                else $('history-error').textContent = '';
                delete item.editing; renderHistory(); return;
            }
            const remove = event.target.closest('[data-delete-history]');
            const restore = event.target.closest('[data-restore-history]');
            if (!remove && !restore) return;
            contactHistory.forEach(item => { delete item.editing; });
            const list = remove ? contactHistory : removedHistory;
            const index = Number(remove ? remove.dataset.deleteHistory : restore.dataset.restoreHistory);
            if (!Number.isInteger(index) || index < 0 || index >= list.length) return;
            const [item] = list.splice(index,1);
            (remove ? removedHistory : contactHistory).push(item);
            leadEditorHistoryChanged = true;
            updateDefaultReminder();
            $('history-error').textContent = remove ? 'ลบแล้ว · รอกดบันทึกข้อมูล' : 'คืนค่าประวัติแล้ว · รอกดบันทึกข้อมูล';
            renderHistory();
        };
        renderHistory();
        $('add-contact-history').onclick = () => {
            const by=$('history-by').value, text=$('history-text').value.trim();
            if (!by || !text) { $('history-error').textContent='กรุณาระบุผู้บันทึก และรายละเอียด'; return; }
            const id=crypto.randomUUID(), at=new Date(Date.now()+7*3600000).toISOString().slice(0,19);
            contactHistory.push({id,at,by,text});
            addedHistoryIds.add(id);
            updateDefaultReminder();
            leadEditorHistoryChanged = true;
            $('history-text').value=''; $('history-error').textContent='เพิ่มแล้ว · รอกดบันทึกข้อมูล'; renderHistory();
        };
        setLeadCustomerButtons(lead, platform);
        leadEditorHistoryChanged = false;
        leadEditorSnapshot = getLeadEditorSnapshot();
        if (platform === 'sheet-lead') {
            $('editor-title').textContent = 'แก้ไขข้อมูลจากชีต lead';
            $('save-editor').textContent = 'บันทึกการแก้ไข';
        }
        return true;
    }
    async function openEmbeddedLead() {
        embeddedLeadSaved = false;
        try {
            if (!await editLead()) return;
            // Report after the editor has painted, so the booking page never swaps in an empty frame.
            requestAnimationFrame(() => requestAnimationFrame(() => postToBooking('opened')));
        } catch (error) { postToBooking('error',{message:error.message}); }
    }
    function inputDate(value) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value;
        const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value || '');
        return m ? `${Number(m[3]) > 2400 ? Number(m[3])-543 : m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : '';
    }
    function inputTime(value) {
        const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value || '');
        return m ? `${m[1].padStart(2,'0')}:${m[2]}` : '';
    }
    function editInstallation(item = {}, leadId = '') {
        requireSession();
        if (!records.leads.length) throw new Error('เพิ่มลีดหรือนำเข้าประวัติเดิมก่อนเพิ่มงานติดตั้ง');
        const options = [['','เลือกลูกค้า'], ...records.leads.map(l => [l.id, `${l.name} ${l.phone || ''}`])];
        let html = field('leadId','ลูกค้า / ลีด',item.leadId || leadId,'text',options,true)
            + field('date','วันที่ติดตั้ง',inputDate(item.date),'date',null,true)
            + field('time','เวลานัด',inputTime(item.time),'time') + field('status','สถานะงาน',item.status || 'คิวใหม่','text', [...new Set(['คิวใหม่','กำลังติดตั้ง','เสร็จสิ้น','ยกเลิก',item.status].filter(Boolean))]);
        for (const [name,label] of [['carModel','รุ่นรถยนต์'],['plate','ทะเบียนรถ'],['plateColor','สีป้าย'],['customerType','ประเภทลูกค้า'],['filmBrand','ยี่ห้อฟิล์ม'],['filmModel','รุ่นฟิล์ม / ความเข้ม'],['positions','ตำแหน่งติดตั้ง'],['product','รหัสสินค้า / Pro_ID'],['price','มูลค่าสินค้า'],['discount','ส่วนลด'],['discountCode','รหัสส่วนลด'],['amount','ยอดขายสุทธิ'],['deposit','เงินมัดจำ'],['paymentMethod','วิธีชำระเงิน'],['billNumber','เลขที่บิล'],['salesperson','พนักงานขาย'],['technician','ช่าง / ทีมติดตั้ง'],['warranty','การรับประกัน'],['warrantyNumber','เลขที่ใบรับประกัน']]) html += field(name,label,item[name]);
        html += field('followUpDate','วันติดตามหลังติดตั้ง',item.followUpDate,'date') + field('note','หมายเหตุ / รายละเอียดการติดตั้ง',item.note,'textarea');
        if (item.raw) html += `<details class="full"><summary>ข้อมูลต้นฉบับทุกคอลัมน์ · JobID ${esc(item.legacyJob)}</summary><pre>${esc(JSON.stringify({งานติดตั้ง:item.raw,ลูกค้า:records.leads.find(l => l.id === item.leadId)?.rawCustomer,ข้อมูลช่าง_ฟิล์ม_การชำระเงิน:item.related},null,2))}</pre></details>`;
        editor(item.id ? 'รายละเอียดงานติดตั้ง / แก้ไข' : 'เพิ่มงานติดตั้ง',html,async values => {
            await api('installation',{...values,id:item.id}); await loadRecords(); notice('บันทึกงานติดตั้งแล้ว');
        });
    }
    document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click',guard(() => showTab(button.dataset.tab))));
    $('service-form').elements.service.value = service;
    $('service-form').addEventListener('submit',guard(async event => {
        event.preventDefault(); const url = new URL(event.target.elements.service.value);
        if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('ใช้ HTTPS หรือ HTTP บน localhost โดยระบุเฉพาะ URL หลัก');
        service = url.origin; localStorage.setItem('carLeadServiceUrl',service);
        accessKey = event.target.elements.accessKey.value; sessionStorage.setItem('carLeadAccessKey',accessKey); await connect();
    }));

    $('signout').addEventListener('click',() => { if (cloudLead) { clearInboxSnapshots(); void window.CarCrmAuth.logout(); return; } accessKey = ''; sessionStorage.removeItem('carLeadAccessKey'); $('service-form').elements.accessKey.value = ''; resetRecords(); void showTab('connection'); notice('ตัดการเชื่อมต่อระบบลีดแล้ว'); });
    $('service-form').elements.accessKey.value = accessKey;
    $('refresh-inbox').addEventListener('click',guard(async () => { await Promise.all([loadRecords(true),loadInbox({refresh:true})]); }));
    function setRange(mode) {
        rangeMode = mode;
        const today = day(new Date());
        rangeEnd = today;
        const date = new Date(today+'T00:00:00Z');
        if (mode === '3' || mode === '7' || mode === '15') date.setUTCDate(date.getUTCDate()-Number(mode)+1);
        rangeStart = mode === 'month' ? today.slice(0,7)+'-01' : mode === 'year' ? today.slice(0,4)+'-01-01' : date.toISOString().slice(0,10);
        $('range-start').value = rangeStart; $('range-end').value = rangeEnd;
        updateRange();
    }
    function updateRange() {
        document.querySelectorAll('[data-range]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.range === rangeMode)));
        $('range-form').hidden = rangeMode !== 'custom';
        updatePageHeading();
    }
    function updatePageHeading() {
        const inbox = ['line','facebook','instagram'].includes(tab);
        $('lead-page-title').textContent = tab === 'followups' ? 'รายการติดตาม' : tab === 'leads' ? 'ข้อมูลการติดต่อ Lead' : 'ข้อมูลลีด';
        const formatDate = value => value.split('-').reverse().join('-');
        $('range-label').hidden = !inbox || !rangeStart || !rangeEnd;
        $('range-label').textContent = ` : ${formatDate(rangeStart)}${rangeStart === rangeEnd ? '' : ' – '+formatDate(rangeEnd)}`;
    }
    $('range-buttons').addEventListener('click',guard(async event => {
        const button = event.target.closest('[data-range]'); if (!button) return;
        if (button.dataset.range === 'custom') { rangeMode = 'custom'; updateRange(); return; }
        setRange(button.dataset.range); await loadInbox();
    }));
    $('close-range').addEventListener('click',() => { $('range-form').hidden = true; });
    $('range-form').addEventListener('submit',guard(async event => {
        event.preventDefault();
        const start = $('range-start').value, end = $('range-end').value;
        if (!start || !end || start > end) throw new Error('กรุณาเลือกวันที่เริ่มต้นไม่เกินวันที่สิ้นสุด');
        rangeStart = start; rangeEnd = end; rangeMode = 'custom'; updateRange(); await loadInbox();
    }));
    setRange('today');
    $('inbox-date').value = day(new Date());
    $('inbox-date').addEventListener('change',guard(loadInbox)); $('inbox-filter').addEventListener('change',renderInbox);
    $('previous-page').addEventListener('click',guard(async () => { page = Math.max(0,page-1); renderInbox(); }));
    $('next-page').addEventListener('click',guard(async () => { page++; renderInbox(); }));
    $('inbox-list').addEventListener('click',guard(async event => {
        const button = event.target.closest('[data-contact]'); if (!button || button.disabled) return;
        const label = button.textContent;
        // The buttons are ready before the full lead records; a click before they arrive waits for that same read.
        if (!recordsLoaded) {
            button.disabled = true; button.textContent = 'กำลังเปิด…'; button.setAttribute('aria-busy','true');
            try { await intakeRecords(); }
            finally { button.disabled = false; button.textContent = label; button.removeAttribute('aria-busy'); }
        }
        const row = contacts.find(c => c.id === button.dataset.contact && day(c.last_seen_at) === button.dataset.contactDay); const lead = selectedLead(row);
        // A contact already saved in the lead sheet opens that saved row for editing, never a blank form:
        // by its contact key, otherwise by its channel name (main or "ช่องทางเพิ่มเติม").
        const keyLeads = lead ? [] : savedSheetLeads(row);
        const savedLeads = lead || keyLeads.length ? keyLeads : contactSheetLeads(row);
        if (!lead && existsInLeadSheet(row,null) && savedLeads.length !== 1) {
            notice(savedLeads.length > 1 ? 'พบข้อมูลลีดของผู้ติดต่อนี้หลายรายการ กรุณาแก้ไขจากแท็บรายชื่อผู้ติดต่อ' : 'ไม่พบข้อมูลลีดที่ผูกกับผู้ติดต่อนี้ กรุณาเปิดแก้ไขจากแท็บรายชื่อผู้ติดต่อ หรือกดอัปเดตข้อมูลล่าสุดแล้วลองอีกครั้ง',true);
            return;
        }
        const savedLead = savedLeads.length === 1 ? {...savedLeads[0],status:customerFollowUp(savedLeads[0])} : null;
        button.disabled = true; button.textContent = 'กำลังเปิด…'; button.setAttribute('aria-busy','true');
        try {
            if (savedLead) { if (await editLead(savedLead)) $('editor-title').textContent = 'รายละเอียดข้อมูลผู้ติดต่อ'; }
            else await editLead(lead || {},lead ? null : row);
        }
        finally { button.disabled = false; button.textContent = label; button.removeAttribute('aria-busy'); }
    }));
    $('lead-search').addEventListener('input',() => { contactPage=0; renderLeads(); }); $('lead-status').addEventListener('change',() => { contactPage=0; renderLeads(); });
    // Reads the contact report again on demand; the current list stays on screen until the new one arrives.
    $('refresh-leads').addEventListener('click',guard(async () => {
        const button = $('refresh-leads');
        if (button.disabled) return;
        requireSession();
        button.disabled = true; button.setAttribute('aria-busy','true');
        try { await loadRecords(false,{reportErrors:true}); }
        finally { button.disabled = false; button.removeAttribute('aria-busy'); }
    }));
    $('contact-previous').addEventListener('click',() => { contactPage=Math.max(0,contactPage-1); renderLeads(); $('lead-list').scrollIntoView({block:'start'}); });
    $('contact-next').addEventListener('click',() => { contactPage++; renderLeads(); $('lead-list').scrollIntoView({block:'start'}); });
    $('installation-search').addEventListener('input',() => { installationPage=0; renderInstallations(); });
    $('installation-previous').addEventListener('click',() => { installationPage=Math.max(0,installationPage-1); renderInstallations(); });
    $('installation-next').addEventListener('click',() => { installationPage++; renderInstallations(); });
    $('add-lead').addEventListener('click',guard(() => editLead()));
    $('add-installation').addEventListener('click',guard(() => editInstallation()));
    async function showLeadDetails(id) {
        const lead = sheetLeads.find(item => item.id === id);
        if (!lead) return;
        if (await editLead(lead)) $('editor-title').textContent = 'รายละเอียดข้อมูลผู้ติดต่อ';
    }
    // While the list comes from the snapshot, opening, editing or booking waits for the fresh read.
    function leadsSnapshotBusy() {
        if (!leadsFromSnapshot) return false;
        notice(leadRefreshError ? 'ข้อมูลล่าสุดยังโหลดไม่สำเร็จ จึงเปิดดูข้อมูลเดิมได้อย่างเดียว กรุณาลองโหลดรายการใหม่' : 'กำลังอัปเดตรายการล่าสุด กรุณารอสักครู่แล้วลองอีกครั้ง', !!leadRefreshError);
        return true;
    }
    $('lead-list').addEventListener('keydown',guard(async event => {
        if (!event.target.matches('[data-lead-details]') || !['Enter',' '].includes(event.key)) return;
        event.preventDefault(); if (leadsSnapshotBusy()) return; await showLeadDetails(event.target.dataset.leadDetails);
    }));
    $('lead-list').addEventListener('click',guard(async event => {
        if (event.target.closest('[data-lead],[data-install-lead],[data-lead-details]') && leadsSnapshotBusy()) return;
        const edit = event.target.closest('[data-lead]'), install = event.target.closest('[data-install-lead]');
        if (edit) {
            const lead=sheetLeads.find(l=>l.id===edit.dataset.lead);
            if (!lead || lead.isCustomer || lead.pendingCustomerCheck || edit.disabled || !leadHasPhone(lead)) return;
            startCustomerFromLead(lead);
            return;
        }
        const details = event.target.closest('[data-lead-details]');
        if (details && !install) await showLeadDetails(details.dataset.leadDetails);
        if (install) editInstallation({},install.dataset.installLead);
    }));
    $('installation-list').addEventListener('click',guard(event => { const button = event.target.closest('[data-installation]'); if (button) editInstallation(records.installations.find(i => i.id === button.dataset.installation)); }));
    $('editor').addEventListener('cancel',event => { if ($('editor-form').getAttribute('aria-busy') === 'true') event.preventDefault(); });
    for (const id of ['close-editor','cancel-editor']) $(id).addEventListener('click',() => $('editor').close());
    if (embeddedNewLead) {
        $('editor').addEventListener('close',() => postToBooking('closed',{saved:embeddedLeadSaved}));
        // The booking page keeps this frame after closing and asks it to open a blank form again.
        window.addEventListener('message',event => {
            if (event.source !== window.parent || event.origin !== location.origin || event.data?.type !== 'car-lead-embed' || event.data.state !== 'open') return;
            if (session && !$('editor').open) void openEmbeddedLead();
        });
        // The editor opens before the booking page shows and focuses this frame; then focus its first control as on the lead page.
        window.addEventListener('focus',() => {
            if ($('editor').open && !$('editor').contains(document.activeElement)) $('editor').querySelector('button,input,select,textarea')?.focus();
        });
    }
    document.addEventListener('click',event => {
        for (const menu of document.querySelectorAll('.sheet-position-menu[open], .sheet-search-menu[open]')) {
            if (!menu.contains(event.target)) menu.open = false;
        }
    });
    $('editor-fields').addEventListener('input',event => {
        if (!event.target.matches('.sheet-option-search')) return;
        const panel = event.target.closest('.sheet-search-panel');
        const query = event.target.value.trim().toLocaleLowerCase();
        let count = 0;
        for (const button of panel.querySelectorAll('[data-option-value]')) {
            button.hidden = !button.textContent.toLocaleLowerCase().includes(query);
            if (!button.hidden) count++;
        }
        panel.querySelector('.sheet-search-empty').hidden = count > 0;
    });
    $('editor-fields').addEventListener('click',event => {
        const button = event.target.closest('[data-option-value]');
        if (!button) return;
        const container = button.closest('.sheet-search-field');
        if (container.dataset.multiple === 'true') {
            const input = container.querySelector('input[type="hidden"]');
            let values = input.value.split(',').map(v => v.trim()).filter(Boolean);
            const value = button.dataset.optionValue;
            values = !value ? [] : values.includes(value) ? values.filter(v => v !== value) : [...values,value];
            input.value = values.join(', ');
            container.querySelector('.sheet-search-value').textContent = input.value || '— เลือก —';
            for (const option of container.querySelectorAll('[data-option-value]')) {
                const checked = values.includes(option.dataset.optionValue);
                option.setAttribute('aria-pressed',String(checked));
                const mark = option.querySelector('span');
                if (mark) mark.textContent = checked ? '☑' : '☐';
            }
            return;
        }
        setSearchValue(container,button.dataset.optionValue);
        // The car brand follows the chosen car model, and clears with it (— ไม่ระบุ —).
        if ('optionBrand' in button.dataset) setCarBrand(button.dataset.optionBrand);
        const menu = container.querySelector('details'); menu.open = false;
        menu.querySelector('summary').focus();
    });
    function setSearchValue(container, value) {
        container.querySelector('input[type="hidden"]').value = value;
        container.querySelector('.sheet-search-value').textContent = value || '— เลือก —';
        for (const option of container.querySelectorAll('[data-option-value]')) option.setAttribute('aria-pressed',String(option.dataset.optionValue === value));
    }
    function setCarBrand(value) {
        const field = $('editor-fields').querySelector('input[name="carBrand"]')?.closest('.sheet-auto-field');
        if (!field) return;
        field.querySelector('input[name="carBrand"]').value = value;
        field.querySelector('.sheet-auto-value').textContent = value || '—';
    }
    $('editor-fields').addEventListener('change',event => {
        if (!event.target.matches('[data-position-value]')) return;
        const container = event.target.closest('.sheet-positions-field');
        const values = [...container.querySelectorAll('[data-position-value]:checked')].map(input => input.dataset.positionValue);
        container.querySelector('[name="positions"]').value = values.join(', ');
        container.querySelector('.sheet-position-summary').textContent = values.join(', ') || 'เลือกตำแหน่งติดตั้ง';
    });
    // Lead saves that continue after the form closes: one status card each. Retrying sends the same request,
    // which the sheet API recognises by its lead key, so a retry never adds a second row.
    const backgroundSaves = new Map();
    let editorGeneration = 0;
    function saveInBackground(job, generation) {
        let stack = $('lead-save-toasts');
        if (!stack) { stack = document.createElement('div'); stack.id = 'lead-save-toasts'; stack.className = 'lead-save-toast-stack'; document.body.append(stack); }
        const card = document.createElement('div');
        card.setAttribute('role','status');
        stack.append(card);
        const label = String(job.name || '').trim() || 'ลีด';
        const run = attempt => {
            card.className = 'lead-save-toast is-pending';
            card.innerHTML = '<span class="save-spinner" aria-hidden="true"></span>กำลังบันทึก ' + esc(label) + '…';
            backgroundSaves.set(job.leadRef,card);
            attempt.then(() => {
                card.className = 'lead-save-toast';
                card.textContent = '✓ บันทึก ' + label + ' เรียบร้อยแล้ว';
                setTimeout(() => card.remove(),4000);
            },error => {
                card.className = 'lead-save-toast is-error';
                card.setAttribute('role','alert');
                const reopen = generation === editorGeneration && !$('editor').open;
                card.innerHTML = '<div>บันทึก ' + esc(label) + ' ไม่สำเร็จ: ' + esc(error.message) + '</div><div class="lead-save-toast-actions">'
                    + '<button type="button" class="lead-button" data-save-retry>ลองบันทึกซ้ำ</button>'
                    + (reopen ? '<button type="button" class="lead-button" data-save-reopen>เปิดฟอร์มเดิม</button>' : '')
                    + '<button type="button" class="lead-button" data-save-dismiss>ปิด</button></div>';
                card.querySelector('[data-save-retry]').onclick = () => run(job.commit());
                card.querySelector('[data-save-dismiss]').onclick = () => card.remove();
                const reopenButton = card.querySelector('[data-save-reopen]');
                if (reopenButton) reopenButton.onclick = () => {
                    if (generation !== editorGeneration || $('editor').open) { reopenButton.remove(); return; }
                    card.remove(); $('editor-error').textContent = error.message; $('editor').showModal();
                };
            }).finally(() => { if (backgroundSaves.get(job.leadRef) === card) backgroundSaves.delete(job.leadRef); });
        };
        run(job.done);
    }
    window.addEventListener('beforeunload',event => { if (backgroundSaves.size) { event.preventDefault(); event.returnValue = ''; } });
    $('editor-form').addEventListener('submit',async event => {
        event.preventDefault();
        if (leadsSnapshotBusy()) return;
        if ($('save-editor').disabled) return;
        const saveLabel = $('save-editor').textContent;
        $('save-editor').disabled = true;
        $('save-editor').innerHTML = '<span class="save-spinner" aria-hidden="true"></span>กำลังบันทึก…';
        $('save-editor').setAttribute('aria-live','polite');
        $('editor-form').setAttribute('aria-busy','true');
        const bookingDisabled = $('book-lead-installation').disabled, customerDisabled = $('add-lead-customer').disabled;
        $('book-lead-installation').disabled = true; $('add-lead-customer').disabled = true;
        $('close-editor').disabled = true; $('cancel-editor').disabled = true;
        $('editor-error').textContent = '';
        try {
            const formData = new FormData(event.target);
            const values = Object.fromEntries(formData);
            if (event.target.querySelector('[data-sales-multiple]')) {
                const sales = formData.getAll('admin');
                if (!sales.length) throw new Error('กรุณาเลือกฝ่ายขายอย่างน้อย 1 คน');
                values.admin = sales.join(', ');
            }
            const pending = await saveEditor(values);
            if (pending?.done && !embeddedNewLead) {
                $('editor').close();
                saveInBackground(pending,editorGeneration);
                return;
            }
            if (pending?.done) await pending.done;
            embeddedLeadSaved = true;
            $('editor').close();
            notice('บันทึกเรียบร้อยแล้ว');
            document.querySelector('.lead-save-toast')?.remove();
            const toast = document.createElement('div');
            toast.className = 'lead-save-toast';
            toast.setAttribute('role','status');
            toast.textContent = '✓ บันทึกเรียบร้อยแล้ว';
            document.body.append(toast);
            setTimeout(() => toast.remove(),4000);
        }
        catch (e) { $('editor-error').textContent = e.message; }
        finally {
            $('save-editor').textContent = saveLabel; $('save-editor').disabled = false;
            $('editor-form').removeAttribute('aria-busy');
            $('book-lead-installation').disabled = bookingDisabled; $('add-lead-customer').disabled = customerDisabled;
            $('close-editor').disabled = false; $('cancel-editor').disabled = false;
        }
    });
    $('preview-legacy').addEventListener('click',guard(async () => {
        requireSession(); $('preview-legacy').disabled = true;
        try {
            notice('กำลังอ่าน Customer และ Bookings จาก CAR CRM…');
            const result = await api('legacy-preview'); legacy = result.items; legacySources = result.sources; legacySources = result.sources;
            const existing = new Set(records.installations.map(i => i.legacyJob).filter(Boolean));
            $('legacy-count').textContent = `พบ ${legacy.length.toLocaleString('th-TH')} งาน · ยังไม่เคยนำเข้า ${legacy.filter(i => !existing.has(i.jobId)).length.toLocaleString('th-TH')} งาน`;
            $('legacy-preview').innerHTML = legacy.slice(0,100).map(i => `<article class="lead-row"><div><strong>${esc(i.customerName)}</strong><p>${esc(i.jobId)} · ${esc(i.date)} · ${esc(i.carModel)} · ${esc(i.plate)} · ${esc(i.status)}</p></div><span class="lead-badge">${existing.has(i.jobId) ? 'มีแล้ว' : 'พร้อมนำเข้า'}</span></article>`).join('') || empty('ไม่พบประวัติ');
            if (legacy.length > 100) $('legacy-preview').insertAdjacentHTML('beforeend',empty('แสดงตัวอย่าง 100 งานแรก การนำเข้าจะเก็บทุกงาน'));
            $('legacy-error').textContent = ''; $('import-legacy').disabled = !legacy.length; $('legacy-dialog').showModal(); notice('อ่านประวัติแล้ว กรุณาตรวจรายการก่อนนำเข้า');
        } finally { $('preview-legacy').disabled = false; }
    }));
    $('close-legacy').addEventListener('click',() => $('legacy-dialog').close());
    $('import-legacy').addEventListener('click',async () => {
        $('import-legacy').disabled = true;
        try { const result = await api('import-legacy',{items:legacy,sources:legacySources}); await loadRecords(); $('legacy-dialog').close(); notice(`นำเข้า ${result.added} งาน · ข้ามงานเดิม ${result.skipped} งาน`); }
        catch (e) { $('legacy-error').textContent = e.message; }
        finally { $('import-legacy').disabled = false; }
    });
    renderLeads(); renderInstallations(); renderInbox();
    window.addEventListener('hashchange',guard(async () => { await showTab(initialTab()); renderCarCrmSidebar(); }));
    void showTab(initialTab());
    async function startLead() {
        if (cloudLead) {
            $('service-form').hidden = true;
            $('signout').textContent = 'ออกจากระบบ';
            startEarlyLeads();
            // The service checks the stored sign-in on every read, so the page's reads start with the sign-in check
            // instead of after it; connect() shows nothing until the check confirms the sign-in.
            const signedIn = window.CarCrmAuth.refresh();
            const connected = connect(signedIn);
            connected.catch(() => {});
            $('current-user').textContent = 'กำลังตรวจสอบการเข้าสู่ระบบ…';
            if (!await signedIn) {
                if (embeddedNewLead) throw new Error('กรุณาเข้าสู่ระบบ CAR CRM ใหม่ แล้วกดเพิ่มข้อมูลลีดอีกครั้ง');
                location.replace('crm-login.html?next=' + encodeURIComponent('lead-data.html' + location.search + location.hash));
                return;
            }
            await connected;
        } else await connect();
        // Early reads the first load did not use (e.g. another tab was opened first) are never reused later.
        earlyLeads = null; earlyIntake = null;
    }
    startLead().catch(e => {
        if (embeddedNewLead) { postToBooking('error',{message:e.message}); return; }
        if (e.carLeadReadHandled) return;
        void showTab('connection'); notice(e.message,true);
    });
})();



