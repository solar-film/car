(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CarFirstKnownOptions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const values = Object.freeze([
        'ค้นหา Google',
        'Facebook',
        'Tiktok',
        'Instagram',
        'Google Map',
        'ป้ายหน้าร้าน',
        'เพื่อนแนะนำ',
        'ลูกค้าฟิล์มอาคาร',
        'ลูกค้าพี่ปอ',
        'ลูกค้าพี่โอเล่',
        'พนักงาน 3M',
        'Chat GPT',
        'Gemini',
        'อื่นๆ'
    ]);

    // Existing records may contain a retired option. Keep that exact value when editing.
    function choices(selectedValue = '') {
        const selected = String(selectedValue ?? '');
        return selected && !values.includes(selected) ? [...values, selected] : [...values];
    }

    function populate(select, selectedValue) {
        const selected = selectedValue === undefined ? String(select.value || '') : String(selectedValue ?? '');
        const document = select.ownerDocument;
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '-- กรุณาเลือก --';
        select.replaceChildren(placeholder);
        for (const value of choices(selected)) {
            const option = document.createElement('option');
            option.value = option.textContent = value;
            select.appendChild(option);
        }
        select.value = selected;
        return select;
    }

    return Object.freeze({ values, choices, populate });
});
