(function () {
  'use strict';

  const Core = window.CarCrmMobileCore;
  if (!Core) throw new Error('ไม่พบ mobile core');

  const SHEET_ID = '1u__xYWoWZpmrnquc-Fpk19WtpcrckxSd0-_G35NWxXQ';
  const MOBILE_PAYIN_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzo78uTuceUQJSsOdGmzbxvrbO9as1683dqcHCPzIzAOc33t-MyuAJH_gJ0ShSbAUFuxw/exec';
  const WRITE_TOKEN_KEY = 'carCrmWriteToken';
  const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
  const MAX_UPLOAD_IMAGE_BYTES = 3 * 1024 * 1024;
  const PAYIN_PROOF_SLOT_COUNT = 4;
  const PAYIN_REQUIRED_BACKEND_VERSION = '2026-09-23-payin-four-proofs';
  const SHEETS = Object.freeze({ bookings: 'Bookings', customers: 'Customer', payIns: 'PayIn' });
  let payInBackendVersionPromise = null;

  const state = {
    appointments: [],
    selectedDate: Core.dateKeyFromDate(new Date()),
    currentJob: null,
    payInAvailable: true,
    loading: false,
    saving: false,
    toastTimer: null,
    proofs: {
      1: makeEmptyProofState(),
      2: makeEmptyProofState(),
      3: makeEmptyProofState(),
      4: makeEmptyProofState()
    }
  };

  const dom = {};

  function makeEmptyProofState(existing = '') {
    return { existing: Core.textValue(existing), blob: null, previewUrl: '', requestId: '', processing: false, uploaded: false, error: '' };
  }

  function cacheDom() {
    [
      'connectionText', 'refreshButton', 'previousDateButton', 'nextDateButton', 'todayButton', 'dateFilter',
      'searchInput', 'selectedDateLabel', 'appointmentCount', 'salesTotal', 'messageBox', 'lastUpdated', 'loadingState',
      'emptyState', 'tableWrap', 'scheduleBody', 'payInDialog', 'closeDialogButton', 'cancelPayInButton',
      'payInForm', 'payInTitle', 'formJobId', 'formJobPrice', 'formCustomer', 'formCar', 'paymentStatus',
      'paymentType', 'paymentAmount', 'billNumber', 'quotationNumber', 'paymentNote', 'formMessage',
      'savePayInButton', 'toast'
    ].forEach(id => { dom[id] = document.getElementById(id); });
  }

  function bindEvents() {
    dom.refreshButton.addEventListener('click', () => loadData());
    dom.previousDateButton.addEventListener('click', () => shiftSelectedDate(-1));
    dom.nextDateButton.addEventListener('click', () => shiftSelectedDate(1));
    dom.todayButton.addEventListener('click', () => setSelectedDate(Core.dateKeyFromDate(new Date())));
    dom.dateFilter.addEventListener('change', event => setSelectedDate(event.target.value));
    dom.searchInput.addEventListener('input', renderSchedule);
    dom.scheduleBody.addEventListener('click', event => {
      const button = event.target.closest('[data-pay-job-id]');
      if (button) openPayIn(button.dataset.payJobId);
    });
    dom.closeDialogButton.addEventListener('click', closePayIn);
    dom.cancelPayInButton.addEventListener('click', closePayIn);
    dom.payInForm.addEventListener('submit', submitPayIn);
    dom.payInDialog.addEventListener('cancel', event => {
      event.preventDefault();
      closePayIn();
    });
    dom.payInDialog.addEventListener('click', event => {
      if (event.target === dom.payInDialog) closePayIn();
    });

    document.querySelectorAll('[data-proof-input]').forEach(input => {
      input.addEventListener('change', event => selectProof(event, Number(input.dataset.proofInput)));
    });
    document.querySelectorAll('[data-remove-proof]').forEach(button => {
      button.addEventListener('click', () => removeNewProof(Number(button.dataset.removeProof)));
    });

    window.addEventListener('online', updateConnectionState);
    window.addEventListener('offline', updateConnectionState);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && navigator.onLine) updateConnectionState();
    });
  }

  function initialise() {
    cacheDom();
    bindEvents();
    const requestedDate = new URLSearchParams(window.location.search).get('date');
    if (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '')) state.selectedDate = requestedDate;
    dom.dateFilter.value = state.selectedDate;
    updateConnectionState();
    renderSchedule();
    loadData();
    registerServiceWorker();
  }

  function sheetCsvUrl(sheetName) {
    const url = new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`);
    url.searchParams.set('tqx', 'out:csv');
    url.searchParams.set('sheet', sheetName);
    url.searchParams.set('_', String(Date.now()));
    return url.toString();
  }

  function isInvalidCsvResponse(text) {
    const normalized = String(text || '').trim().toLowerCase();
    return !normalized || normalized.startsWith('<!doctype html') || normalized.startsWith('<html') || normalized.includes('invalid query');
  }

  async function fetchCsv(sheetName) {
    const response = await fetch(sheetCsvUrl(sheetName), { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error(`อ่านชีต ${sheetName} ไม่สำเร็จ (${response.status})`);
    const text = await response.text();
    if (isInvalidCsvResponse(text)) throw new Error(`ไม่สามารถเข้าถึงชีต ${sheetName}`);
    return Core.parseCsv(text);
  }

  async function loadData(options = {}) {
    if (state.loading) return;
    state.loading = true;
    dom.refreshButton.disabled = true;
    dom.refreshButton.classList.add('is-spinning');
    if (!options.silent) {
      dom.loadingState.classList.remove('hidden');
      dom.tableWrap.classList.add('hidden');
      dom.emptyState.classList.add('hidden');
    }
    hideMessage();

    try {
      const [bookings, customers, payInLoad] = await Promise.all([
        fetchCsv(SHEETS.bookings),
        fetchCsv(SHEETS.customers),
        fetchCsv(SHEETS.payIns)
          .then(data => ({ data, error: null }))
          .catch(error => ({ data: [], error }))
      ]);
      state.payInAvailable = !payInLoad.error;
      state.appointments = Core.buildAppointments(bookings, customers, payInLoad.data);
      dom.lastUpdated.textContent = `อัปเดต ${new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(new Date())} น.`;
      updateConnectionState();
      renderSchedule();
      if (payInLoad.error) {
        showMessage('ตารางนัดหมายพร้อมใช้งาน แต่ยังอ่าน PayIn ไม่ได้ จึงปิดปุ่มบันทึกชั่วคราว กรุณากดรีเฟรชอีกครั้ง');
      }
    } catch (error) {
      showMessage(navigator.onLine ? error.message : 'อุปกรณ์ออฟไลน์ กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่', 'error');
      dom.loadingState.classList.add('hidden');
      if (!state.appointments.length) {
        dom.tableWrap.classList.add('hidden');
        dom.emptyState.classList.remove('hidden');
      } else {
        renderSchedule();
      }
    } finally {
      state.loading = false;
      dom.refreshButton.disabled = false;
      dom.refreshButton.classList.remove('is-spinning');
    }
  }

  function setSelectedDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return;
    state.selectedDate = value;
    dom.dateFilter.value = value;
    renderSchedule();
  }

  function shiftSelectedDate(days) {
    const date = new Date(`${state.selectedDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return;
    date.setDate(date.getDate() + days);
    setSelectedDate(Core.dateKeyFromDate(date));
  }

  function selectedDateLabel() {
    const date = new Date(`${state.selectedDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return state.selectedDate;
    return new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }

  function renderSchedule() {
    if (!dom.scheduleBody) return;
    const appointments = Core.filterAppointments(state.appointments, state.selectedDate, dom.searchInput.value);
    dom.selectedDateLabel.textContent = selectedDateLabel();
    dom.appointmentCount.textContent = `${appointments.length.toLocaleString('th-TH')} คิว`;
    const salesTotal = appointments.reduce((total, appointment) => total + (Number(appointment.price) || 0), 0);
    dom.salesTotal.textContent = `${formatMoney(salesTotal)} บาท`;
    dom.loadingState.classList.toggle('hidden', !state.loading || state.appointments.length > 0);
    dom.emptyState.classList.toggle('hidden', appointments.length > 0 || state.loading);
    dom.tableWrap.classList.toggle('hidden', appointments.length === 0);
    dom.scheduleBody.innerHTML = appointments.map(renderAppointmentRow).join('');
  }

  function renderAppointmentRow(job) {
    const payIn = job.payIn;
    const paymentKind = Core.paymentKind(payIn);
    const statusKind = Core.statusKind(job.status);
    const paymentText = !state.payInAvailable ? 'PayIn ไม่พร้อม' : (payIn && payIn.status ? payIn.status : 'ยังไม่มี PayIn');
    const buttonText = !state.payInAvailable ? 'PayIn<br>ไม่พร้อม' : (payIn ? 'แก้ไข<br>PayIn' : 'บันทึก<br>PayIn');
    const phoneDigits = Core.textValue(job.phone).replace(/[^\d+]/g, '');
    const phoneLink = phoneDigits
      ? `<a class="phone-link" href="tel:${Core.escapeHtml(phoneDigits)}">${Core.escapeHtml(job.phone)}</a>`
      : '';
    const amountText = job.price > 0 ? `${formatMoney(job.price)} บาท` : 'ไม่ระบุยอด';
    const proofText = payIn && payIn.hasProof ? '✓ มีสลิป' : 'ยังไม่มีสลิป';

    return `<tr>
      <td class="time-cell">
        <strong>${Core.escapeHtml(job.time)}</strong>
        <span>${Core.escapeHtml(job.id)}</span>
      </td>
      <td>
        <div class="appointment-main">
          <div class="customer-line"><strong>${Core.escapeHtml(job.customerName)}</strong>${phoneLink}</div>
          <div class="car-line">${Core.escapeHtml(job.carModel)} · ${Core.escapeHtml(job.plate)}</div>
          <div class="install-line">${Core.escapeHtml(job.film)} · ${Core.escapeHtml(job.installPosition)}</div>
          <div class="meta-line">
            <span class="badge status-${statusKind}">สถานะงาน: ${Core.escapeHtml(job.status)}</span>
            <span class="badge ${paymentKind}">${Core.escapeHtml(paymentText)}</span>
            <span class="price-text">${Core.escapeHtml(amountText)}</span>
          </div>
        </div>
      </td>
      <td class="pay-column">
        <div class="pay-cell">
          <button class="pay-button${payIn ? ' has-payment' : ''}" type="button"${state.payInAvailable ? ` data-pay-job-id="${Core.escapeHtml(job.id)}"` : ' disabled aria-label="PayIn ไม่พร้อมใช้งานชั่วคราว"'}>${buttonText}</button>
          <span class="proof-indicator${payIn && payIn.hasProof ? ' has-proof' : ''}">${proofText}</span>
        </div>
      </td>
    </tr>`;
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(Number(value) || 0);
  }

  function showMessage(message, kind = '') {
    dom.messageBox.textContent = message;
    dom.messageBox.className = `message${kind ? ` ${kind}` : ''}`;
  }

  function hideMessage() {
    dom.messageBox.textContent = '';
    dom.messageBox.className = 'message hidden';
  }

  function updateConnectionState() {
    dom.connectionText.textContent = navigator.onLine ? 'พร้อมใช้งานออนไลน์' : 'ออฟไลน์ — อ่าน/บันทึกข้อมูลไม่ได้';
  }

  function openPayIn(jobId) {
    if (!state.payInAvailable) {
      showToast('PayIn ยังไม่พร้อม กรุณากดรีเฟรชข้อมูล');
      return;
    }
    const job = state.appointments.find(item => item.id === jobId);
    if (!job) return;
    state.currentJob = job;
    dom.payInForm.reset();
    hideFormMessage();

    const payIn = job.payIn;
    dom.payInTitle.textContent = payIn ? 'แก้ไข PayIn' : 'บันทึก PayIn';
    dom.formJobId.textContent = job.id;
    dom.formJobPrice.textContent = job.price > 0 ? `${formatMoney(job.price)} บาท` : '—';
    dom.formCustomer.textContent = job.customerName || '—';
    dom.formCar.textContent = `${job.carModel || '—'} / ${job.plate || '—'}`;
    dom.paymentStatus.value = payIn && payIn.status ? payIn.status : 'ชำระครบ';
    if (!Array.from(dom.paymentStatus.options).some(option => option.value === dom.paymentStatus.value)) dom.paymentStatus.value = 'ชำระครบ';
    dom.paymentType.value = payIn ? payIn.paymentType : '';
    if (!Array.from(dom.paymentType.options).some(option => option.value === dom.paymentType.value)) dom.paymentType.value = '';
    dom.paymentAmount.value = payIn ? payIn.amount : (job.price || '');
    dom.billNumber.value = payIn ? payIn.billNumber : '';
    dom.quotationNumber.value = payIn ? payIn.quotation : '';
    dom.paymentNote.value = payIn ? payIn.note : '';

    resetProofs(payIn ? payIn.proofs : []);
    setSaving(false);
    if (typeof dom.payInDialog.showModal === 'function') dom.payInDialog.showModal();
    else dom.payInDialog.setAttribute('open', '');
    document.body.classList.add('dialog-open');
    window.setTimeout(() => dom.paymentStatus.focus(), 30);
  }

  function closePayIn() {
    if (state.saving) return;
    resetProofs([]);
    state.currentJob = null;
    if (typeof dom.payInDialog.close === 'function') dom.payInDialog.close();
    else dom.payInDialog.removeAttribute('open');
    document.body.classList.remove('dialog-open');
  }

  function resetProofs(existingProofs) {
    Array.from({ length: PAYIN_PROOF_SLOT_COUNT }, (_, index) => index + 1).forEach(slot => {
      revokePreview(state.proofs[slot]);
      state.proofs[slot] = makeEmptyProofState(existingProofs && existingProofs[slot - 1]);
      document.querySelectorAll(`[data-proof-input="${slot}"]`).forEach(input => { input.value = ''; });
      renderProof(slot);
    });
  }

  function revokePreview(proofState) {
    if (proofState && proofState.previewUrl) URL.revokeObjectURL(proofState.previewUrl);
  }

  function existingProofUrl(rawValue) {
    const raw = Core.textValue(rawValue);
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^[-\w]{25,}$/.test(raw)) return `https://drive.google.com/file/d/${encodeURIComponent(raw)}/view`;
    let clean = raw.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\//, '');
    const appName = clean.split('/')[0] || 'CAR_CRM-691939189';
    return `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(appName)}&tableName=PayIn&fileName=${encodeURIComponent(clean)}`;
  }

  function renderProof(slot) {
    const proof = state.proofs[slot];
    const card = document.querySelector(`[data-proof-card="${slot}"]`);
    const preview = document.getElementById(`proofPreview${slot}`);
    const status = document.getElementById(`proofStatus${slot}`);
    const removeButton = document.querySelector(`[data-remove-proof="${slot}"]`);
    card.classList.toggle('is-processing', proof.processing);
    removeButton.classList.toggle('hidden', !proof.blob);
    status.className = 'proof-status';

    if (proof.processing) {
      preview.innerHTML = '<span>กำลังเตรียมรูป…</span>';
      status.textContent = 'กำลังย่อและตรวจสอบรูป';
      return;
    }
    if (proof.blob && proof.previewUrl) {
      preview.innerHTML = `<img src="${Core.escapeHtml(proof.previewUrl)}" alt="ตัวอย่างสลิป ${slot}">`;
      status.textContent = `${formatFileSize(proof.blob.size)} · พร้อมอัปโหลด`;
      status.classList.add('success');
    } else if (proof.existing) {
      const link = existingProofUrl(proof.existing);
      preview.innerHTML = `<a class="existing-proof-link" href="${Core.escapeHtml(link)}" target="_blank" rel="noopener noreferrer" aria-label="เปิดรูปหลักฐานเดิม ${slot}">
        <img src="${Core.escapeHtml(link)}" alt="รูปหลักฐานเดิม ${slot}" referrerpolicy="no-referrer">
        <span class="existing-proof-fallback" hidden>แตะเพื่อเปิดรูปเดิม</span>
      </a>`;
      const existingImage = preview.querySelector('img');
      const fallback = preview.querySelector('.existing-proof-fallback');
      existingImage.addEventListener('error', () => {
        existingImage.hidden = true;
        fallback.hidden = false;
      }, { once: true });
      status.textContent = 'เลือกรูปใหม่เพื่อแทนที่ช่องนี้';
    } else {
      preview.innerHTML = '<span>ยังไม่มีรูป</span>';
      status.textContent = '';
    }
    if (proof.error) {
      status.textContent = proof.error;
      status.className = 'proof-status error';
    }
  }

  async function selectProof(event, slot) {
    const input = event.currentTarget;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file || !state.proofs[slot] || state.saving) return;

    const proof = state.proofs[slot];
    proof.error = '';
    proof.processing = true;
    renderProof(slot);
    try {
      const blob = await prepareImage(file);
      revokePreview(proof);
      proof.blob = blob;
      proof.previewUrl = URL.createObjectURL(blob);
      proof.requestId = createRequestId();
      proof.uploaded = false;
    } catch (error) {
      proof.blob = null;
      proof.requestId = '';
      proof.error = error.message;
      showToast(error.message);
    } finally {
      proof.processing = false;
      renderProof(slot);
    }
  }

  function removeNewProof(slot) {
    if (state.saving) return;
    const proof = state.proofs[slot];
    if (!proof) return;
    revokePreview(proof);
    proof.blob = null;
    proof.previewUrl = '';
    proof.requestId = '';
    proof.uploaded = false;
    proof.error = '';
    renderProof(slot);
  }

  async function loadDrawable(file) {
    if ('createImageBitmap' in window) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
      } catch (error) {
        try {
          const bitmap = await createImageBitmap(file);
          return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
        } catch (fallbackError) {
          // ใช้ Image ด้านล่างสำหรับเบราว์เซอร์ที่ยังไม่รองรับรูปแบบนี้ผ่าน ImageBitmap
        }
      }
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = objectUrl;
      await image.decode();
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(objectUrl) };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw new Error('เปิดรูปนี้ไม่ได้ กรุณาใช้รูป JPG, PNG หรือ WebP');
    }
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('ย่อรูปไม่สำเร็จ กรุณาลองเลือกรูปใหม่')), 'image/jpeg', quality);
    });
  }

  async function prepareImage(file) {
    if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error('รูปต้นฉบับใหญ่เกิน 20 MB');
    if (file.type && !file.type.startsWith('image/')) throw new Error('ไฟล์ที่เลือกไม่ใช่รูปภาพ');
    const drawable = await loadDrawable(file);
    try {
      if (!drawable.width || !drawable.height) throw new Error('ไม่พบขนาดของรูปที่เลือก');
      const attempts = [
        { maxEdge: 1600, quality: .82 },
        { maxEdge: 1400, quality: .74 },
        { maxEdge: 1200, quality: .67 },
        { maxEdge: 1000, quality: .60 }
      ];
      let lastBlob = null;
      for (const attempt of attempts) {
        const scale = Math.min(1, attempt.maxEdge / Math.max(drawable.width, drawable.height));
        const width = Math.max(1, Math.round(drawable.width * scale));
        const height = Math.max(1, Math.round(drawable.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('อุปกรณ์นี้ไม่สามารถย่อรูปได้');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(drawable.source, 0, 0, width, height);
        lastBlob = await canvasToBlob(canvas, attempt.quality);
        canvas.width = 1;
        canvas.height = 1;
        if (lastBlob.size <= MAX_UPLOAD_IMAGE_BYTES) return lastBlob;
      }
      throw new Error(`รูปยังใหญ่เกิน 3 MB หลังย่อ (${formatFileSize(lastBlob ? lastBlob.size : 0)})`);
    } finally {
      drawable.close();
    }
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function createRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(new Error('อ่านข้อมูลรูปไม่สำเร็จ'));
      reader.readAsDataURL(blob);
    });
  }

  function readWriteToken() {
    try { return Core.textValue(localStorage.getItem(WRITE_TOKEN_KEY)); }
    catch (error) { return ''; }
  }

  function saveWriteToken(token) {
    try { localStorage.setItem(WRITE_TOKEN_KEY, token); }
    catch (error) { /* ใช้ token รอบนี้ต่อได้ แม้พื้นที่จัดเก็บถูกปิด */ }
  }

  function clearWriteToken() {
    try { localStorage.removeItem(WRITE_TOKEN_KEY); }
    catch (error) { /* ไม่มีค่าที่ต้องล้าง */ }
  }

  function getWriteToken(forceNew = false) {
    if (forceNew) clearWriteToken();
    let token = forceNew ? '' : readWriteToken();
    if (!token) {
      token = Core.textValue(window.prompt('กรุณาใส่ Write Token สำหรับบันทึกข้อมูล (ใส่ครั้งแรกบนเครื่องนี้)'));
      if (token) saveWriteToken(token);
    }
    if (!token) throw new Error('ยกเลิกการบันทึก: ไม่พบ Write Token');
    return token;
  }

  function isWriteTokenError(message) {
    return /write\s*token/i.test(String(message || ''));
  }

  async function postWithWriteToken(payload) {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(MOBILE_PAYIN_SCRIPT_URL)) {
      throw new Error('ระบบอัปโหลดบนมือถือยังไม่ได้เชื่อมต่อ กรุณาแจ้งผู้ดูแล');
    }
    let token = getWriteToken(false);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(MOBILE_PAYIN_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ ...payload, token }),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'follow'
      });
      const responseText = await response.text();
      let result;
      try { result = JSON.parse(responseText); }
      catch (error) { throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง กรุณาลองใหม่'); }

      if (!result.success && isWriteTokenError(result.error)) {
        clearWriteToken();
        if (attempt === 0) {
          token = getWriteToken(true);
          continue;
        }
      }
      if (!result.success) throw new Error(result.error || 'บันทึกไม่สำเร็จ');
      return result;
    }
    throw new Error('Write Token ไม่ถูกต้อง');
  }

  async function verifyPayInBackendVersion() {
    if (!payInBackendVersionPromise) {
      payInBackendVersionPromise = fetch(`${MOBILE_PAYIN_SCRIPT_URL}?backendCheck=${Date.now()}`, {
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'follow'
      })
        .then(async response => {
          const responseText = await response.text();
          let result;
          try { result = JSON.parse(responseText); }
          catch (error) { throw new Error('ตรวจ backend PayIn ไม่สำเร็จ: เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง'); }
          if (result.backendVersion !== PAYIN_REQUIRED_BACKEND_VERSION) {
            throw new Error('Apps Script Web App ยังเป็นเวอร์ชันเก่า กรุณา Deploy เป็น New version ก่อนบันทึกรูป PayIn');
          }
          return result;
        })
        .catch(error => {
          payInBackendVersionPromise = null;
          throw error;
        });
    }
    return payInBackendVersionPromise;
  }

  async function submitPayIn(event) {
    event.preventDefault();
    if (state.saving || !state.currentJob) return;
    if (!navigator.onLine) {
      showFormMessage('อุปกรณ์ออฟไลน์ กรุณาเชื่อมต่ออินเทอร์เน็ตก่อนบันทึก');
      return;
    }
    if (!dom.payInForm.reportValidity()) return;
    if (Object.values(state.proofs).some(proof => proof.processing)) {
      showFormMessage('กรุณารอให้ระบบเตรียมรูปเสร็จก่อนบันทึก');
      return;
    }

    const job = state.currentJob;
    const existingPayIn = job.payIn;
    const payload = {
      action: 'upsertPayIn',
      sheetName: 'PayIn',
      JobID: job.id,
      'สถานะ': dom.paymentStatus.value,
      'ประเภทการชำระ': dom.paymentType.value,
      'ยอดเงิน(บาท)': dom.paymentAmount.value,
      'เลขที่บิล/ใบเสร็จ': dom.billNumber.value.trim(),
      'ใบเสนอราคา': dom.quotationNumber.value.trim(),
      'หมายเหตุ': dom.paymentNote.value.trim()
    };
    if (existingPayIn && existingPayIn.id) payload.recordId = existingPayIn.id;
    const proofSlots = Array.from({ length: PAYIN_PROOF_SLOT_COUNT }, (_, index) => index + 1);
    const uploadSlots = proofSlots.filter(slot => state.proofs[slot].blob);

    setSaving(true, 'กำลังบันทึกข้อมูล…');
    hideFormMessage();
    let metadataSaved = false;
    try {
      if (uploadSlots.length) {
        setSaving(true, 'กำลังตรวจระบบรูป PayIn…');
        await verifyPayInBackendVersion();
        setSaving(true, 'กำลังบันทึกข้อมูล…');
      }
      const payInResult = await postWithWriteToken(payload);
      if (!payInResult.verified) {
        throw new Error('ระบบยังยืนยันการบันทึกลงชีตไม่ได้ กรุณารีเฟรชข้อมูลแล้วลองอีกครั้ง');
      }
      const payId = Core.textValue(payInResult.id);
      if (uploadSlots.length && !payId) throw new Error('บันทึก PayIn แล้ว แต่ไม่พบ Pay_ID สำหรับผูกรูป');
      metadataSaved = true;

      const applySavedPayIn = () => {
        job.payIn = {
          id: payId,
          jobId: job.id,
          status: payload['สถานะ'],
          quotation: payload['ใบเสนอราคา'],
          billNumber: payload['เลขที่บิล/ใบเสร็จ'],
          paymentType: payload['ประเภทการชำระ'],
          amount: Number(payload['ยอดเงิน(บาท)']) || 0,
          note: payload['หมายเหตุ'],
          proofs: proofSlots.map(slot => state.proofs[slot].existing),
          hasProof: proofSlots.some(slot => Boolean(state.proofs[slot].existing))
        };
      };

      applySavedPayIn();

      try {
        for (let index = 0; index < uploadSlots.length; index += 1) {
          const slot = uploadSlots[index];
          const proof = state.proofs[slot];
          setSaving(true, `กำลังอัปโหลดรูป ${index + 1}/${uploadSlots.length}…`);
          const base64 = await blobToBase64(proof.blob);
          const uploadResult = await postWithWriteToken({
            action: 'attachPayInProof',
            sheetName: 'PayIn',
            recordId: payId,
            JobID: job.id,
            slot,
            mimeType: proof.blob.type || 'image/jpeg',
            base64,
            clientRequestId: proof.requestId
          });
          if (!uploadResult.verified) {
            throw new Error(`ระบบยังยืนยันการบันทึกรูป ${slot} ลงชีตไม่ได้ กรุณารีเฟรชข้อมูลแล้วลองอีกครั้ง`);
          }
          proof.existing = uploadResult.relativePath || proof.existing;
          revokePreview(proof);
          proof.blob = null;
          proof.previewUrl = '';
          proof.uploaded = true;
          renderProof(slot);
        }
      } catch (uploadError) {
        applySavedPayIn();
        showFormMessage(`บันทึกข้อมูล PayIn แล้ว แต่รูปยังไม่ได้บันทึกจริง: ${uploadError.message}`);
        showToast('รูปยังไม่ได้บันทึก');
        renderSchedule();
        setSaving(false);
        await loadData({ silent: true });
        return;
      }

      job.payIn = {
        id: payId,
        jobId: job.id,
        status: payload['สถานะ'],
        quotation: payload['ใบเสนอราคา'],
        billNumber: payload['เลขที่บิล/ใบเสร็จ'],
        paymentType: payload['ประเภทการชำระ'],
        amount: Number(payload['ยอดเงิน(บาท)']) || 0,
        note: payload['หมายเหตุ'],
        proofs: proofSlots.map(slot => state.proofs[slot].existing),
        hasProof: proofSlots.some(slot => Boolean(state.proofs[slot].existing))
      };
      showFormMessage('บันทึก PayIn และรูปสลิปเรียบร้อยแล้ว', 'success');
      showToast('บันทึก PayIn สำเร็จ');
      renderSchedule();
      window.setTimeout(async () => {
        setSaving(false);
        closePayIn();
        await loadData({ silent: true });
      }, 650);
    } catch (error) {
      const prefix = metadataSaved ? 'ข้อมูล PayIn บันทึกแล้ว แต่รูปยังไม่ครบ: ' : '';
      showFormMessage(prefix + error.message);
      setSaving(false);
    }
  }

  function setSaving(saving, label) {
    state.saving = saving;
    dom.savePayInButton.disabled = saving;
    dom.cancelPayInButton.disabled = saving;
    dom.closeDialogButton.disabled = saving;
    dom.savePayInButton.textContent = saving ? (label || 'กำลังบันทึก…') : 'บันทึก PayIn';
  }

  function showFormMessage(message, kind = '') {
    dom.formMessage.textContent = message;
    dom.formMessage.className = `form-message${kind ? ` ${kind}` : ''}`;
  }

  function hideFormMessage() {
    dom.formMessage.textContent = '';
    dom.formMessage.className = 'form-message hidden';
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.remove('hidden');
    state.toastTimer = window.setTimeout(() => dom.toast.classList.add('hidden'), 2800);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register('./sw.js?v=12', { scope: './' }).catch(error => console.warn('Service worker:', error.message));
  }

  initialise();
})();
