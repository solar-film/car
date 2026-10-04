(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OverviewMemoManager = api;
})(typeof window === 'object' ? window : this, function () {
    'use strict';

    const ENDPOINT = 'https://script.google.com/macros/s/AKfycbwH0Vw5qzVO3YDsibqi_EF8KScpL5e0-wp8mYXxgqSj_3wjqH8QG5CyFOse4-Q18o3Rgg/exec';
    const TOKEN_KEY = 'carCrmWriteToken';
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const dateInput = date => date && !Number.isNaN(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '';
    const same = (a, b) => a.title === b.title && a.active === b.active && dateInput(a.date) === dateInput(b.date);

    function validateRecords(records) {
        const ids = records.map(item => item.recordId);
        if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('พบรหัสแจ้งเตือนว่างหรือซ้ำ กรุณาตรวจสอบชีต memo ก่อนแก้ไข');
    }

    function createService({ load, post, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
        let pending = null;
        let busy = false;

        async function verify() {
            for (const delay of [0, 500, 1500, 3000]) {
                if (delay) await pause(delay);
                try {
                    const records = await load();
                    validateRecords(records);
                    const matches = records.filter(row => pending.id ? row.recordId === pending.id : !pending.beforeIds.includes(row.recordId) && same(row, pending.expected));
                    if (pending.remove ? matches.length === 0 : matches.length === 1 && same(matches[0], pending.expected)) {
                        pending = null;
                        return records;
                    }
                } catch { /* A delayed or failed read must not be reported as a successful write. */ }
            }
            const error = new Error('ยังยืนยันข้อมูลที่บันทึกไม่ได้ กรุณากดตรวจสอบอีกครั้ง ระบบจะไม่ส่งรายการซ้ำ');
            error.uncertain = true;
            throw error;
        }

        return {
            get pending() { return Boolean(pending); },
            async mutate({ item = null, title, date, active, remove = false }) {
                if (busy || pending) throw new Error('กรุณารอหรือตรวจสอบรายการก่อนหน้าให้เสร็จก่อน');
                const cleanTitle = String(title || '').trim();
                const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? new Date(`${date}T00:00:00`) : null;
                if (!remove && (!cleanTitle || cleanTitle.length > 5000 || !parsedDate || dateInput(parsedDate) !== date)) throw new Error('กรุณาระบุวันที่และรายละเอียดไม่เกิน 5,000 ตัวอักษร');
                if (remove && !item) throw new Error('ไม่พบรายการที่ต้องการลบ');
                busy = true;
                try {
                    const before = await load();
                    validateRecords(before);
                    if (item) {
                        const current = before.find(row => row.recordId === item.recordId);
                        if (!current || !same(current, item)) throw new Error('รายการนี้ถูกแก้ไขหรือลบแล้ว กรุณาโหลดแจ้งเตือนใหม่ก่อนดำเนินการ');
                    }
                    const payload = remove ? { action: 'deleteMemo', sheetName: 'memo', memoId: item.recordId } : {
                        action: 'upsertMemo', sheetName: 'memo', title: cleanTitle, date, active: Boolean(active), ...(item ? { memoId: item.recordId } : {})
                    };
                    pending = { id: item?.recordId || '', remove, beforeIds: before.map(row => row.recordId), expected: { title: cleanTitle, date: parsedDate, active: Boolean(active) } };
                    let response;
                    try { response = await post(payload); }
                    catch (error) {
                        if (error.notSent) { pending = null; throw error; }
                        // A lost response can follow a committed write. Read back without repeating POST.
                        return await verify();
                    }
                    if (response?.success === false) {
                        pending = null;
                        throw new Error(response.error || 'บันทึกแจ้งเตือนไม่สำเร็จ');
                    }
                    if (!item && response?.success === true && response.id) pending.id = String(response.id);
                    return await verify();
                } finally { busy = false; }
            },
            async verifyPending() {
                if (busy || !pending) throw new Error('ไม่มีรายการรอตรวจสอบ');
                busy = true;
                try { return await verify(); } finally { busy = false; }
            }
        };
    }

    async function postMemo(payload, getToken) {
        const token = await getToken();
        if (!token) throw Object.assign(new Error('ยกเลิกการบันทึก: ยังไม่ได้ระบุ Write Token'), { notSent: true });
        const response = await fetch(ENDPOINT, { method: 'POST', body: JSON.stringify({ ...payload, token }), signal: AbortSignal.timeout(45000) });
        const result = await response.json();
        if (!response.ok) throw new Error('ติดต่อระบบบันทึกไม่ได้');
        if (result.success === false && /write token/i.test(result.error || '')) {
            try { localStorage.removeItem(TOKEN_KEY); } catch { /* Keep the server error visible. */ }
        }
        return result;
    }

    let controller = null;
    function init({ load, publish }) {
        if (controller) return;
        const byId = id => document.getElementById(id);
        const dialog = byId('overviewMemoDialog');
        const list = byId('overviewMemoDetails');
        const editor = byId('memoEditor');
        const deletion = byId('memoDeletePanel');
        let sessionToken = '';
        let tokenRequest = null;
        const service = createService({ load, post: async payload => {
            const result = await postMemo(payload, requestToken);
            if (result.success === false && /write token/i.test(result.error || '')) sessionToken = '';
            return result;
        } });
        const state = { records: [], ready: false, busy: false, authorizing: false, filter: 'all', item: null, mode: 'list' };

        async function requestToken() {
            try { sessionToken ||= String(localStorage.getItem(TOKEN_KEY) || '').trim(); } catch { /* Existing permission may be unavailable in this browser. */ }
            if (sessionToken) return sessionToken;
            state.authorizing = true;
            byId('memoManagerList').hidden = true;
            editor.hidden = true;
            deletion.hidden = true;
            byId('memoTokenForm').hidden = false;
            message('กรุณายืนยันสิทธิ์ก่อนบันทึกข้อมูล');
            lockControls();
            byId('memoToken').focus();
            try { return await new Promise((resolve, reject) => { tokenRequest = { resolve, reject }; }); }
            finally {
                tokenRequest = null;
                state.authorizing = false;
                byId('memoToken').value = '';
                byId('memoTokenForm').hidden = true;
                byId('memoManagerList').hidden = state.mode !== 'list';
                editor.hidden = state.mode !== 'edit';
                deletion.hidden = state.mode !== 'delete';
                lockControls();
            }
        }

        function message(text = '', failed = false) {
            const element = byId('memoManagerMessage');
            element.textContent = text;
            element.hidden = !text;
            element.dataset.level = failed ? 'error' : 'success';
        }

        function lockControls() {
            dialog.setAttribute('aria-busy', String(state.busy));
            dialog.querySelectorAll('button, input, textarea').forEach(element => {
                if (state.authorizing && element.closest('#memoTokenForm')) { element.disabled = false; return; }
                const canRead = ['overviewMemoClose', 'memoRefresh', 'memoSearch'].includes(element.id) || element.hasAttribute('data-memo-filter') || element.hasAttribute('data-memo-expand');
                element.disabled = state.busy || element.dataset.locked === 'true' || (!canRead && (!state.ready || service.pending));
            });
            byId('memoVerify').hidden = !service.pending;
            byId('memoVerify').disabled = state.busy;
        }

        function render() {
            const shown = state.records.filter(item => item.active).length;
            byId('overviewMemoDialogCount').textContent = `${state.records.length} รายการ · แสดง ${shown} · ซ่อน ${state.records.length - shown}`;
            const query = byId('memoSearch').value.trim().toLocaleLowerCase('th-TH');
            const rows = state.records.filter(item => (state.filter === 'all' || item.active === (state.filter === 'shown')) && (!query || `${item.title} ${item.dateText}`.toLocaleLowerCase('th-TH').includes(query)));
            dialog.querySelectorAll('[data-memo-filter]').forEach(button => {
                const filter = button.dataset.memoFilter;
                button.setAttribute('aria-pressed', String(filter === state.filter));
                button.querySelector('span').textContent = filter === 'all' ? state.records.length : filter === 'shown' ? shown : state.records.length - shown;
            });
            list.innerHTML = rows.length ? rows.map(item => {
                const id = escape(item.recordId);
                const label = escape(item.title.slice(0, 70));
                const collapsible = item.title.length > 180 || item.title.includes('\n');
                return `<li class="memo-manage-row${item.active ? '' : ' is-hidden'}" data-memo-id="${id}">
                    <div class="memo-row-top"><time>${escape(item.date ? item.date.toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : item.dateText || 'ไม่ระบุวันที่')}</time>
                    <div class="memo-row-actions"><label class="memo-switch-label"><input type="checkbox" role="switch" data-memo-toggle aria-label="แสดงแจ้งเตือน: ${label}" ${item.active ? 'checked' : ''} data-locked="${!item.recordId || !dateInput(item.date)}"><span>${item.active ? 'แสดง' : 'ซ่อน'}</span></label>
                    <button class="memo-icon-button" type="button" data-memo-edit title="แก้ไข" aria-label="แก้ไข: ${label}" data-locked="${!item.recordId}"><i class="ph ph-pencil-simple" aria-hidden="true"></i></button>
                    <button class="memo-icon-button memo-delete-button" type="button" data-memo-delete title="ลบ" aria-label="ลบ: ${label}" data-locked="${!item.recordId}"><i class="ph ph-trash" aria-hidden="true"></i></button></div></div>
                    <p class="memo-row-text${collapsible ? ' is-truncated' : ''}">${escape(item.title)}</p>${collapsible ? '<button class="memo-expand" type="button" data-memo-expand aria-expanded="false">อ่านเพิ่มเติม <i class="ph ph-caret-down" aria-hidden="true"></i></button>' : ''}</li>`;
            }).join('') : `<li class="memo-empty">${!state.ready ? 'กำลังรอข้อมูลแจ้งเตือน' : query ? 'ไม่พบแจ้งเตือนที่ค้นหา' : 'ไม่มีรายการในหมวดนี้'}</li>`;
            lockControls();
        }

        function show(mode, item = null) {
            state.mode = mode;
            state.item = item;
            byId('memoManagerList').hidden = mode !== 'list';
            editor.hidden = mode !== 'edit';
            deletion.hidden = mode !== 'delete';
            message();
            if (mode === 'edit') {
                byId('memoEditorHeading').textContent = item ? 'แก้ไขแจ้งเตือน' : 'เพิ่มแจ้งเตือน';
                byId('memoDate').value = dateInput(item ? item.date : new Date());
                byId('memoText').value = item?.title || '';
                byId('memoActive').checked = item ? item.active : true;
                updateCount();
                byId('memoText').focus();
            } else if (mode === 'delete') {
                byId('memoDeleteText').textContent = item.title;
                byId('memoDeleteCancel').focus();
            } else {
                render();
            }
            lockControls();
        }

        async function run(task, success) {
            if (state.busy) return;
            state.busy = true;
            message('กำลังบันทึกและตรวจสอบข้อมูล...');
            lockControls();
            try {
                const records = await task();
                publish(records);
                show('list');
                message(success);
            } catch (error) {
                message(error.message, true);
            } finally {
                state.busy = false;
                render();
            }
        }

        function updateCount() { byId('memoTextCount').textContent = `${byId('memoText').value.length.toLocaleString('th-TH')} / 5,000`; }
        byId('memoAdd').addEventListener('click', () => show('edit'));
        byId('memoSearch').addEventListener('input', render);
        byId('memoText').addEventListener('input', updateCount);
        byId('memoTokenForm').addEventListener('submit', event => {
            event.preventDefault();
            sessionToken = byId('memoToken').value.trim();
            if (sessionToken && tokenRequest) {
                message('กำลังบันทึกและตรวจสอบข้อมูล...');
                tokenRequest.resolve(sessionToken);
            }
        });
        byId('memoTokenCancel').addEventListener('click', () => tokenRequest?.reject(Object.assign(new Error('ยกเลิกการบันทึก: ยังไม่ได้ส่งข้อมูล'), { notSent: true })));
        byId('memoEditorCancel').addEventListener('click', () => show('list'));
        byId('memoDeleteCancel').addEventListener('click', () => show('list'));
        byId('memoDeleteConfirm').addEventListener('click', () => run(() => service.mutate({ item: state.item, remove: true }), 'ลบแจ้งเตือนแล้ว'));
        byId('memoVerify').addEventListener('click', () => run(() => service.verifyPending(), 'ตรวจสอบข้อมูลที่บันทึกแล้ว'));
        byId('memoRefresh').addEventListener('click', () => run(() => service.pending ? service.verifyPending() : load(), 'อัปเดตแจ้งเตือนแล้ว'));
        editor.addEventListener('submit', event => {
            event.preventDefault();
            run(() => service.mutate({ item: state.item, title: byId('memoText').value, date: byId('memoDate').value, active: byId('memoActive').checked }), 'บันทึกแจ้งเตือนแล้ว');
        });
        dialog.querySelectorAll('[data-memo-filter]').forEach(button => button.addEventListener('click', () => { state.filter = button.dataset.memoFilter; render(); }));
        list.addEventListener('click', event => {
            const row = event.target.closest('[data-memo-id]');
            if (!row || state.busy) return;
            const item = state.records.find(record => record.recordId === row.dataset.memoId);
            if (!item) return;
            if (event.target.closest('[data-memo-edit]')) show('edit', item);
            if (event.target.closest('[data-memo-delete]')) show('delete', item);
            const expand = event.target.closest('[data-memo-expand]');
            if (expand) {
                const open = expand.getAttribute('aria-expanded') !== 'true';
                expand.setAttribute('aria-expanded', String(open));
                row.classList.toggle('is-expanded', open);
                expand.innerHTML = `${open ? 'ย่อข้อความ' : 'อ่านเพิ่มเติม'} <i class="ph ph-caret-${open ? 'up' : 'down'}" aria-hidden="true"></i>`;
            }
        });
        list.addEventListener('change', event => {
            if (!event.target.matches('[data-memo-toggle]') || state.busy) return;
            const item = state.records.find(record => record.recordId === event.target.closest('[data-memo-id]').dataset.memoId);
            const active = event.target.checked;
            render();
            run(() => service.mutate({ item, title: item.title, date: dateInput(item.date), active }), active ? 'เปิดการแสดงแจ้งเตือนแล้ว' : 'ซ่อนแจ้งเตือนแล้ว');
        });
        dialog.addEventListener('close', () => show('list'));
        controller = {
            update(records, { ready = false } = {}) { state.records = records; state.ready = ready; render(); },
            canClose() { return !state.busy; }
        };
        render();
    }

    return { createService, dateInput, init, update: (...args) => controller?.update(...args), canClose: () => controller?.canClose() !== false };
});
