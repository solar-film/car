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

    const api = {beforeRoof, isStrip, stripRowsByJob, printStrip};
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CarInstallPositions = api;
})(typeof window === 'undefined' ? globalThis : window);
