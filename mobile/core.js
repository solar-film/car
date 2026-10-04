(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CarCrmMobileCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function textValue(value, fallback = '') {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text === '' ? fallback : text;
  }

  function normalizeText(value) {
    return textValue(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function normalizeId(value) {
    return normalizeText(value).replace(/\s+/g, '');
  }

  function normalizeHeader(value) {
    return normalizeText(value).replace(/[\s_.\-/\\()[\]{}]+/g, '');
  }

  function normalizeStatus(value) {
    return normalizeText(value).replace(/[\s_.\-/\\()[\]{}:;,+]+/g, '');
  }

  function isCancelledStatus(value) {
    return normalizeStatus(value).includes('ยกเลิก');
  }

  function isFinishedStatus(value) {
    const status = normalizeStatus(value);
    return status.includes('เสร็จสิ้น') || status.includes('เสร็จแล้ว') || status === 'เสร็จ';
  }

  function escapeHtml(value) {
    return textValue(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function parseCsv(csvText) {
    const input = String(csvText || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < input.length; index += 1) {
      const character = input[index];
      if (quoted) {
        if (character === '"' && input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          field += character;
        }
        continue;
      }

      if (character === '"') {
        quoted = true;
      } else if (character === ',') {
        row.push(field);
        field = '';
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && input[index + 1] === '\n') index += 1;
        row.push(field);
        field = '';
        if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
        row = [];
      } else {
        field += character;
      }
    }

    if (field !== '' || row.length) {
      row.push(field);
      if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
    }

    if (!rows.length) return [];
    const usedHeaders = Object.create(null);
    const headers = rows[0].map((header, index) => {
      const base = textValue(header, `คอลัมน์_${index + 1}`);
      usedHeaders[base] = (usedHeaders[base] || 0) + 1;
      return usedHeaders[base] === 1 ? base : `${base}_${usedHeaders[base]}`;
    });

    return rows.slice(1).map(values => {
      const record = {};
      headers.forEach((header, index) => { record[header] = values[index] === undefined ? '' : values[index]; });
      return record;
    });
  }

  function getField(row, candidates, fallback = '') {
    if (!row || typeof row !== 'object') return fallback;
    const keys = Object.keys(row);
    const normalizedCandidates = candidates.map(normalizeHeader);
    let key = keys.find(item => normalizedCandidates.includes(normalizeHeader(item)));
    if (!key) {
      key = keys.find(item => {
        const normalizedKey = normalizeHeader(item);
        return normalizedCandidates.some(candidate => normalizedKey.includes(candidate) || candidate.includes(normalizedKey));
      });
    }
    return key ? textValue(row[key], fallback) : fallback;
  }

  function parseSheetDate(value) {
    const raw = textValue(value);
    if (!raw) return null;

    const dateMatch = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s|$)/);
    if (dateMatch) {
      let year = Number(dateMatch[3]);
      if (year > 2400) year -= 543;
      const month = Number(dateMatch[2]);
      const day = Number(dateMatch[1]);
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return date;
      return null;
    }

    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s|$)/);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return date;
    }
    return null;
  }

  function dateKeyFromDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function dateKey(value) {
    return dateKeyFromDate(value instanceof Date ? value : parseSheetDate(value));
  }

  function formatDisplayTime(value) {
    const raw = textValue(value, '-');
    const match = raw.match(/(\d{1,2}):(\d{2})/);
    if (!match) return raw;
    return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
  }

  function timeSortValue(value) {
    const match = textValue(value).match(/(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
  }

  function numericValue(value) {
    const number = Number.parseFloat(textValue(value, '0').replace(/[^\d.-]/g, ''));
    return Number.isFinite(number) ? number : 0;
  }

  function buildCustomerMap(rows) {
    const map = Object.create(null);
    (rows || []).forEach(row => {
      const id = getField(row, ['CustID', 'CustomerID']);
      if (id) map[normalizeId(id)] = row;
    });
    return map;
  }

  function buildPayInMap(rows) {
    const map = Object.create(null);
    const mergePayIn = (existing, incoming) => {
      if (!existing) return incoming;
      const merged = { ...existing };
      ['status', 'quotation', 'billNumber', 'paymentType', 'amount', 'note', 'raw'].forEach(key => {
        const value = incoming[key];
        if (value !== undefined && value !== null && value !== '' && value !== '-') merged[key] = value;
      });
      merged.proofs = [0, 1, 2, 3].map(index => incoming.proofs[index] || existing.proofs[index] || '');
      merged.hasProof = merged.proofs.some(Boolean);
      if (incoming.hasProof || (!merged.id && incoming.id)) merged.id = incoming.id;
      return merged;
    };

    (rows || []).forEach(row => {
      const jobId = getField(row, ['JobID', 'Job ID']);
      if (!jobId) return;
      const payIn = {
        id: getField(row, ['Pay_ID', 'PayID']),
        jobId,
        status: getField(row, ['สถานะ', 'Status']),
        quotation: getField(row, ['ใบเสนอราคา', 'Quotation', 'Quote']),
        billNumber: getField(row, ['เลขที่บิล/ใบเสร็จ', 'เลขที่บิล', 'ใบเสร็จ', 'Receipt']),
        paymentType: getField(row, ['ประเภทการชำระ', 'วิธีการชำระ', 'PaymentType']),
        amount: numericValue(getField(row, ['ยอดเงิน(บาท)', 'ยอดเงิน', 'ยอดชำระ', 'Amount'])),
        note: getField(row, ['หมายเหตุ', 'Note']),
        proofs: [1, 2, 3, 4].map(slot => getField(row, [`หลักฐาน_${slot}`])),
        raw: row
      };
      payIn.hasProof = payIn.proofs.some(Boolean);
      const key = normalizeId(jobId);
      map[key] = mergePayIn(map[key], payIn);
    });
    return map;
  }

  function buildAppointments(bookingRows, customerRows, payInRows) {
    const customers = buildCustomerMap(customerRows);
    const payIns = buildPayInMap(payInRows);

    return (bookingRows || []).map(row => {
      const id = getField(row, ['JobID', 'Job ID']);
      const custId = getField(row, ['CustID', 'CustomerID']);
      const status = getField(row, ['Status', 'สถานะงาน', 'สถานะ']);
      if (!id || isCancelledStatus(status)) return null;

      const customer = customers[normalizeId(custId)] || {};
      const payIn = payIns[normalizeId(id)] || null;
      const appointment = {
        id,
        custId,
        customerName: getField(customer, ['ชื่อลูกค้า', 'ชื่อ', 'CustomerName'], '-'),
        phone: getField(customer, ['เบอร์โทรศัพท์', 'เบอร์โทร', 'โทรศัพท์', 'Phone']),
        sales: getField(row, ['พน.ขาย', 'พนง.ขาย', 'พนักงานขาย', 'Sales'], '-'),
        installDate: getField(row, ['วันที่ติดตั้ง', 'วันที่นัด', 'Date']),
        installDateKey: dateKey(getField(row, ['วันที่ติดตั้ง', 'วันที่นัด', 'Date'])),
        time: formatDisplayTime(getField(row, ['เวลานัด', 'เวลา', 'Time'], '-')),
        carModel: getField(row, ['รุ่นรถยนต์', 'รุ่นรถ', 'CarModel'], '-'),
        plate: getField(row, ['ทะเบียนรถ', 'ทะเบียน', 'Plate'], '-'),
        film: getField(row, ['ยี่ห้อฟิล์ม', 'ฟิล์ม', 'Film'], '-'),
        installPosition: getField(row, ['ตำแหน่งติดตั้ง', 'การติดตั้ง', 'ประเภทการติดตั้ง', 'ตำแหน่ง'], '-'),
        price: numericValue(getField(row, ['ยอดขาย', 'มูลค่าสินค้า', 'ราคา'], '0')),
        status: status || '-',
        note: getField(row, ['หมายเหตุ', 'Note']),
        payIn
      };
      appointment.searchText = normalizeText([
        appointment.id,
        appointment.customerName,
        appointment.phone,
        appointment.carModel,
        appointment.plate,
        appointment.film,
        appointment.installPosition,
        appointment.sales,
        appointment.status,
        payIn ? `${payIn.status} ${payIn.billNumber} ${payIn.paymentType}` : ''
      ].join(' '));
      return appointment;
    }).filter(Boolean).sort((a, b) => {
      const dateCompare = a.installDateKey.localeCompare(b.installDateKey);
      if (dateCompare) return dateCompare;
      const timeCompare = timeSortValue(a.time) - timeSortValue(b.time);
      return timeCompare || a.id.localeCompare(b.id, 'th');
    });
  }

  function filterAppointments(appointments, selectedDateKey, query) {
    const normalizedQuery = normalizeText(query);
    return (appointments || []).filter(appointment => {
      if (isCancelledStatus(appointment.status)) return false;
      if (selectedDateKey && appointment.installDateKey !== selectedDateKey) return false;
      return !normalizedQuery || appointment.searchText.includes(normalizedQuery);
    });
  }

  function paymentKind(payIn) {
    if (!payIn || !textValue(payIn.status)) return 'none';
    const status = normalizeStatus(payIn.status);
    if (status.includes('มัดจำ') || status.includes('บางส่วน') || status.includes('partial') || status.includes('deposit')) return 'partial';
    if (status.includes('รอชำระ') || status.includes('ยังไม่') || status.includes('ค้าง') || status.includes('เครดิต') || status.includes('unpaid') || status.includes('credit')) return 'unpaid';
    if (status.includes('ยกเว้น') || status.includes('exempt')) return 'exempt';
    return 'paid';
  }

  function statusKind(status) {
    if (isFinishedStatus(status)) return 'done';
    const normalized = normalizeStatus(status);
    if (normalized.includes('ติดตั้ง') || normalized.includes('ดำเนิน') || normalized.includes('กำลัง')) return 'progress';
    return 'wait';
  }

  return Object.freeze({
    textValue,
    normalizeText,
    normalizeId,
    normalizeHeader,
    normalizeStatus,
    isCancelledStatus,
    isFinishedStatus,
    escapeHtml,
    parseCsv,
    getField,
    parseSheetDate,
    dateKeyFromDate,
    dateKey,
    formatDisplayTime,
    timeSortValue,
    numericValue,
    buildCustomerMap,
    buildPayInMap,
    buildAppointments,
    filterAppointments,
    paymentKind,
    statusKind
  });
});
