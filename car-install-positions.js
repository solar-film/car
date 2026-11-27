(function (root) {
    'use strict';

    const FRONT_STRIP = 'คาดหน้า';
    const key = value => String(value ?? '').trim().replace(/[\s–—-]/g, '').toLowerCase();
    const isStrip = value => key(value) === FRONT_STRIP;
    const isRoof = value => /^(?:ซันรูฟ|sunroof)/i.test(key(value));

    function beforeRoof(items, position = value => value) {
        const roof = items.findIndex(item => isRoof(position(item)));
        if (roof < 0 || !items.slice(roof + 1).some(item => isStrip(position(item)))) return items;
        const strips = items.filter(item => isStrip(position(item)));
        return [...items.slice(0, roof).filter(item => !isStrip(position(item))), ...strips,
            ...items.slice(roof).filter(item => !isStrip(position(item)))];
    }

    const detailMetadata = new Set([
        'jobid', 'detailid', 'ขอตัดฟิล์ม', 'การติดตั้ง', 'ประเภทการติดตั้ง', 'ตำแหน่งติดตั้ง', 'ยี่ห้อฟิล์ม',
        'วันที่ลงรายการ', 'วันลงรายการ', 'timestamp', 'createdat', 'updatedat'
    ]);

    function detailSummary(detail, escape, reasonLabel, renderCutAction) {
        const rows = [];
        for (const [field, raw] of beforeRoof(Object.entries(detail || {}), ([name]) => name)) {
            const label = field.trim().replace(/[:：]+$/, '').trim();
            const normalized = key(label).replace(/_/g, '');
            let value = String(raw ?? '').trim();
            if (!label || detailMetadata.has(normalized) || !value || value === '-') continue;

            const isCutReason = normalized.includes('เหตุผล') && normalized.includes('ตัดฟิล์ม');
            if (label.includes('เหตุผล') || label.includes('ตัดฟิล์ม')) value = reasonLabel(value) || value;
            const multiline = isCutReason || normalized.includes('หมายเหตุ');
            const action = isCutReason && renderCutAction ? renderCutAction() : '';
            rows.push(`<div class="car-install-details-row${multiline ? ' car-install-details-row--note' : ''}"><dt>${escape(label)}</dt><dd>${escape(value)}${action}</dd></div>`);
        }
        if (!rows.length) return '<p class="car-install-details-empty">ยังไม่มีข้อมูลการติดตั้ง กรอกข้อมูลในหน้าคิวก่อนพิมพ์ใบงาน</p>';
        return `<dl class="car-install-details-list">${rows.join('')}</dl>`;
    }

    function detailValue(detail, labels) {
        const names = labels.map(key);
        const field = Object.keys(detail || {}).find(name => names.includes(key(name.trim().replace(/[:：]+$/, ''))));
        return cutValue(detail?.[field]);
    }

    function cutValue(value) {
        const text = String(value ?? '').trim();
        return text === '-' ? '' : text;
    }

    function detailCutReason(detail) {
        return detailValue(detail, ['เหตุผลขอตัดฟิล์ม', 'เหตุผลตัดฟิล์ม', 'เหตุผล']);
    }

    const cutReasonField = 'เหตุผลขอตัดฟิล์ม';
    const installerDefaultReason = '🆕 ลูกค้าใหม่';
    const cutSizeFields = ['กว้าง', 'ยาว', 'จำนวน'];

    function bindCutRows(tableBody, detailReason = '') {
        for (const row of tableBody.querySelectorAll('tr[data-position]')) {
            const control = field => row.querySelector(`[data-field="${field}"]`);
            const select = control(cutReasonField);
            const initialReason = cutValue(select.value);
            // Saved installer assignments do not record where the reason came from.
            const savedAssignment = row.dataset.rowId && cutValue(control('ทีมช่าง')?.value)
                && cutSizeFields.every(field => !cutValue(control(field)?.value))
                && (initialReason === installerDefaultReason || initialReason === cutValue(detailReason));
            if (initialReason && (initialReason === cutValue(row.dataset.prefillReason) || savedAssignment)) {
                row.dataset.automaticCutReason = initialReason;
            }

            function markReasonEdited() {
                if (cutValue(select.value) === initialReason) return;
                delete row.dataset.automaticCutReason;
                delete row.dataset.prefillReason;
            }
            select.addEventListener('input', markReasonEdited);
            select.addEventListener('change', markReasonEdited);
        }
    }

    function canSaveTeamOnly(item, formRow) {
        const reason = cutValue(item[cutReasonField]);
        return Boolean(cutValue(item['ทีมช่าง']) && reason && reason === formRow?.dataset.automaticCutReason
            && cutSizeFields.every(field => !cutValue(item[field])));
    }

    function shouldCollectCutRow(row, suggestedReason) {
        const reason = cutValue(row['เหตุผลขอตัดฟิล์ม']);
        return Boolean(row.MIS_ID || (reason && reason !== suggestedReason) ||
            ['กว้าง', 'ยาว', 'จำนวน', 'ทีมช่าง'].some(field => cutValue(row[field])));
    }

    function stripRowsByJob(rows) {
        const jobs = new Map();
        for (const row of rows) {
            const jobId = String(row.JobID ?? '').trim();
            if (!jobId || !isStrip(row['ตำแหน่งติดตั้ง'] || row['ตำแหน่ง'])) continue;
            if (!jobs.has(jobId)) jobs.set(jobId, []);
            jobs.get(jobId).push(row);
        }
        return jobs;
    }

    function printStrip(rows, detail, escape, reasonLabel, receiptHasNote = true) {
        const detailFilm = Object.entries(detail || {}).find(([name]) => isStrip(name))?.[1];
        const value = input => String(input ?? '').trim() === '-' ? '' : String(input ?? '').trim();
        const fallbackFilm = value(detailFilm);
        const films = [...new Set(rows.map(row => value(row['รุ่นฟิล์ม'] || row['ยี่ห้อฟิล์ม'])).filter(Boolean))];
        const extra = receiptHasNote ? '<td class="py-1.5 px-2"></td>' : '';
        const receipt = `<tr class="receipt-film-row border-b border-black"><td class="border-r border-black py-1.5 px-2 text-left">${FRONT_STRIP}</td><td class="py-1.5 px-2 text-center font-semibold${receiptHasNote ? ' border-r border-black' : ''}">${escape(films.join(', ') || fallbackFilm)}</td>${extra}</tr>`;
        const cutting = (rows.length ? rows : [{}]).map(row => {
            const reason = value(row['เหตุผลขอตัดฟิล์ม'] || row['เหตุผล']);
            return `<tr class="cutting-film-row border-b border-black text-center">
                <td class="border-r border-black py-1">${escape(value(row['ทีมช่าง']))}</td>
                <td class="border-r border-black py-1 text-left px-2">${FRONT_STRIP}</td>
                <td class="cut-film-column border-r border-black py-1 font-medium">${escape(value(row['รุ่นฟิล์ม'] || row['ยี่ห้อฟิล์ม']) || fallbackFilm)}</td>
                <td class="cut-size-column border-r border-black py-1">${escape(value(row['กว้าง'] ?? row.W ?? row.Width))}</td>
                <td class="cut-size-column border-r border-black py-1">${escape(value(row['ยาว'] ?? row.H ?? row.Length))}</td>
                <td class="cut-size-column border-r border-black py-1">${escape(value(row['จำนวน'] ?? row.Qty))}</td>
                <td class="cut-note-column py-1">${escape(reasonLabel(reason) || reason)}</td></tr>`;
        }).join('');
        return {receipt, cutting};
    }

    const api = {beforeRoof, detailSummary, detailValue, detailCutReason, bindCutRows, canSaveTeamOnly, shouldCollectCutRow, isStrip, stripRowsByJob, printStrip};
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CarInstallPositions = api;
})(typeof window === 'undefined' ? globalThis : window);
