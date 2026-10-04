const CAR_CRM_NAV = [
    { href: 'overview.html', label: 'Overview', icon: '◉', color: 'sky' },
    { href: 'lead-data.html#leads', label: 'ข้อมูลการติดต่อ', icon: '☏', color: 'indigo' },
    { href: 'customer-data.html', label: 'ข้อมูลลูกค้า', icon: '👤', color: 'blue' },
    { href: 'index.html', label: 'รายการคิวจอง', icon: '▦', color: 'blue' },
    // { href: 'technician.html', label: 'ข้อมูลงานติดตั้ง', icon: '⚙', color: 'indigo' }, // ซ่อนชั่วคราว
    //{ href: 'calendar.html', label: 'ปฏิทินคิวจอง', icon: '◷', color: 'sky' },// ซ่อนชั่วคราว
    { href: 'contact-stats.html', label: 'สถิติการติดต่อ', icon: '☎', color: 'sky' },
    { href: 'sales-summary.html', label: 'สรุปยอดขาย', icon: '฿', color: 'amber' },
    { href: 'damage.html', label: 'ความเสียหายฟิล์ม', icon: '!', color: 'rose' },
    { href: 'other-damage.html', label: 'ความเสียหายอื่นๆ', icon: '+', color: 'indigo' },
    { href: 'install-summary.html', label: 'สรุปงานฟิล์ม', icon: 'Σ', color: 'emerald' },
    { href: 'feedback-car.html', label: 'Feedback ลูกค้า', icon: '★', color: 'rose' }
];

const CAR_CRM_TITLES = {
    'overview.html': 'Overview',
    'lead-data.html': 'ข้อมูลลีด',
    'lead-data.html#leads': 'ข้อมูลการติดต่อ',
    'customer-data.html': 'ข้อมูลลูกค้า',
    'index.html': 'รายการคิวจอง',
    'technician.html': 'งานติดตั้ง',
    'calendar.html': 'ปฏิทินคิวจอง',
    'sales-dashboard.html': 'ราคาขายเดือนนี้',
    'sales-summary.html': 'สรุปยอดขาย',
    'contact-stats.html': 'สถิติการติดต่อ',
    'feedback-car.html': 'Feedback ลูกค้า',
    'sunroof.html': 'Sunroof',
    'install-summary.html': 'สรุปงานฟิล์ม',
    'technician-commission.html': 'คำนวณค่าคอมช่าง',
    'damage.html': 'ความเสียหาย',
    'other-damage.html': 'ความเสียหายอื่นๆ'
};

function ensureCarCrmSidebarStyles() {
    if (document.getElementById('car-crm-sidebar-styles')) return;

    const style = document.createElement('style');
    style.id = 'car-crm-sidebar-styles';
    style.textContent = `
        [data-sidebar-panel].car-crm-sidebar-panel {
            background: linear-gradient(180deg, rgba(248, 250, 252, 0.98) 0%, rgba(239, 246, 255, 0.96) 55%, rgba(248, 250, 252, 0.98) 100%) !important;
            border-right-color: rgba(59, 130, 246, 0.18) !important;
            color: #0f172a !important;
            box-shadow: 12px 0 32px rgba(15, 23, 42, 0.11) !important;
        }

        .car-crm-sidebar-panel .car-crm-brand-mark {
            background: linear-gradient(135deg, #2563eb, #0ea5e9) !important;
            box-shadow: 0 10px 24px rgba(37, 99, 235, 0.22) !important;
        }

        .car-crm-sidebar-panel .car-crm-brand-title {
            color: #0f172a !important;
        }

        .car-crm-sidebar-panel .car-crm-sales-title {
            color: #075985 !important;
        }

        .car-crm-sidebar-panel .car-crm-brand-subtitle,
        .car-crm-sidebar-panel .car-crm-section-label {
            color: rgba(71, 85, 105, 0.74) !important;
        }

        .car-crm-sidebar-panel .car-crm-divider {
            background: rgba(59, 130, 246, 0.14) !important;
        }

        .car-crm-sidebar-panel .car-crm-operations {
            border-top-color: rgba(59, 130, 246, 0.14) !important;
        }

        .car-crm-sidebar-panel .car-crm-nav-link {
            border: 1px solid transparent;
            color: #475569 !important;
        }

        .car-crm-sidebar-panel .car-crm-nav-link:hover {
            background: rgba(59, 130, 246, 0.08) !important;
            border-color: rgba(59, 130, 246, 0.14);
            color: #1e40af !important;
        }

        .car-crm-sidebar-panel .car-crm-nav-link-active {
            background: #2563eb !important;
            border-color: rgba(37, 99, 235, 0.24);
            color: #ffffff !important;
            box-shadow: 0 10px 24px rgba(37, 99, 235, 0.20) !important;
        }

        .car-crm-sidebar-panel .car-crm-nav-icon {
            background: rgba(37, 99, 235, 0.09) !important;
            color: #2563eb !important;
            box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.08) !important;
        }

        .car-crm-sidebar-panel .car-crm-nav-link-active .car-crm-nav-icon {
            background: #ffffff !important;
            color: #1d4ed8 !important;
            box-shadow: 0 10px 22px rgba(15, 23, 42, 0.16) !important;
        }

        .car-crm-sidebar-panel .car-crm-close {
            background: rgba(255, 255, 255, 0.94) !important;
            border-color: rgba(37, 99, 235, 0.26) !important;
            color: #1d4ed8 !important;
            box-shadow: 0 5px 14px rgba(37, 99, 235, 0.14) !important;
        }

        .car-crm-sidebar-panel .car-crm-close:hover {
            background: #2563eb !important;
            border-color: #2563eb !important;
            color: #ffffff !important;
            box-shadow: 0 8px 18px rgba(37, 99, 235, 0.26) !important;
            transform: translateY(-1px);
        }

        .car-crm-sidebar-panel .car-crm-close:focus-visible {
            outline: 3px solid rgba(59, 130, 246, 0.30);
            outline-offset: 2px;
        }

        .car-crm-sidebar-panel .car-crm-close:active {
            transform: translateY(0) scale(0.96);
        }

        .car-crm-sidebar-panel .car-crm-sales-card {
            position: relative;
            isolation: isolate;
            overflow: hidden;
            background:
                radial-gradient(circle at 12% -25%, rgba(125, 211, 252, 0.82) 0%, rgba(56, 189, 248, 0) 48%),
                linear-gradient(135deg, #0f3d9e 0%, #1d4ed8 54%, #0369a1 100%) !important;
            border-color: rgba(191, 219, 254, 0.44) !important;
            border-radius: 22px !important;
            color: #ffffff !important;
            box-shadow:
                0 18px 38px rgba(30, 64, 175, 0.28),
                inset 0 1px 0 rgba(255, 255, 255, 0.28) !important;
            transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease;
        }

        .car-crm-sidebar-panel .car-crm-sales-card::before {
            content: '';
            position: absolute;
            right: -38px;
            bottom: -54px;
            z-index: -1;
            width: 132px;
            height: 132px;
            border-radius: 9999px;
            background: rgba(103, 232, 249, 0.18);
            filter: blur(2px);
        }

        .car-crm-sidebar-panel .car-crm-sales-card::after {
            content: '';
            position: absolute;
            top: 0;
            left: 14%;
            width: 72%;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.82), transparent);
        }

        .car-crm-sidebar-panel .car-crm-sales-card:hover {
            transform: translateY(-3px);
            filter: saturate(1.08);
            box-shadow:
                0 24px 46px rgba(30, 64, 175, 0.36),
                inset 0 1px 0 rgba(255, 255, 255, 0.34) !important;
        }

        .car-crm-sidebar-panel .car-crm-sales-card:focus-visible {
            outline: 3px solid rgba(56, 189, 248, 0.42);
            outline-offset: 3px;
        }

        .car-crm-sidebar-panel .car-crm-sales-card:active {
            transform: translateY(-1px) scale(0.985);
        }

        .car-crm-sales-card .car-crm-sales-icon {
            background: linear-gradient(145deg, rgba(255, 255, 255, 0.27), rgba(255, 255, 255, 0.11)) !important;
            border: 1px solid rgba(255, 255, 255, 0.34);
            color: #ffffff !important;
            box-shadow:
                0 10px 22px rgba(15, 23, 42, 0.22),
                inset 0 1px 0 rgba(255, 255, 255, 0.30) !important;
            backdrop-filter: blur(10px);
        }

        .car-crm-sales-card .car-crm-sales-kicker {
            color: rgba(224, 242, 254, 0.78) !important;
        }

        .car-crm-sales-card .car-crm-sales-title {
            color: #ffffff !important;
            text-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);
        }

        .car-crm-sales-card .car-crm-sales-arrow {
            background: rgba(255, 255, 255, 0.12);
            border: 1px solid rgba(255, 255, 255, 0.22);
            color: #ffffff;
            transition: transform 180ms ease, background-color 180ms ease;
        }

        .car-crm-sales-card:hover .car-crm-sales-arrow {
            background: rgba(255, 255, 255, 0.20);
            transform: translateX(2px);
        }

        .car-crm-sidebar-panel .car-crm-sales-card-active {
            border-color: rgba(253, 230, 138, 0.78) !important;
            box-shadow:
                0 20px 42px rgba(30, 64, 175, 0.34),
                0 0 0 2px rgba(250, 204, 21, 0.18),
                inset 0 1px 0 rgba(255, 255, 255, 0.30) !important;
        }

        @media (prefers-reduced-motion: reduce) {
            .car-crm-sidebar-panel .car-crm-sales-card,
            .car-crm-sales-card .car-crm-sales-arrow {
                transition: none;
            }
        }

        [data-sidebar-open].car-crm-sidebar-open {
            min-height: 44px;
            padding: 7px 14px 7px 10px;
            border-radius: 18px !important;
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.38), rgba(191, 219, 254, 0.20)) !important;
            border-color: rgba(96, 165, 250, 0.30) !important;
            color: #1d4ed8 !important;
            box-shadow:
                0 10px 26px rgba(30, 64, 175, 0.10),
                inset 0 1px 0 rgba(255, 255, 255, 0.48) !important;
            -webkit-backdrop-filter: blur(14px) saturate(145%);
            backdrop-filter: blur(14px) saturate(145%);
            transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
        }

        [data-sidebar-open].car-crm-sidebar-open:hover {
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.54), rgba(191, 219, 254, 0.30)) !important;
            border-color: rgba(59, 130, 246, 0.40) !important;
            box-shadow:
                0 13px 30px rgba(30, 64, 175, 0.14),
                inset 0 1px 0 rgba(255, 255, 255, 0.64) !important;
            transform: translateY(-1px);
        }

        [data-sidebar-open].car-crm-sidebar-open:focus-visible {
            outline: 3px solid rgba(59, 130, 246, 0.30);
            outline-offset: 3px;
        }

        [data-sidebar-open].car-crm-sidebar-open:active {
            transform: translateY(0) scale(0.97);
        }

        .car-crm-sidebar-open-icon {
            color: #2563eb;
            opacity: 0.92;
            filter: drop-shadow(0 2px 5px rgba(37, 99, 235, 0.16));
        }
    `;

    document.head.appendChild(style);
}

function currentCarCrmPage() {
    const page = window.location.pathname.split('/').pop() || 'index.html';
    return (page || 'index.html') + (page === 'lead-data.html' && location.hash === '#leads' ? '#leads' : '');
}

function iconColorClass(color, isActive) {
    if (isActive) return 'bg-white text-blue-600 shadow-sm';

    const colors = {
        blue: 'bg-blue-50 text-blue-600',
        sky: 'bg-sky-50 text-sky-600',
        amber: 'bg-amber-50 text-amber-600',
        emerald: 'bg-emerald-50 text-emerald-600',
        rose: 'bg-rose-50 text-rose-600',
        indigo: 'bg-indigo-50 text-indigo-600'
    };

    return colors[color] || 'bg-slate-100 text-slate-500';
}

function navItemHtml(item, activePage) {
    const isActive = item.href === activePage
        || (item.href === 'lead-data.html#leads' && activePage === 'lead-data.html');

    const linkClass = isActive
        ? 'car-crm-nav-link car-crm-nav-link-active flex items-center gap-3 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm'
        : 'car-crm-nav-link flex items-center gap-3 rounded-2xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900';

    const iconClass = `car-crm-nav-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base font-bold ${iconColorClass(item.color, isActive)}`;

    return `
        <a href="${item.href}" class="${linkClass}">
            <span class="${iconClass}">${item.icon}</span>
            <span class="flex-1">${item.label}</span>
        </a>
    `;
}

function renderCarCrmSidebar() {
    const host = document.querySelector('[data-car-crm-sidebar]');
    if (!host) return;

    ensureCarCrmSidebarStyles();

    const activePage = currentCarCrmPage();
    const pageTitle = CAR_CRM_TITLES[activePage] || 'CAR CRM';
    const navLinks = CAR_CRM_NAV.map(item => navItemHtml(item, activePage)).join('');
    const salesCardActive = activePage === 'sales-dashboard.html';
    host.innerHTML = `
        <button type="button" data-sidebar-open aria-label="เปิดเมนูด้านข้าง" title="เปิดเมนู" class="car-crm-sidebar-open fixed left-4 top-4 z-50 inline-flex items-center gap-2 rounded-2xl border text-sm font-bold">
            <span class="car-crm-sidebar-open-icon inline-flex h-7 w-7 items-center justify-center" aria-hidden="true">
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25">
                    <path stroke-linecap="round" d="M4 7h16M4 12h16M4 17h16"></path>
                </svg>
            </span>
            <span>เมนู</span>
        </button>

        <div data-sidebar-overlay class="fixed inset-0 z-40 hidden bg-slate-900/20 backdrop-blur-sm lg:hidden"></div>

        <aside data-sidebar-panel class="car-crm-sidebar-panel fixed inset-y-0 left-0 z-50 flex w-72 -translate-x-full flex-col border-r border-slate-200 bg-white/85 text-slate-900 shadow-xl backdrop-blur-2xl transition-transform duration-200 lg:z-40 lg:shadow-none">
            
            <div class="px-5 py-6">
                <div class="flex items-center gap-3">
                    <div class="car-crm-brand-mark flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-sm font-extrabold text-white shadow-sm">
                        CRM
                    </div>

                    <div class="min-w-0">
                        <div class="car-crm-brand-title truncate text-lg font-extrabold leading-tight text-slate-900">CAR CRM</div>
                        <div class="car-crm-brand-subtitle mt-0.5 text-xs font-medium text-slate-500">จัดการคิวติดตั้งฟิล์ม</div>
                    </div>

                    <button type="button" data-sidebar-close aria-label="ปิดเมนูด้านข้าง" title="ปิดเมนู" class="car-crm-close ml-auto inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-blue-200 bg-white/90 px-3 text-sm font-bold text-blue-700 shadow-sm transition-all">
                        <span>ปิด</span>
                        <svg aria-hidden="true" focusable="false" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path stroke-linecap="round" d="M6 6l12 12M18 6 6 18"></path>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="car-crm-divider mx-5 h-px bg-slate-200"></div>

            <nav class="flex-1 overflow-y-auto px-4 py-5">
                <div>
                    <div class="car-crm-section-label mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                        Main
                    </div>

                    <div class="space-y-0.5">
                        ${navLinks}
                    </div>
                </div>

                <div class="car-crm-operations mt-7 border-t border-slate-200 pt-5">
                    <div class="car-crm-section-label mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                        Operations
                    </div>

                    <a href="https://solar-film.github.io/BB/" target="_blank" rel="noopener noreferrer" class="car-crm-nav-link flex items-center gap-3 rounded-2xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
                        <span class="car-crm-nav-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-base font-bold text-sky-600">BB</span>
                        <span class="flex-1">meeting</span>
                    </a>

                    <a href="accounting.html" target="_blank" rel="noopener noreferrer" class="car-crm-nav-link mt-0.5 flex items-center gap-3 rounded-2xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
                        <span class="car-crm-nav-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-base">💳</span>
                        <span class="flex-1">ฝ่ายบัญชี</span>
                    </a>

                    <a href="technician-queue.html" target="_blank" rel="noopener noreferrer" class="car-crm-nav-link mt-0.5 flex items-center gap-3 rounded-2xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
                        <span class="car-crm-nav-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-base">🔧</span>
                        <span class="flex-1">ทีมช่าง</span>
                    </a>
                </div>
            </nav>

            <a href="sales-dashboard.html" aria-label="ดูราคาขายเดือนนี้" ${salesCardActive ? 'aria-current="page"' : ''} class="car-crm-sales-card m-4 block rounded-3xl border p-4 ${salesCardActive ? 'car-crm-sales-card-active' : ''}">
                <div class="relative z-10 flex items-center gap-3.5">
                    <div class="car-crm-sales-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl font-black">
                        ฿
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="car-crm-sales-kicker mb-0.5 text-[9px] font-bold uppercase tracking-[0.18em]">Monthly Sales</div>
                        <div class="car-crm-sales-title truncate text-base font-extrabold">ราคาขายเดือนนี้</div>
                    </div>
                    <span class="car-crm-sales-arrow flex h-8 w-8 shrink-0 items-center justify-center rounded-full" aria-hidden="true">
                        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m9 5 7 7-7 7"></path>
                        </svg>
                    </span>
                </div>
            </a>
        </aside>

        <header class="bg-white/90 px-4 py-4 pl-28 text-slate-900 shadow-sm ring-1 ring-slate-200 backdrop-blur lg:hidden">
            <div class="text-lg font-bold">${pageTitle}</div>
        </header>
    `;

    const panel = host.querySelector('[data-sidebar-panel]');
    const overlay = host.querySelector('[data-sidebar-overlay]');
    const openButton = host.querySelector('[data-sidebar-open]');
    const closeButton = host.querySelector('[data-sidebar-close]');
    const STORAGE_KEY = 'carCrmSidebarCollapsed';

    const isDesktop = () => window.innerWidth >= 1024;

    const setDesktopCollapsed = collapsed => {
        document.body.classList.toggle('car-crm-sidebar-collapsed', collapsed);
        localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
        openButton.classList.toggle('hidden', !collapsed);
        if (collapsed) {
            panel.classList.add('-translate-x-full');
        } else {
            panel.classList.remove('-translate-x-full');
        }
    };

    const openSidebar = () => {
        if (isDesktop()) {
            setDesktopCollapsed(false);
            return;
        }
        panel.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
    };

    const closeSidebar = () => {
        if (isDesktop()) {
            setDesktopCollapsed(true);
            return;
        }
        panel.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    };

    openButton?.addEventListener('click', openSidebar);
    closeButton?.addEventListener('click', closeSidebar);
    overlay?.addEventListener('click', closeSidebar);

    host.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth < 1024) closeSidebar();
        });
    });

    window.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeSidebar();
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth >= 1024) {
            overlay.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
            setDesktopCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
        } else {
            panel.classList.add('-translate-x-full');
            document.body.classList.remove('car-crm-sidebar-collapsed');
            openButton.classList.remove('hidden');
        }
    });

    if (isDesktop()) {
        setDesktopCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
    } else {
        panel.classList.add('-translate-x-full');
        openButton.classList.remove('hidden');
    }
}

document.addEventListener('DOMContentLoaded', renderCarCrmSidebar);
