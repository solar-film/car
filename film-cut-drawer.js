// แผงฟอร์มตัดฟิล์ม (.film-cut-modal) สไลด์จากขวา: แถบลากขอบซ้ายปรับความกว้าง จำค่าไว้ในเครื่อง ดับเบิลคลิกคืนค่าเริ่มต้น
// แบบเดียวกับแผงข้อมูลการติดตั้ง (DESIGN-CAR-COST-REPORT.md ข้อ 4) · ใช้ร่วม index.html, technician-queue.html, technician.html
(function () {
  'use strict';
  const KEY = 'carFilmCutDrawerWidth';
  const MIN = 560;
  const maxWidth = () => Math.min(1400, window.innerWidth - 40);
  const defaultWidth = () => Math.min(1080, Math.round(window.innerWidth * .72));
  let preferred = 0;
  try { preferred = Number(localStorage.getItem(KEY)) || 0; } catch (_) { /* โหมดส่วนตัว: ใช้ค่าเริ่มต้น */ }

  const panels = [...document.querySelectorAll('.film-cut-modal > .film-cut-panel')];
  const handles = [];

  function apply(panel, handle, width = preferred) {
    const max = Math.max(MIN, maxWidth());
    const next = Math.max(MIN, Math.min(max, width || defaultWidth()));
    if (width) panel.style.setProperty('--fc-width', next + 'px');
    else panel.style.removeProperty('--fc-width');
    handle.setAttribute('aria-valuemax', String(max));
    handle.setAttribute('aria-valuenow', String(next));
    return next;
  }
  function save(width) {
    preferred = width ? Math.max(MIN, Math.min(maxWidth(), width)) : 0;
    handles.forEach(([panel, handle]) => apply(panel, handle));
    try { localStorage.setItem(KEY, String(preferred)); } catch (_) { /* ไม่จำค่าได้ ไม่กระทบการใช้งาน */ }
  }

  for (const panel of panels) {
    const handle = document.createElement('div');
    handle.className = 'film-cut-resize';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'ปรับความกว้างแผง');
    handle.setAttribute('aria-valuemin', String(MIN));
    handle.title = 'ลากเพื่อปรับความกว้าง · ดับเบิลคลิกเพื่อคืนค่า';
    handle.tabIndex = 0;
    panel.append(handle);
    handles.push([panel, handle]);
    apply(panel, handle);

    let startX = 0, startWidth = 0;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      startX = event.clientX;
      startWidth = panel.offsetWidth;
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (handle.hasPointerCapture(event.pointerId)) apply(panel, handle, startWidth + startX - event.clientX);
    });
    handle.addEventListener('lostpointercapture', () => save(panel.offsetWidth));
    handle.addEventListener('dblclick', () => save(0));
    handle.addEventListener('keydown', event => {
      const width = panel.offsetWidth;
      const sizes = { ArrowLeft: width + 32, ArrowRight: width - 32, Home: MIN, End: maxWidth(), Enter: 0 };
      if (!Object.prototype.hasOwnProperty.call(sizes, event.key)) return;
      event.preventDefault();
      save(sizes[event.key]);
    });
  }
  window.addEventListener('resize', () => handles.forEach(([panel, handle]) => apply(panel, handle)));

  if (!('showPopover' in HTMLElement.prototype)) return;

  const teamDropdowns = '.film-cut-modal details:is(.dt-team-dropdown, .team-check-dropdown)';
  let activeTeam;
  const panelSize = new ResizeObserver(placeTeamMenu);
  const drawerState = new MutationObserver(placeTeamMenu);

  function closeTeamMenu() {
    if (!activeTeam) return;
    const { dropdown, menu } = activeTeam;
    activeTeam = null;
    panelSize.disconnect();
    drawerState.disconnect();
    if (menu.matches(':popover-open')) menu.hidePopover();
    dropdown.open = false;
  }

  function placeTeamMenu() {
    if (!activeTeam) return;
    const { dropdown, trigger, menu, modal, scroller } = activeTeam;
    const rect = trigger.getBoundingClientRect();
    const table = scroller.getBoundingClientRect();
    if (!dropdown.isConnected || !dropdown.open || modal.matches('.hidden, [hidden]') ||
        !rect.width || rect.right <= table.left || rect.left >= table.right ||
        rect.bottom <= table.top || rect.top >= table.bottom) {
      closeTeamMenu();
      return;
    }

    const edge = 8;
    const gap = 5;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(Math.max(rect.width, 220), viewportWidth - edge * 2);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(edge, Math.min(rect.left, viewportWidth - width - edge))}px`;

    const below = Math.max(0, viewportHeight - rect.bottom - gap - edge);
    const above = Math.max(0, rect.top - gap - edge);
    const total = menu.scrollHeight + menu.offsetHeight - menu.clientHeight;
    const opensUp = total > below && above > below;
    menu.style.maxHeight = `${Math.max(1, Math.floor(opensUp ? above : below))}px`;
    menu.style.top = `${opensUp ? rect.top - gap - menu.offsetHeight : rect.bottom + gap}px`;
  }

  document.addEventListener('toggle', event => {
    const dropdown = event.target;
    if (!(dropdown instanceof HTMLDetailsElement) || !dropdown.matches(teamDropdowns)) return;
    if (!dropdown.open) {
      if (activeTeam?.dropdown === dropdown) closeTeamMenu();
      return;
    }
    if (activeTeam?.dropdown === dropdown) return;
    closeTeamMenu();

    const trigger = dropdown.querySelector('summary');
    const menu = dropdown.querySelector('.dt-team-menu, .team-check-menu');
    const panel = dropdown.closest('.film-cut-panel');
    const modal = dropdown.closest('.film-cut-modal');
    const scroller = dropdown.closest('.film-cut-table-scroll');
    if (!trigger || !menu || !panel || !scroller || modal.matches('.hidden, [hidden]')) return;

    // Keep the checkboxes inside the original form and place the menu above the scrollable table.
    menu.classList.add('film-cut-team-menu');
    menu.setAttribute('popover', 'manual');
    menu.showPopover();
    activeTeam = { dropdown, trigger, menu, panel, modal, scroller };
    placeTeamMenu();
    if (!activeTeam) return;
    panelSize.observe(panel);
    drawerState.observe(modal, { attributes: true, attributeFilter: ['class', 'hidden'] });
  }, true);
  document.addEventListener('scroll', event => {
    if (activeTeam && !activeTeam.menu.contains(event.target)) placeTeamMenu();
  }, true);
  document.addEventListener('transitionend', event => {
    if (event.target === activeTeam?.panel && event.propertyName === 'transform') placeTeamMenu();
  }, true);
  window.addEventListener('resize', placeTeamMenu);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !activeTeam) return;
    event.preventDefault();
    event.stopPropagation();
    const trigger = activeTeam.trigger;
    closeTeamMenu();
    trigger.focus({ preventScroll: true });
  }, true);
})();
