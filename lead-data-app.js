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
    let contactPage = 0, sheetLeads = [], leadsFromSnapshot = false;
    const followUpStatuses = ['สอบถามใหม่','เลื่อนติดตั้ง','ติดตามผล / รอตัดสินใจ'];
    const followUpAlertDays = 2;
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
        const now=Date.now();
        const statuses = [...new Set(sheetLeads.filter(lead => tab !== 'followups' || isFollowUp(lead) && !isFollowUpUpdatedToday(lead,now)).map(lead => lead.status))];
        $('lead-status').innerHTML = '<option value="">ทุกสถานะ</option>' + statuses.map(value => '<option value="' + esc(value) + '">' + esc(value) + '</option>').join('');
        if (statuses.includes(previousStatus)) $('lead-status').value = previousStatus;
    }
    let records = { leads: [], installations: [] }, saveEditor, legacy = [], legacySources = null, request = 0, connection = 0;
    let leadEditorSnapshot = '', leadEditorHistoryChanged = false;
    let savedLeadRevision = 0;
    let accessKey = sessionStorage.getItem('carLeadAccessKey') || '';
    let rangeMode = '7', rangeStart = '', rangeEnd = '';
    let inboxSource = 'webhook', inboxLoading = false, inboxIncomplete = false, lineProfilesConfigured;
    let instagramError = null;
    let sheetContacts = [], sheetChecked = false, recordsLoaded = false;
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
        sheetChecked = true;
        renderInbox();
    }
    function existsInLeadSheet(row, lead) {
        const normalize = value => String(value || '').trim().toLowerCase();
        const channel = tab === 'instagram' ? 'ig' : tab === 'line' ? 'line' : 'fb';
        const candidates = [row.display_name,tab === 'instagram' ? row.instagram_user_id : tab === 'line' ? row.line_user_id : row.facebook_user_id,lead?.sheetData?.contact].map(normalize).filter(Boolean);
        return sheetChecked && sheetContacts.some(entry => (normalize(entry.channel) === channel || channel === 'fb' && normalize(entry.channel) === 'facebook' || channel === 'ig' && normalize(entry.channel) === 'instagram') && candidates.includes(normalize(entry.contact)));
    }
    let service = localStorage.getItem('carLeadServiceUrl') || (/^https?:$/.test(location.protocol) ? location.origin : 'http://127.0.0.1:3092');
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
    function guard(fn) { return async event => { try { await fn(event); } catch (e) { notice(e.message, true); } }; }
    function requireSession() { if (!session) throw new Error('ยังไม่ได้เชื่อมต่อระบบรับข้อมูล CAR กรุณาตรวจการตั้งค่าฝั่งเซิร์ฟเวอร์'); }
    function resetRecords() {
        formOptions.clear(); sheetContactCache.clear(); inboxLoader.clear(); editorOpenRequest++;
        sheetContacts = []; sheetChecked = false; recordsLoaded = false; inboxLoading = false; inboxIncomplete = false;
        lineProfilesConfigured = undefined;
        instagramError = null;
        sheetLeads = []; leadsFromSnapshot = false; request++; records = { leads: [], installations: [] }; contacts = []; legacy = []; legacySources = null; session = null;
        $('current-user').textContent = 'ยังไม่ได้เชื่อมต่อระบบลีด'; $('signout').hidden = true;
        $('editor').close(); $('legacy-dialog').close(); renderLeads(); renderInstallations(); renderInbox();
    }
    async function connect() {
        const attempt = ++connection;
        resetRecords();
        // Both reads are independent: start the session check while configuration loads.
        const sessionRequest = api('session');
        sessionRequest.catch(() => {});
        settings = await api('config');
        if (attempt !== connection) return;
        $('instagram-connection').textContent = settings.instagramConfigured ? `Instagram: @${settings.instagramUsername} · ตรวจสิทธิ์อ่านแชตเมื่อเปิดแท็บ` : 'Instagram: รอตั้งค่าเชื่อมต่อบัญชี CAR';
        $('facebook-connection').textContent = settings.facebookAccount ? `Facebook: ${settings.facebookAccount}` : 'Facebook: ยังไม่ได้ระบุเพจ CAR';
        $('line-connection').textContent = settings.lineConfigured ? 'LINE: รถยนต์ @maholan · ตั้งค่ารับข้อมูลแล้ว' : 'LINE: รถยนต์ @maholan · รอตั้งค่า webhook CAR';
        $('access-label').hidden = settings.local || cloudLead;
        $('service-form').hidden = cloudLead;
        session = await sessionRequest;
        if (attempt !== connection) return;
        $('current-user').textContent = session.name; $('signout').hidden = session.mode === 'local';
        const entryUrl = new URL(location.href);
        if (entryUrl.searchParams.get('newLead') === '1' && initialTab() === 'leads') {
            entryUrl.searchParams.delete('newLead');
            history.replaceState(null,'',entryUrl.pathname + entryUrl.search + entryUrl.hash);
            await Promise.all([showTab('leads'),editLead()]);
            return;
        }
        const entryTab = initialTab();
        if (['line','facebook','instagram'].includes(entryTab)) await Promise.all([loadRecords(true),showTab(entryTab)]);
        else await showTab(entryTab);
    }
    async function loadInstallationDates() {
        const response = await fetch('https://docs.google.com/spreadsheets/d/1u__xYWoWZpmrnquc-Fpk19WtpcrckxSd0-_G35NWxXQ/gviz/tq?tqx=out:csv&sheet=Bookings&tq=' + encodeURIComponent('select A,B,D,T'), {cache:'no-store',signal:AbortSignal.timeout(15000)});
        if (!response.ok) throw new Error('โหลดวันนัดไม่สำเร็จ');
        const rows = core.csv(await response.text()), dates = new Map();
        if (rows.length && !Object.hasOwn(rows[0],'CustID')) throw new Error('หัวตารางคิวนัดไม่ตรง');
        for (const row of rows) {
            if (!row.JobID || !row.CustID) continue;
            const raw = String(row['วันที่ติดตั้ง'] || '').trim();
            const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(raw);
            let date = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0,10) : '';
            if (match) { let year=Number(match[3]); if(year>2400)year-=543;else if(year<100)year+=year>=40?1957:2000; date=year+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0'); }
            const validDate = date && Number.isFinite(Date.parse(date));
            const label = validDate ? new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'2-digit'}).format(new Date(date+'T00:00:00+07:00')) : raw || 'ยังไม่ระบุวัน';
            const id=String(row.CustID).trim(); if(!dates.has(id))dates.set(id,[]);
            dates.get(id).push({jobId:row.JobID,date:validDate ? date : '',label,status:row.Status || '',cancelled:/ยกเลิก|cancel/i.test(row.Status || '')});
        }
        for (const items of dates.values()) items.sort((a,b) => b.date.localeCompare(a.date) || a.jobId.localeCompare(b.jobId));
        return dates;
    }
    function renderInstallationDates(value) {
        const content = Array.isArray(value) ? value.map(item => '<span class="contact-installation-date' + (item.cancelled ? ' cancelled' : '') + '" title="' + esc(item.jobId + (item.status ? ' · ' + item.status : '')) + '">' + esc(item.label) + (item.cancelled ? ' · ยกเลิก' : '') + '</span>').join('') : esc(value || '—');
        return '<div class="contact-report-field contact-installation-dates" aria-label="วันที่นัดติดตั้ง">' + content + '</div>';
    }
    async function loadRecords(intake = ['line','facebook','instagram'].includes(tab), {reportErrors = false} = {}) {
        const currentSession = session, currentService = service, currentRevision = savedLeadRevision;
        const isCurrent = () => session === currentSession && service === currentService && currentRevision === savedLeadRevision;
        const stored = !intake && !sheetLeads.length ? readLeadsSnapshot() : null;
        if (stored && stored.length) {
            // Paint the last complete list at once; it stays view-only until the fresh read replaces it.
            leadsFromSnapshot = true;
            sheetLeads = stored.map(lead => ({...lead,status:customerFollowUp(lead),installationDate:lead.customerId ? 'กำลังโหลด…' : '—'}));
            renderStatusOptions(); renderLeads();
            notice('แสดงรายการล่าสุดที่โหลดไว้ · กำลังอัปเดต…');
        }
        let result;
        try { result = await api(intake ? 'records?scope=intake' : 'records'); }
        catch (error) { if (!isCurrent()) return; dropLeadsSnapshotView(); throw error; }
        if (!isCurrent()) return;
        records = result; recordsLoaded = true; renderInstallations(); renderInbox();
        if (intake) {
            void (result.sheetLeads ? Promise.resolve({leads:result.sheetLeads}) : api('sheet-leads')).then(sheet => {
                if(isCurrent()) updateFollowUpCount(sheet.leads);
            }).catch(() => { if(isCurrent()) updateFollowUpCount(null); });
            return;
        }
        try { const sheet = result.sheetLeads ? {leads:result.sheetLeads} : await api('sheet-leads'); if (!isCurrent()) return; sheetLeads=sheet.leads.map(lead => ({...lead,status:customerFollowUp(lead)}));
            writeLeadsSnapshot(sheet.leads);
            if (leadsFromSnapshot) { leadsFromSnapshot = false; notice(''); }
            renderStatusOptions();
            sheetLeads.forEach(lead => { lead.installationDate = lead.customerId ? 'กำลังโหลด…' : '—'; });
            renderLeads();
            try { const dates = await loadInstallationDates(); if(!isCurrent()) return; sheetLeads.forEach(lead => { lead.installationDate = dates.get(lead.customerId) || '—'; }); }
            catch { if(!isCurrent()) return; sheetLeads.forEach(lead => { lead.installationDate = lead.customerId ? 'โหลดไม่สำเร็จ' : '—'; }); }
            renderLeads(); }
        catch(e) { if(!isCurrent()) return; if (leadsFromSnapshot) dropLeadsSnapshotView(); if(reportErrors) throw e; sheetLeads=[]; renderLeads(); updateFollowUpCount(null); notice('โหลดชีต lead ไม่สำเร็จ: '+e.message,true); }
    }
    // A failed refresh returns to the previous behaviour: no unverified list is left on screen.
    function dropLeadsSnapshotView() {
        if (!leadsFromSnapshot) return;
        leadsFromSnapshot = false; sheetLeads = []; renderLeads();
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
        ['account-label','range-buttons'].forEach(id => { $(id).hidden = !inbox; });
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
            $('account-label').textContent = next === 'line' ? 'Line OA : @maholan ↗' : 'FB : MHLcarfilm ↗';
            $('account-label').href = next === 'line' ? 'https://chat.line.biz/U49f59e2c0f09f7633b5404b0a9918d51' : 'https://business.facebook.com/latest/inbox/all?asset_id=109607531869658&business_id=337743700122129&nav_ref=bm_more_tools_header&selected_item_id=1130558699&mailbox_id=109607531869658&biz_login_source=biz_unified_f3_fb_login_button&join_id=d717b3c6-3747-4ccb-82ae-27e41218904c&thread_type=FB_MESSAGE';
            if (next === 'instagram') {
                $('account-label').textContent = `Instagram : @${settings?.instagramUsername || 'mhlcarfilm'} ↗`;
                $('account-label').href = `https://www.instagram.com/${encodeURIComponent(settings?.instagramUsername || 'mhlcarfilm')}/`;
            }
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
        try { Object.keys(sessionStorage).filter(key => key.startsWith('carLeadInbox:') || key === LEADS_SNAPSHOT_KEY).forEach(key => sessionStorage.removeItem(key)); } catch {}
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
        const summaryPeriod = ({today:'วันนี้','7':'7 วันล่าสุด','15':'15 วันล่าสุด',month:'เดือนนี้',year:'ปีนี้'})[rangeMode] || `${rangeStart} – ${rangeEnd}`;
        const progressLabel = inboxLoading ? ' · กำลังโหลด สถิติยังไม่ครบ' : inboxIncomplete ? ' · อัปเดตข้อมูลยังไม่ครบ' : '';
        const selectionReady = sheetChecked && recordsLoaded;
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
                const savedInSheet = existsInLeadSheet(row,selected);
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
    function isFollowUpUpdatedToday(lead, now = Date.now()) {
        const {at}=latestContactTimestamp(lead,now);
        return Number.isFinite(at) && new Date(at+7*3600000).toISOString().slice(0,10) === new Date(now+7*3600000).toISOString().slice(0,10);
    }
    function renderFollowUpUpdated(lead) {
        const {at,fromHistory}=latestContactTimestamp(lead);
        const valid=Number.isFinite(at);
        const value=valid ? new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(at)) : '—';
        const title=valid ? (fromHistory ? 'วันที่บันทึกประวัติการติดต่อล่าสุด' : 'วันที่บันทึกลีดครั้งแรก · ยังไม่มีประวัติการอัปเดต') + ' · ' + value : 'ยังไม่มีวันที่อัปเดต';
        return `<div class="contact-report-field" aria-label="อัปเดตล่าสุด"><span class="contact-inline-detail" title="${esc(title)}">${esc(value)}</span></div>`;
    }
    function defaultReminderDate(lead, now = Date.now()) {
        const latest=latestContactTimestamp(lead,now).at;
        return new Date((Number.isFinite(latest) ? latest : now) + 7*3600000 + followUpAlertDays*86400000).toISOString().slice(0,10);
    }
    function followUpAge(lead, now = Date.now()) {
        const {at:latest,fromHistory}=latestContactTimestamp(lead,now);
        const note=window.CarLeadSheet.splitHistory(lead.sheetData?.note || lead.note || '').note;
        const reminderDate=lead.sheetData?.reminderDate || window.CarLeadSheet.splitReminder(note).reminderDate;
        const explicit=window.CarLeadSheet.validReminderDate(reminderDate);
        const overdue=isFollowUp(lead)&&(explicit ? now>=contactTimestamp(reminderDate) : Number.isFinite(latest)&&now-latest>followUpAlertDays*86400000);
        const format=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'});
        const updated=Number.isFinite(latest) ? (fromHistory?'อัปเดตล่าสุด ':'อ้างอิงวันที่ลีด ') + format.format(new Date(latest)) : 'ไม่มีวันที่สำหรับตรวจการติดตาม';
        const label=explicit ? 'วันที่แจ้งเตือน ' + new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'short'}).format(new Date(contactTimestamp(reminderDate))) + ' · ' + updated : updated;
        return {overdue,label};
    }
    function updateFollowUpCount(leads, now = Date.now()) {
        const badge=$('followup-tab-count');
        if (!badge) return;
        if (!leads || !session) { badge.textContent='—'; badge.title='ยังโหลดจำนวนงานไม่สำเร็จ'; return; }
        const count=leads.filter(lead => !isFollowUpUpdatedToday(lead,now) && followUpAge(lead,now).overdue).length;
        badge.textContent=count.toLocaleString('th-TH');
        badge.title='งานที่ถึงวันที่แจ้งเตือนแล้ว '+count+' รายการ';
        badge.setAttribute('aria-label',badge.title);
    }
    function renderLeads() {
        const now=Date.now();
        updateFollowUpCount(sheetLeads,now);
        const query = $('lead-search').value.trim().toLowerCase(), status = $('lead-status').value;
        const list = sheetLeads.filter(l => (tab !== 'followups' || isFollowUp(l) && !isFollowUpUpdatedToday(l,now)) && (!status || l.status === status) && [l.name,l.phone,l.salesperson,l.sheetData?.contact,l.sheetData?.admin].join(' ').toLowerCase().includes(query))
            .sort((a,b) => (tab === 'followups' ? -1 : 1) * (contactDate(b).localeCompare(contactDate(a))
                || String(b.sheetData?.time || '00:00:00').padStart(8,'0').localeCompare(String(a.sheetData?.time || '00:00:00').padStart(8,'0'))
                || (Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0)
                || Number(String(b.id).replace('sheet-lead:',''))-Number(String(a.id).replace('sheet-lead:',''))
                || String(b.id).localeCompare(String(a.id))));
        const pageSize = 50, dailySummary = new Map();
        // Cancelled leads are absent from the follow-up list; its summary covers the entire day.
        const summaryLeads = tab === 'followups' ? sheetLeads : list;
        summaryLeads.forEach(lead => {
            const date = contactDate(lead);
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
        const groups = new Map();
        visible.forEach((l,index) => { const date=contactDate(l); if (!groups.has(date)) groups.set(date,[]); groups.get(date).push({l,index:offset+index+1}); });
        $('lead-list').innerHTML = [...groups].map(([date,items]) => {
            const label = date ? new Date(date+'T12:00:00+07:00').toLocaleDateString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'long',year:'numeric'}) : 'ไม่ระบุวันที่';
            const {total,successful,unsuccessful} = dailySummary.get(date);
            const outcomeLabel = tab === 'followups' ? 'ไม่สำเร็จ' : 'สำเร็จ';
            const outcomeCount = tab === 'followups' ? unsuccessful : successful;
            const outcomeRate = (total ? outcomeCount/total*100 : 0).toLocaleString('th-TH',{maximumFractionDigits:1});
            const summaryTitle = tab === 'followups' ? 'สถานะยกเลิกทุกประเภท ÷ Lead ทั้งหมดของวัน × 100 รวมรายการที่ไม่ได้แสดงในหน้าติดตาม' : 'ปิดการขายสำเร็จและมัดจำ/นัดติดตั้งแล้ว ÷ Lead ทั้งหมดของวันตามตัวกรอง × 100';
            return `<section class="contact-day-group"><h3 class="contact-day-heading"><span class="contact-day-dot"></span><time datetime="${esc(date)}">${esc(label)}</time><span title="${esc(summaryTitle)}">${date ? 'วันนี้' : 'ไม่ระบุวันที่'} ${total.toLocaleString('th-TH')} รายการ · ${outcomeLabel} ${outcomeCount.toLocaleString('th-TH')} รายการ · คิดเป็น ${outcomeRate}%</span></h3><div class="contact-day-track">${items.map(({l,index}) => {
                const data=l.sheetData||{}, createdDay=day(l.createdAt);
                const age=followUpAge(l);
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
                return `<article class="contact-timeline-item${age.overdue ? ' followup-overdue' : ''}" title="${esc(age.overdue ? 'ต้องติดตาม · '+age.label : age.label)}" data-lead-details="${esc(l.id)}" tabindex="0" aria-label="รายละเอียด ${esc(l.name || 'ผู้ติดต่อ')}"><div class="contact-time"><span>${esc(time)}</span><small>#${index}</small></div><div class="contact-timeline-card">${columns.map(([label,value],i)=>label === 'วันที่นัดติดตั้ง' ? renderInstallationDates(value) : `<div class="contact-report-field ${label === 'สถานะการติดตาม' ? 'contact-status-with-count' : ''}" aria-label="${esc(label)}">${label === 'สถานะการติดตาม' ? `<span class="contact-history-count ${Number(l.historyCount ?? 0) === 0 ? 'is-zero' : ''}" title="ประวัติการติดต่อ ${l.historyCount ?? 0} รายการ" aria-label="ประวัติการติดต่อ ${l.historyCount ?? 0} รายการ">${l.historyCount ?? 0}</span>` : ''}<${i===0?'strong':'span'} class="${i===0?'contact-inline-name':label==='สถานะการติดตาม'?'lead-badge':'contact-inline-detail'}" title="${esc(value)}">${esc(value)}</${i===0?'strong':'span'}></div>`).join('')}${tab === 'followups' ? renderFollowUpUpdated(l) : ''}<button class="lead-button ${l.isCustomer ? 'existing-customer' : ''}" data-lead="${esc(l.id)}" ${l.isCustomer || l.pendingCustomerCheck ? 'disabled' : ''}>${l.isCustomer ? 'ลูกค้า' : l.pendingCustomerCheck ? 'กำลังตรวจข้อมูลลูกค้า' : 'เพิ่มข้อมูลลูกค้า'}</button></div></article>`;


            }).join('')}</div></section>`;
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
    const sheetLabels = {admin:'ฝ่ายขาย',contact:'ชื่อช่องทางติดต่อ',positions:'ตำแหน่งติดตั้ง',filmBrand:'ยี่ห้อฟิล์ม',filmModel:'รุ่นฟิล์ม',knownFrom:'รู้จักเราจาก',note:'หมายเหตุ'};
    function sheetSections(renderField, leadId = '', customerId = '') {
        return [
            ['01','ข้อมูลผู้ติดต่อ',['name','date','phone','channel','admin','contact','customerType','knownFrom']],
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
        if (sheetChecked && data.contact) {
            const sameContact = item => String(item.channel).trim().toLowerCase() === data.channel.toLowerCase()
                && String(item.contact).trim().toLowerCase() === data.contact.toLowerCase();
            sheetContacts = [...sheetContacts.filter(item => !sameContact(item)),{channel:data.channel,contact:data.contact}];
        }
        renderStatusOptions(); renderLeads(); renderInbox();
    }
    function refreshAfterLeadSave(saved) {
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
        $('book-lead-installation').hidden = true;
        $('book-lead-installation').onclick = null;
        $('editor-title').textContent = title; $('editor-fields').innerHTML = html; $('editor-error').textContent = '';
        const sheetForm = html.includes('sheet-form-section');
        $('editor').classList.toggle('sheet-editor', sheetForm);
        $('cancel-editor').textContent = save ? 'ยกเลิก' : 'ปิด';
        $('save-editor').textContent = sheetForm ? 'บันทึกข้อมูล' : 'บันทึก';
        saveEditor = save; $('editor').showModal();
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
        location.href = 'customer-data.html?bookingCustomer=' + encodeURIComponent(customerId);
    }
    async function editLead(lead = {}, contact = null) {
        requireSession();
        const openRequest = ++editorOpenRequest;
        const platform = contact ? tab : lead.source?.platform;
        const isNewLead = platform !== 'sheet-lead' && !lead.id && !lead.leadId && !lead.sheetKey && !lead.sheetSavedAt;
        const source = contact ? {platform,account,userId:platform === 'instagram' ? contact.instagram_user_id : platform === 'line' ? contact.line_user_id : contact.facebook_user_id,displayName:contact.display_name} : lead.source;
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
        const placeholders = {admin:'ชื่อฝ่ายขาย',name:'ชื่อ-นามสกุล',contact:'ชื่อโปรไฟล์ เช่น Weerachon',phone:'เบอร์โทรศัพท์',carBrand:'เช่น Toyota',carModel:'เช่น Vios',positions:'เช่น เต็มคัน, ซันรูฟ',filmBrand:'ยี่ห้อที่สนใจ',filmModel:'รุ่นที่สนใจ',budget:'เช่น 3,200',knownFrom:'เช่น Facebook',note:'รายละเอียดเพิ่มเติม / สิ่งที่ต้องติดตาม'};
        const renderField = name => {
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
                if (['carBrand','carModel','filmBrand','filmModel'].includes(name)) {
                    return `<div class="sheet-search-field" data-multiple="${multiple}"><span class="sheet-control-label">${esc(labels[name] || label)}</span><input type="hidden" name="${esc(name)}" value="${esc(value)}"><details class="sheet-search-menu"><summary><span class="sheet-search-value">${esc(value || '— เลือก —')}</span><span aria-hidden="true">⌄</span></summary><div class="sheet-search-panel"><input type="search" class="sheet-option-search" placeholder="พิมพ์ค้นหา..." aria-label="ค้นหา${esc(labels[name] || label)}" autocomplete="off"><div class="sheet-search-options">${['',...choices].map(option => `<button type="button" class="sheet-search-option" data-option-value="${esc(option)}" aria-pressed="${selected.includes(option)}">${multiple && option ? `<span aria-hidden="true">${selected.includes(option) ? '☑' : '☐'}</span> ` : ''}${esc(option || '— ไม่ระบุ —')}</button>`).join('')}</div><small class="sheet-search-empty" hidden>ไม่พบรายการที่ค้นหา</small></div></details></div>`;
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
        const reminderDate = window.CarLeadSheet.validReminderDate(storedReminderDate) ? storedReminderDate : defaultReminderDate({...lead,contactHistory});
        const reminderField = '<label>วันที่แจ้งเตือน<input id="history-reminder-date" name="reminderDate" type="date" value="' + esc(reminderDate) + '" required aria-describedby="history-reminder-hint"></label>';
        const contactDetails = '<div class="sheet-main-column" role="region" aria-label="รายละเอียดข้อมูลผู้ติดต่อ" tabindex="0">' + sheetSections(renderField, lead.leadId || '', lead.customerId || '') + '</div>';
        const html = contactDetails +
            '<div class="sheet-side-column" role="region" aria-label="สถานะและประวัติการติดต่อ" tabindex="0"><section class="sheet-status-card"><div class="sheet-section-grid">' + renderField('followUp') + '</div></section><aside class="sheet-history-card"><h3>ประวัติการติดต่อ</h3><div class="history-meta-row"><label>ผู้บันทึก<select id="history-by"><option value="">— เลือก —</option>' + (lists['พนักงานขาย'] || []).map(value => '<option>' + esc(value) + '</option>').join('') + '</select></label>' + reminderField + '</div><small id="history-reminder-hint">ค่าเริ่มต้น 2 วันหลังการติดต่อล่าสุด · เลือกวันเองได้</small><label>รายละเอียด<textarea id="history-text" rows="3" placeholder="บันทึกการติดต่อ..."></textarea></label><button type="button" class="lead-button primary" id="add-contact-history">+ เพิ่มประวัติ</button><small>บันทึกพร้อมข้อมูลลูกค้า</small><p id="history-error" role="alert"></p><div id="contact-history-list"></div></aside></div>';
        editor('เก็บข้อมูลผู้ติดต่อ', html, async values => {
            values.phone = formatLeadPhone(values.phone);
            if (values.phone && !/^\d{3}-\d{3}-\d{4}$/.test(values.phone)) throw new Error('กรุณากรอกเบอร์โทร 10 หลัก รูปแบบ xxx-xxx-xxxx');
            if ($('history-text').value.trim()) throw new Error('กรุณากดเพิ่มประวัติก่อนบันทึก หรือเคลียร์ข้อความประวัติที่ยังไม่ได้เพิ่ม');
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
            values.deletedContactHistory = removedHistory.filter(item => savedHistory.has(String(item.id))).map(item => ({...savedHistory.get(String(item.id))}));
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
        });
        const phoneInput = $('editor-fields').querySelector('[name="phone"]');
        phoneInput.value = formatLeadPhone(phoneInput.value);
        phoneInput.addEventListener('input',() => {
            const formatted = formatLeadPhone(phoneInput.value);
            if (formatted !== phoneInput.value) phoneInput.value = formatted;
        });
        phoneInput.addEventListener('blur',() => { phoneInput.value = formatLeadPhone(phoneInput.value); });
        const bookingHistory = document.createElement('div');
        bookingHistory.className = 'booking-history-list';
        $('contact-history-list').after(bookingHistory);
        if (lead.customerId) {
            bookingHistory.innerHTML = '<p class="lead-muted">กำลังโหลดคิวนัด…</p>';
            (async () => {
                try {
                    const query = 'select A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T';
                    const response = await fetch('https://docs.google.com/spreadsheets/d/1u__xYWoWZpmrnquc-Fpk19WtpcrckxSd0-_G35NWxXQ/gviz/tq?tqx=out:csv&sheet=Bookings&tq=' + encodeURIComponent(query), {cache:'no-store',signal:AbortSignal.timeout(30000)});
                    if (!response.ok) throw new Error('โหลดคิวนัดไม่สำเร็จ');
                    const rows = core.csv(await response.text());
                    if (rows.length && (!Object.hasOwn(rows[0],'CustID') || !Object.hasOwn(rows[0],'JobID'))) throw new Error('หัวตารางคิวนัดไม่ตรง');
                    const appointments = rows.filter(row => String(row.CustID || '').trim() === String(lead.customerId).trim() && row.JobID);
                    const appointmentOrder = row => {
                        const date = inputDate(String(row['วันที่ติดตั้ง'] || '').trim());
                        return date ? date + 'T' + (inputTime(String(row['เวลานัด'] || '').trim()) || '00:00') : '';
                    };
                    appointments.sort((a,b) => appointmentOrder(b).localeCompare(appointmentOrder(a)));
                    bookingHistory.innerHTML = '<h4>คิวนัด (' + appointments.length + ')</h4>' + (appointments.map(row => {
                        const details = [row['รุ่นรถยนต์'],row['ทะเบียนรถ'],row['ยี่ห้อฟิล์ม'],row['ตำแหน่งติดตั้ง']].filter(Boolean).join(' · ');
                        return '<article class="contact-history-entry booking-history-entry' + (/ยกเลิก|cancel/i.test(row.Status || '') ? ' cancelled' : '') + '"><div class="contact-history-header"><time>' + esc(row['วันที่ติดตั้ง'] || 'ยังไม่ระบุวัน') + ' ' + esc(row['เวลานัด'] || '') + '</time><span>' + esc(row['พน.ขาย'] || '') + '</span></div><p><strong>คิวนัด ' + esc(row.JobID) + '</strong></p><p>' + esc(details) + '</p><p class="booking-history-status">' + esc(row.Status || 'ยังไม่ระบุสถานะ') + '</p></article>';
                    }).join('') || '<p class="lead-muted">ยังไม่มีคิวนัด</p>');
                } catch {
                    bookingHistory.innerHTML = '<p role="alert" class="lead-muted">โหลดคิวนัดไม่สำเร็จ กรุณาปิดแล้วเปิดรายละเอียดอีกครั้ง</p>';
                }
            })();
        }
        const renderHistory = () => {
            const entries = contactHistory.map((item,index) => ({item,index})).sort((a,b) => String(b.item.at).localeCompare(String(a.item.at))).map(({item,index}) => '<article class="contact-history-entry"><div class="contact-history-header"><time>' + esc(String(item.at).replace('T',' ')) + '</time><div class="contact-history-actions"><span>' + esc(item.by) + '</span><button type="button" class="contact-history-delete" data-delete-history="' + index + '" aria-label="ลบประวัติ ' + esc(String(item.at).replace('T',' ')) + '">ลบ</button></div></div><p>' + esc(item.text) + '</p></article>').join('');
            const removed = removedHistory.map((item,index) => '<div class="contact-history-pending"><span>รอลบ: ' + esc(item.text) + '</span><button type="button" class="contact-history-undo" data-restore-history="' + index + '">คืนค่า</button></div>').join('');
            $('contact-history-list').innerHTML = (entries || '<p class="lead-muted">ยังไม่มีประวัติ</p>') + removed;
        };
        let customReminder = window.CarLeadSheet.validReminderDate(storedReminderDate);
        $('history-reminder-date').addEventListener('input',() => { customReminder = true; });
        const updateDefaultReminder = now => {
            if (!customReminder) $('history-reminder-date').value = new Date(now + 7*3600000 + followUpAlertDays*86400000).toISOString().slice(0,10);
        };
        $('contact-history-list').onclick = event => {
            if ($('editor-form').getAttribute('aria-busy') === 'true') return;
            const remove = event.target.closest('[data-delete-history]');
            const restore = event.target.closest('[data-restore-history]');
            if (!remove && !restore) return;
            const list = remove ? contactHistory : removedHistory;
            const index = Number(remove ? remove.dataset.deleteHistory : restore.dataset.restoreHistory);
            if (!Number.isInteger(index) || index < 0 || index >= list.length) return;
            const [item] = list.splice(index,1);
            (remove ? removedHistory : contactHistory).push(item);
            leadEditorHistoryChanged = true;
            if (!customReminder) $('history-reminder-date').value = defaultReminderDate({...lead,note:previous.note,sheetData:{...lead.sheetData,note:previous.note},contactHistory});
            $('history-error').textContent = remove ? 'ลบแล้ว · รอกดบันทึกข้อมูล' : 'คืนค่าประวัติแล้ว · รอกดบันทึกข้อมูล';
            renderHistory();
        };
        renderHistory();
        $('add-contact-history').onclick = () => {
            const by=$('history-by').value, text=$('history-text').value.trim();
            if (!by || !text) { $('history-error').textContent='กรุณาระบุผู้บันทึก และรายละเอียด'; return; }
            const now=Date.now(), at=new Date(now+7*3600000).toISOString().slice(0,19);
            updateDefaultReminder(now);
            contactHistory.push({id:crypto.randomUUID(),at,by,text});
            leadEditorHistoryChanged = true;
            $('history-text').value=''; $('history-error').textContent='เพิ่มแล้ว · รอกดบันทึกข้อมูล'; renderHistory();
        };
        const bookingButton = $('book-lead-installation');
        bookingButton.hidden = false;
        bookingButton.disabled = !String(lead.customerId || '').trim();
        bookingButton.title = bookingButton.disabled ? 'เพิ่มข้อมูลลูกค้าก่อนนัดคิวติดตั้ง' : 'เปิดฟอร์มนัดคิวติดตั้งสำหรับลูกค้ารายนี้';
        bookingButton.onclick = () => openBookingFromLead(lead);
        leadEditorHistoryChanged = false;
        leadEditorSnapshot = getLeadEditorSnapshot();
        if (platform === 'sheet-lead') {
            $('editor-title').textContent = 'แก้ไขข้อมูลจากชีต lead';
            $('save-editor').textContent = 'บันทึกการแก้ไข';
        }
        return true;
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
        if (mode === '7' || mode === '15') date.setUTCDate(date.getUTCDate()-Number(mode)+1);
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
    setRange('7');
    $('inbox-date').value = day(new Date());
    $('inbox-date').addEventListener('change',guard(loadInbox)); $('inbox-filter').addEventListener('change',renderInbox);
    $('previous-page').addEventListener('click',guard(async () => { page = Math.max(0,page-1); renderInbox(); }));
    $('next-page').addEventListener('click',guard(async () => { page++; renderInbox(); }));
    $('inbox-list').addEventListener('click',guard(async event => {
        const button = event.target.closest('[data-contact]'); if (!button || button.disabled) return;
        const row = contacts.find(c => c.id === button.dataset.contact && day(c.last_seen_at) === button.dataset.contactDay); const lead = selectedLead(row);
        const label = button.textContent;
        button.disabled = true; button.textContent = 'กำลังเปิด…'; button.setAttribute('aria-busy','true');
        try { await editLead(lead || {},lead ? null : row); }
        finally { button.disabled = false; button.textContent = label; button.removeAttribute('aria-busy'); }
    }));
    $('lead-search').addEventListener('input',() => { contactPage=0; renderLeads(); }); $('lead-status').addEventListener('change',() => { contactPage=0; renderLeads(); });
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
        notice('กำลังอัปเดตรายการล่าสุด กรุณารอสักครู่แล้วลองอีกครั้ง');
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
            if (!lead || lead.isCustomer || lead.pendingCustomerCheck || edit.disabled) return;
            const draft = {...lead.sheetData,note:window.CarLeadSheet.splitReminder(window.CarLeadSheet.splitHistory(lead.sheetData?.note).note).note};
            sessionStorage.setItem('carLeadCustomerDraft',JSON.stringify({createdAt:Date.now(),data:draft}));
            location.href = 'customer-data.html?fromLead=1';
            return;
        }
        const details = event.target.closest('[data-lead-details]');
        if (details && !install) await showLeadDetails(details.dataset.leadDetails);
        if (install) editInstallation({},install.dataset.installLead);
    }));
    $('installation-list').addEventListener('click',guard(event => { const button = event.target.closest('[data-installation]'); if (button) editInstallation(records.installations.find(i => i.id === button.dataset.installation)); }));
    $('editor').addEventListener('cancel',event => { if ($('editor-form').getAttribute('aria-busy') === 'true') event.preventDefault(); });
    for (const id of ['close-editor','cancel-editor']) $(id).addEventListener('click',() => $('editor').close());
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
        container.querySelector('input[type="hidden"]').value = button.dataset.optionValue;
        container.querySelector('.sheet-search-value').textContent = button.dataset.optionValue || '— เลือก —';
        for (const option of container.querySelectorAll('[data-option-value]')) option.setAttribute('aria-pressed',String(option === button));
        const menu = container.querySelector('details'); menu.open = false;
        menu.querySelector('summary').focus();
    });
    $('editor-fields').addEventListener('change',event => {
        if (!event.target.matches('[data-position-value]')) return;
        const container = event.target.closest('.sheet-positions-field');
        const values = [...container.querySelectorAll('[data-position-value]:checked')].map(input => input.dataset.positionValue);
        container.querySelector('[name="positions"]').value = values.join(', ');
        container.querySelector('.sheet-position-summary').textContent = values.join(', ') || 'เลือกตำแหน่งติดตั้ง';
    });
    $('editor-form').addEventListener('submit',async event => {
        event.preventDefault();
        if ($('save-editor').disabled) return;
        const saveLabel = $('save-editor').textContent;
        $('save-editor').disabled = true;
        $('save-editor').innerHTML = '<span class="save-spinner" aria-hidden="true"></span>กำลังบันทึก…';
        $('save-editor').setAttribute('aria-live','polite');
        $('editor-form').setAttribute('aria-busy','true');
        const bookingDisabled = $('book-lead-installation').disabled;
        $('book-lead-installation').disabled = true;
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
            await saveEditor(values);
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
            $('book-lead-installation').disabled = bookingDisabled;
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
            $('current-user').textContent = 'กำลังตรวจสอบการเข้าสู่ระบบ…';
            if (!await window.CarCrmAuth.refresh()) {
                location.replace('crm-login.html?next=' + encodeURIComponent('lead-data.html' + location.search + location.hash));
                return;
            }
        }
        await connect();
    }
    startLead().catch(e => { void showTab('connection'); notice(e.message,true); });
})();



