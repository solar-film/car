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
})();
