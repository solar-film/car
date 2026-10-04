// Bookings keeps a text field; one brand retains its original representation.
window.FilmBrands = (() => {
    function parse(value) {
        return [...new Set(String(value || '').split(',').map(v => v.trim()).filter(v => v && v !== '-'))];
    }

    function filterModels(models, value) {
        const brands = parse(value).map(v => v.toLowerCase());
        const filtered = brands.length ? models.filter(model => brands.some(brand => {
            const declaredBrand = String(model.brand || '').trim().toLowerCase();
            const full = String(model.full || '').trim().toLowerCase();
            return declaredBrand === brand || full === brand || full.startsWith(brand + ' - ');
        })) : models;
        return filtered.filter((model, index) => filtered.findIndex(other => other.full === model.full) === index);
    }

    let available = [];
    function render() {
        const input = document.getElementById('bk-filmBrand');
        const selected = parse(input.value);
        document.getElementById('bk-filmBrandLabel').textContent = selected.join(', ') || '-- เลือกยี่ห้อฟิล์ม --';
        const panel = document.getElementById('bk-filmBrandOptions');
        panel.replaceChildren();
        const values = [...new Set([...available, ...selected])];
        if (!values.length) panel.textContent = 'ยังไม่มีตัวเลือกยี่ห้อฟิล์ม กรุณารอโหลดข้อมูล';
        values.forEach(value => {
            const label = document.createElement('label');
            label.className = 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-blue-50';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = value;
            checkbox.checked = selected.includes(value);
            checkbox.className = 'h-4 w-4 accent-blue-600';
            checkbox.addEventListener('change', () => {
                const next = parse(input.value).filter(v => v !== value);
                if (checkbox.checked) next.push(value);
                input.value = next.join(', ');
                document.getElementById('bk-filmBrandLabel').textContent = input.value || '-- เลือกยี่ห้อฟิล์ม --';
            });
            const text = document.createElement('span');
            text.textContent = value;
            label.append(checkbox, text);
            panel.appendChild(label);
        });
    }

    function set(value) {
        document.getElementById('bk-filmBrand').value = parse(value).join(', ');
        document.getElementById('bk-filmBrandPicker').open = false;
        render();
    }
    function populate(values) {
        available = values;
        render(); // Preserve edits made while the reference sheet was loading.
    }
    function validate() {
        if (parse(document.getElementById('bk-filmBrand').value).length) return true;
        document.getElementById('bk-filmBrandPicker').open = true;
        document.getElementById('bk-filmBrandLabel').focus();
        return false;
    }
    return { parse, filterModels, set, populate, validate };
})();
