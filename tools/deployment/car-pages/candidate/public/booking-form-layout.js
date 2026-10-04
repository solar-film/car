let bookingReferenceMotionToken = 0;
let bookingReferenceCloseTimer = null;
let bookingReferenceTrigger = null;

function showBookingReferenceModal() {
    const modal = document.getElementById('bookingModal');
    if (!modal) return;

    bookingReferenceMotionToken += 1;
    clearTimeout(bookingReferenceCloseTimer);
    bookingReferenceTrigger = document.activeElement;
    modal.classList.remove('hidden', 'br-closing', 'br-visible');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('booking-modal-open');

    // Commit the off-screen state before starting the entrance transition.
    // Adding the visible state synchronously also works when a background tab
    // throttles requestAnimationFrame.
    void modal.offsetWidth;
    modal.classList.add('br-visible');
    const form = document.getElementById('bookingForm');
    if (form) form.scrollTop = 0;
    modal.querySelector('.br-header > button')?.focus({ preventScroll: true });
}

function hideBookingReferenceModal(afterClose) {
    const modal = document.getElementById('bookingModal');
    if (!modal || modal.classList.contains('hidden')) {
        if (typeof afterClose === 'function') afterClose();
        return;
    }

    const shell = modal.querySelector('.br-shell') || modal.firstElementChild;
    const motionToken = ++bookingReferenceMotionToken;
    let finished = false;
    const finish = () => {
        if (finished || motionToken !== bookingReferenceMotionToken) return;
        finished = true;
        clearTimeout(bookingReferenceCloseTimer);
        modal.classList.add('hidden');
        modal.classList.remove('br-closing', 'br-visible');
        document.body.classList.remove('booking-modal-open');
        if (bookingReferenceTrigger?.isConnected) bookingReferenceTrigger.focus({ preventScroll: true });
        if (typeof afterClose === 'function') afterClose();
    };

    modal.classList.remove('br-visible');
    modal.classList.add('br-closing');
    modal.setAttribute('aria-hidden', 'true');
    const handleTransitionEnd = event => {
        if (event.target !== shell || event.propertyName !== 'transform') return;
        shell.removeEventListener('transitionend', handleTransitionEnd);
        finish();
    };
    shell?.addEventListener('transitionend', handleTransitionEnd);
    bookingReferenceCloseTimer = setTimeout(finish, 440);
}

window.showBookingReferenceModal = showBookingReferenceModal;
window.hideBookingReferenceModal = hideBookingReferenceModal;

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('bookingModal');
    const form = document.getElementById('bookingForm');
    if (!modal || !form) return;
    modal.classList.add('booking-reference');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', modal.classList.contains('hidden') ? 'true' : 'false');
    const shell = modal.firstElementChild;
    shell.classList.add('br-shell');
    const header = shell.firstElementChild;
    header.classList.add('br-header');
    const title = header.querySelector('h3');
    if (!title.id) title.id = 'booking-panel-title';
    modal.setAttribute('aria-labelledby', title.id);
    const closeButton = header.querySelector('button');
    closeButton.setAttribute('aria-label', 'ปิดฟอร์มคิวจอง');
    closeButton.textContent = 'ปิด';
    modal.addEventListener('click', event => {
        if (event.target === modal) hideBookingReferenceModal();
    });
    modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            hideBookingReferenceModal();
        }
    });
    const group = id => Array.from(form.children).find(node => node.querySelector('#' + id));
    const groups = [
        ['ข้อมูลนัดหมาย', 'เลือกวันที่ เวลา และประเภทลูกค้า', ['bk-installDate','bk-custType']],
        ['ข้อมูลรถยนต์', 'รุ่นรถ ทะเบียน และสีป้าย', ['bk-carModel','bk-plateColor']],
        ['ข้อมูลฟิล์มและโปรโมชั่น', 'เลือกยี่ห้อฟิล์ม ตำแหน่งติดตั้ง และโปรโมชั่น', ['bk-filmBrand','bk-installPos','bk-proId']],
        ['ราคาและส่วนลด', 'ระบุราคาสินค้า ส่วนลด และรหัสส่วนลด', ['bk-price','bk-discountCode']],
        ['สถานะ', 'กำหนดสถานะของคิว', ['bk-status']],
        ['หมายเหตุและผู้รับผิดชอบ', 'เพิ่มหมายเหตุ และเลือกพนักงานขาย', ['bk-note','bk-sales']]
    ].map(([title, subtitle, ids]) => ({title, subtitle, nodes: [...new Set(ids.map(group))]}));
    const footer = form.querySelector('button[type="submit"]').parentElement;
    footer.classList.add('br-footer');
    const columns = document.createElement('div');
    columns.className = 'br-columns';
    const mainColumn = document.createElement('div');
    mainColumn.className = 'br-main-column';
    const sideColumn = document.createElement('div');
    sideColumn.className = 'br-side-column';
    columns.append(mainColumn, sideColumn);
    form.insertBefore(columns, footer);
    groups.forEach(({title, subtitle, nodes}, index) => {
        const section = document.createElement('section');
        section.className = 'br-section br-section-' + (index + 1);
        const heading = document.createElement('div');
        heading.className = 'br-section-heading';
        heading.innerHTML = `<span class="br-number">${String(index + 1).padStart(2, '0')}</span><div><h4>${title}</h4><p>${subtitle}</p></div>`;
        const body = document.createElement('div');
        body.className = 'br-section-body';
        nodes.forEach(node => { if (node) body.appendChild(node); });
        section.append(heading, body);
        (index < 4 ? mainColumn : sideColumn).appendChild(section);
    });
    const customerNoteCard = document.getElementById('bk-customerNoteCard');
    if (customerNoteCard) sideColumn.appendChild(customerNoteCard);
    const customerHistoryCard = document.getElementById('bk-customerHistoryCard');
    if (customerHistoryCard) sideColumn.appendChild(customerHistoryCard);
    const fieldIcons = {'bk-installDate':'calendar-day','bk-appointTime':'clock','bk-carModel':'car','bk-plate':'address-card','bk-price':'baht-sign','bk-discount':'baht-sign','bk-sales-amt':'baht-sign','bk-note':'file-alt'};
    Object.entries(fieldIcons).forEach(([id, name]) => {
        const input = document.getElementById(id);
        const wrap = document.createElement('div');
        wrap.className = 'br-field';
        input.before(wrap);
        const icon = document.createElement('i');
        icon.className = 'fas fa-' + name;
        icon.setAttribute('aria-hidden','true');
        wrap.append(icon, input);
    });
    const icons = {'ลูกค้าใหม่':'user','ลูกค้าเก่า':'user','ลูกค้าเคลม':'shield-alt','งานแก้(ในวัน)':'wrench','ศูนย์':'shield-alt','ร้าน':'store','พี่เมย์':'user','พลอย':'user'};
    form.querySelectorAll('.bk-pill').forEach(button => {
        const val = button.dataset.val;
        if (icons[val]) button.insertAdjacentHTML('afterbegin', `<i aria-hidden="true" class="fas fa-${icons[val]}"></i>`);
        const colors = {'ขาว':'white','แดง':'red','เหลือง':'yellow','กราฟฟิก':'black'};
        if (colors[val]) button.insertAdjacentHTML('afterbegin', `<span aria-hidden="true" class="br-dot br-dot-${colors[val]}"></span>`);
    });
    ['bk-installPosWrap','bk-proIdWrap','bk-discountCodeWrap'].forEach((id,index) => {
        document.getElementById(id).querySelector('button').insertAdjacentHTML('afterbegin', `<i aria-hidden="true" class="fas fa-${['layer-group','gift','tags'][index]} br-dropdown-icon"></i>`);
    });
    document.getElementById('bk-note').rows = 3;
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'br-clear';
    clear.innerHTML = '<i class="fas fa-trash-alt" aria-hidden="true"></i> ล้างข้อมูล';
    clear.addEventListener('click', () => {
        ['bk-carModel','bk-plate','bk-price','bk-discount','bk-note'].forEach(id => document.getElementById(id).value = '');
        ['bk-custType','bk-plateColor','bk-warranty','bk-sales'].forEach(id => resetBtnGroup(id, ''));
        FilmBrands.set('');
        installPosSelected.clear(); updateInstallPosLabel();
        discountCodeSelected.clear(); updateDiscountCodeLabel();
        document.getElementById('bk-proId').value = ''; updatePromotionLabel();
        calcSales();
        form.querySelectorAll('#bk-installPosList input[type=checkbox], #bk-discountCodePanel input[type=checkbox]').forEach(input => input.checked = false);
        ['bk-installPosPanel','bk-discountCodePanel','bk-proIdPanel'].forEach(id => document.getElementById(id).classList.add('hidden'));
    });
    footer.prepend(clear);

});
