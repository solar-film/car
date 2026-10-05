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

function setupBookingReferenceDropdowns(modal, form, footer) {
    const dropdowns = [
        ['bk-filmBrandOptions', 'bk-filmBrandPicker', 192],
        ['bk-installPosPanel', 'bk-installPosWrap', 288],
        ['bk-proIdPanel', 'bk-proIdWrap', 320],
        ['bk-discountCodePanel', 'bk-discountCodeWrap', 288]
    ].map(([panelId, wrapperId, height]) => {
        const panel = document.getElementById(panelId);
        const wrapper = document.getElementById(wrapperId);
        if (!panel || !wrapper) return null;
        panel.classList.add('br-dropdown-panel');
        return { panel, wrapper, height, anchor: wrapper.querySelector('summary, button') };
    }).filter(item => item && item.anchor);
    let frame = null;
    const isOpen = item => item.wrapper.tagName === 'DETAILS'
        ? item.wrapper.open : !item.panel.classList.contains('hidden');
    const update = () => {
        frame = null;
        if (modal.classList.contains('hidden')) return;
        const formRect = form.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        const viewport = window.visualViewport;
        const viewportTop = viewport ? viewport.offsetTop : 0;
        const viewportBottom = viewportTop + (viewport ? viewport.height : window.innerHeight);
        const top = Math.max(formRect.top, viewportTop) + 5;
        const bottom = Math.min(formRect.bottom, footerRect.top, viewportBottom) - 5;
        for (const section of form.querySelectorAll('.br-section')) {
            section.classList.toggle('br-dropdown-open', dropdowns.some(item => isOpen(item) && section.contains(item.wrapper)));
        }
        for (const item of dropdowns) {
            if (!isOpen(item)) continue;
            const rect = item.anchor.getBoundingClientRect();
            const above = Math.max(0, rect.top - top - 5);
            const below = Math.max(0, bottom - rect.bottom - 5);
            // Measure at its normal height first, including after a resize or content update.
            item.panel.style.maxHeight = item.height + 'px';
            const wanted = Math.min(item.height, item.panel.scrollHeight + item.panel.offsetHeight - item.panel.clientHeight);
            const upward = below < wanted && above > below;
            item.panel.dataset.brPlacement = upward ? 'up' : 'down';
            item.panel.style.top = upward ? 'auto' : 'calc(100% + 5px)';
            item.panel.style.bottom = upward ? 'calc(100% + 5px)' : 'auto';
            item.panel.style.marginTop = '0';
            item.panel.style.maxHeight = Math.floor(Math.min(item.height, upward ? above : below)) + 'px';
        }
    };
    const schedule = () => {
        if (frame === null) frame = requestAnimationFrame(update);
    };
    for (const item of dropdowns) {
        new MutationObserver(schedule).observe(item.panel, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
        if (item.wrapper.tagName === 'DETAILS') {
            new MutationObserver(schedule).observe(item.wrapper, { attributes: true, attributeFilter: ['open'] });
        }
    }
    new MutationObserver(schedule).observe(modal, { attributes: true, attributeFilter: ['class'] });
    if (typeof ResizeObserver !== 'undefined') {
        const sizes = new ResizeObserver(schedule);
        dropdowns.forEach(item => sizes.observe(item.anchor));
        sizes.observe(form);
        sizes.observe(footer);
    }
    form.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.visualViewport?.addEventListener('resize', schedule, { passive: true });
    window.visualViewport?.addEventListener('scroll', schedule, { passive: true });
    schedule();
}

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
    setupBookingReferenceDropdowns(modal, form, footer);

});
