// Shared booking/payment interpretation for the booking and accounting pages.
// Keep presentation and filters in each page; values come from the same source.
window.BookingReadModel = (() => {
function textValue(value, fallback = "-") {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text === "" ? fallback : text;
}

function findKey(keys, matcher) {
    return keys.find(matcher);
}

function normalizeLookupId(value) {
    return textValue(value, "").replace(/\s+/g, "").toLowerCase();
}

function normalizeHeader(value) {
    return textValue(value, "").replace(/[\s().（）]/g, "").toLowerCase();
}

function makeLookupMap(rows, keyMatcher) {
    const map = {};
    rows.forEach(row => {
        const keys = Object.keys(row);
        const idKey = findKey(keys, keyMatcher);
        const id = idKey ? textValue(row[idKey], "") : "";
        if (!id) return;

        const normalizedId = normalizeLookupId(id);
        const details = { ...(map[id] || map[normalizedId] || {}) };
        Object.entries(row).forEach(([key, value]) => {
            if (key === idKey) return;
            const text = textValue(value, "");
            if (text && text !== "-") {
                details[key] = text;
            } else if (!(key in details)) {
                details[key] = text;
            }
        });
        map[id] = details;
        if (normalizedId) map[normalizedId] = details;
    });
    return map;
}

function buildPayInDetailsMap(rows) {
    const map = {};
    rows.forEach(row => {
        const keys = Object.keys(row);
        const jobKey = findKey(keys, key => key.replace(/\s/g, '').toLowerCase() === 'jobid' || key.toLowerCase().includes('job'));
        const statusKey = findKey(keys, key => key.replace(/\s/g, '') === 'สถานะ') ||
            findKey(keys, key => key.toLowerCase().includes('status') || key.includes('สถานะ'));
        const billKey = findKey(keys, key => {
            const k = key.replace(/\s/g, '').toLowerCase();
            return k.includes('เลขที่บิล') ||
                k.includes('เลขบิล') ||
                k.includes('ใบเสร็จ') ||
                k.includes('receipt') ||
                k.includes('bill') ||
                k === 'cv';
        });
        const payTypeKey = findKey(keys, key => {
            const k = key.replace(/\s/g, '').toLowerCase();
            return k.includes('ประเภทการชำระ') ||
                k.includes('ประเภทชำระ') ||
                k.includes('ประเภทการจ่าย') ||
                k.includes('วิธีการชำระ') ||
                k.includes('วิธีชำระ') ||
                k.includes('ช่องทางการชำระ') ||
                k.includes('paymenttype') ||
                k.includes('paytype') ||
                k.includes('paymentmethod') ||
                k.includes('method');
        });
        const amountKey = findKey(keys, key => {
            const k = key.replace(/\s/g, '').toLowerCase();
            return k.includes('ยอดเงิน') || k.includes('ยอดชำระ') || k.includes('จำนวนเงิน') || k.includes('amount');
        });
        const productValueKey = findKey(keys, key => {
            const k = key.replace(/\s/g, '').toLowerCase();
            return k.includes('มูลค่าสินค้า') || k.includes('productvalue');
        });
        const proofKeys = keys.filter(key => {
            const k = key.replace(/\s/g, '').toLowerCase();
            return k.includes('หลักฐาน') || k.includes('สลิป') || k.includes('slip') || k.includes('รูป') || k.includes('image') || k.includes('แนบ');
        });
        const proofSlots = [1, 2, 3, 4].map(slot => {
            const proofKey = findKey(keys, key => {
                const k = key.replace(/\s/g, '').toLowerCase();
                return k === `หลักฐาน_${slot}` || k === `หลักฐาน${slot}` || k === `proof_${slot}` || k === `proof${slot}`;
            });
            return proofKey ? textValue(row[proofKey], '') : '';
        });

        if (!jobKey) return;

        const jobId = textValue(row[jobKey], "");
        const status = statusKey ? textValue(row[statusKey], "-") : "-";
        const slotProofs = proofSlots.filter(value => value && value !== '-');
        const proofs = (slotProofs.length ? slotProofs : proofKeys.map(key => textValue(row[key], "")))
            .filter(value => value && value !== "-");

        if (!jobId) return;
        const payIdKey = findKey(keys, key => {
            const k = key.replace(/\s/g, '').toLowerCase();
            return k === 'pay_id' || k === 'payid' || k.includes('pay_id') || k.includes('payid');
        });

        const data = {
            id: payIdKey ? textValue(row[payIdKey], "") : "",
            status,
            billNo: billKey ? textValue(row[billKey], "-") : "-",
            payType: payTypeKey ? textValue(row[payTypeKey], "-") : "-",
            amount: amountKey ? parseFloat(textValue(row[amountKey], "0").replace(/[^\d.-]/g, '')) || 0 : 0,
            productValue: productValueKey ? parseFloat(textValue(row[productValueKey], "0").replace(/[^\d.-]/g, '')) || 0 : 0,
            proofs,
            proofSlots,
            hasSlip: proofs.some(value => value.length > 5),
            rawRow: row // เก็บ raw row ไว้สำหรับ pre-fill ฟอร์มแก้ไข (เช่น ใบเสนอราคา, หมายเหตุ)
        };

        const mergePayIn = (existing, incoming) => {
            if (!existing) return incoming;
            const merged = { ...existing };
            ['status', 'billNo', 'payType', 'amount', 'productValue', 'rawRow'].forEach(key => {
                const value = incoming[key];
                if (value !== undefined && value !== null && value !== '' && value !== '-') merged[key] = value;
            });
            merged.proofSlots = [0, 1, 2, 3].map(index => incoming.proofSlots[index] || existing.proofSlots[index] || '');
            merged.proofs = merged.proofSlots.filter(value => value && value !== '-');
            merged.hasSlip = merged.proofs.some(value => value.length > 5);
            if (incoming.hasSlip || (!merged.id && incoming.id)) merged.id = incoming.id;
            return merged;
        };

        map[jobId] = mergePayIn(map[jobId], data);
        map[normalizeLookupId(jobId)] = mergePayIn(map[normalizeLookupId(jobId)], data);
    });
    return map;
}

function formatDisplayTime(value) {
    const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
    return match ? `${parseInt(match[1], 10)}:${match[2]}` : textValue(value);
}

function isCancelledJob(job) {
    return normalizeHeader(job.status).includes(normalizeHeader('ยกเลิก'));
}

function isClaimCustomerJob(job) {
    const customerType = normalizeHeader(job.customerType);
    return customerType.includes(normalizeHeader('เคลม')) ||
        customerType.includes(normalizeHeader('ปัญหาฟิล์ม'));
}

function isFixCustomerJob(job) {
    const customerType = normalizeHeader(job.customerType);
    return customerType.includes(normalizeHeader('งานแก้')) ||
        customerType.includes(normalizeHeader('ในวัน')) ||
        customerType.includes(normalizeHeader('แก้'));
}

function buildJobs(bookingRows, customerMap, payInDetailsMap, filmDetailsMap = {}) {
return bookingRows.map(row => {
    const keys = Object.keys(row);

    const salesKey = findKey(keys, key => key.includes('พนง') || (key.includes('ขาย') && !key.includes('ยอด')) || key.includes('เซลล์'));
    const priceKey = findKey(keys, key => normalizeHeader(key) === 'ยอดขาย') ||
        findKey(keys, key => normalizeHeader(key).includes('ยอดขายบาท')) ||
        findKey(keys, key => key.includes('ยอดขาย'));
    const jobIdKey = findKey(keys, key => key.replace(/\s/g, '').toLowerCase() === 'jobid' || key.toLowerCase().includes('job'));
    const warrantyKey = findKey(keys, key => key.includes('ประกัน') || key.includes('Warranty'));
    const dateKey = findKey(keys, key => key.includes('วันที่'));
    const timeKey = findKey(keys, key => key.includes('เวลา'));
    const statusKey = findKey(keys, key => key.includes('Status'));

    // ดึงคีย์ใหม่สำหรับตาราง
    const receiptKey = findKey(keys, key => {
        const k = normalizeHeader(key);
        return k.includes('เลขที่บิล') || k.includes('ใบเสร็จ');
    });
    const paymentTypeKey = findKey(keys, key => {
        const k = normalizeHeader(key);
        return k.includes('ประเภทการชำระ') || k.includes('ช่องทางการชำระ') || k.includes('ประเภทชำระ');
    });
    const basePriceKey = findKey(keys, key => {
        const k = normalizeHeader(key);
        return k.includes('มูลค่าสินค้า') || k.includes('ราคาเต็ม') || k.includes('ราคาปกติ');
    });
    const discountKey = findKey(keys, key => {
        const k = normalizeHeader(key);
        return k.includes('ส่วนลด') && !k.includes('รหัส');
    });
    const discountCodeKey = findKey(keys, key => {
        const k = normalizeHeader(key);
        return k.includes('รหัสส่วนลด') || k.includes('coupon') || k.includes('discount_code');
    });

    const custId = textValue(row['CustID']);
    const jobId = jobIdKey ? textValue(row[jobIdKey]) : "-";
    const customerDetails = customerMap[custId] || null;
    const customerKeys = customerDetails ? Object.keys(customerDetails) : [];
    const nameKey = findKey(customerKeys, key => key.includes('ชื่อ'));
    const phoneKey = findKey(customerKeys, key => key.includes('เบอร์'));
    const channelNameKey = findKey(customerKeys, key => {
        const normalizedKey = normalizeHeader(key);
        return normalizedKey.includes('ชื่อช่องทางติดต่อ') ||
            (normalizedKey.includes('ชื่อ') && normalizedKey.includes('ช่องทาง'));
    });
    const channelKey = findKey(customerKeys, key => {
        const normalizedKey = normalizeHeader(key);
        return normalizedKey.includes('ช่องทางติดต่อ') && !normalizedKey.includes('ชื่อ');
    }) || findKey(customerKeys, key => key.includes('ช่องทาง') && key !== channelNameKey);

    const price = parseFloat(textValue(priceKey ? row[priceKey] : "0", "0").replace(/,/g, '')) || 0;
    const warrantyValue = warrantyKey ? textValue(row[warrantyKey], "") : "";

    const payInDetails = payInDetailsMap[jobId] || payInDetailsMap[normalizeLookupId(jobId)] || { status: "-", hasSlip: false };

    // Parse the new numeric fields
    const basePriceStr = basePriceKey ? textValue(row[basePriceKey], "0") : "0";
    const discountStr = discountKey ? textValue(row[discountKey], "0") : "0";

    let basePrice = parseFloat(basePriceStr.replace(/,/g, ''));
    if (isNaN(basePrice) || basePrice === 0) basePrice = price; // Fallback to net price if missing

    let discount = parseFloat(discountStr.replace(/,/g, ''));
    if (isNaN(discount)) discount = 0;

    const bookingReceiptNo = receiptKey ? textValue(row[receiptKey], "-") : "-";
    const payInReceiptNo = textValue(payInDetails.billNo, "-");
    const receiptNo = payInReceiptNo && payInReceiptNo !== "-" ? payInReceiptNo : bookingReceiptNo;

    const bookingPaymentType = paymentTypeKey ? textValue(row[paymentTypeKey], "-") : "-";
    const payInPaymentType = textValue(payInDetails.payType, "-");
    const paymentType = payInPaymentType && payInPaymentType !== "-" ? payInPaymentType : bookingPaymentType;

    const job = {
        id: jobId,
        custId,
        custName: nameKey ? textValue(customerDetails[nameKey]) : "-",
        custPhone: phoneKey ? textValue(customerDetails[phoneKey]) : "-",
        customerChannel: channelKey ? textValue(customerDetails[channelKey]) : "-",
        customerChannelName: channelNameKey ? textValue(customerDetails[channelNameKey]) : "-",
        sales: salesKey ? textValue(row[salesKey]) : "-",
        date: textValue(row['วันที่ติดตั้ง'] || row[dateKey]),
        time: formatDisplayTime(row['เวลานัด'] || row[timeKey]),
        customerType: textValue(row['ประเภทลูกค้า']),
        carModel: textValue(row['รุ่นรถยนต์']),
        plate: textValue(row['ทะเบียนรถ']),
        plateType: textValue(row['ป้าย']),
        film: textValue(row['ยี่ห้อฟิล์ม']),
        installType: textValue(
            row['ตำแหน่งติดตั้ง'] ||
            row['ตำแหน่งติดตั้ง ใหม่'] ||
            row['ตำแหน่งติดตั้งใหม่'] ||
            row['การติดตั้ง'] ||
            row['ประเภทการติดตั้ง'] ||
            row['ตำแหน่ง']
        ),
        receiptNo,
        paymentType,
        basePrice: basePrice,
        discount: discount,
        discountCode: discountCodeKey ? textValue(row[discountCodeKey], "") : "",
        price,
        promotion: textValue(row['Pro_ID'] || row['โปรโมชั่น']),
        note: textValue(row['หมายเหตุ']),
        warranty: warrantyValue !== "" ? warrantyValue : "ร้าน",
        paymentStatus: textValue(payInDetails.status, "-"),
        hasSlip: payInDetails.hasSlip,
        status: textValue(row['Status'] || row[statusKey]),
        colorStatus: textValue(row['ColorStatus'], "Gray"),
        filmDetails: filmDetailsMap[jobId] || filmDetailsMap[normalizeLookupId(jobId)] || null,
        customerDetails
    };

    job.searchText = [job.id, job.plate, job.carModel, job.sales, job.custName, job.status, job.paymentStatus, job.customerChannel, job.customerChannelName, job.receiptNo, job.paymentType]
        .join(' ')
        .toLowerCase();
    return job;
}).filter(job => job.id !== "-" && job.id !== "");
}

function extractFileId(value) {
    const url = textValue(value, '').trim();
    if (!url) return null;
    const patterns = [
        /\/file\/d\/([-\w]{10,})/,
        /[?&]id=([-\w]{10,})/,
        /\/open\?id=([-\w]{10,})/,
        /uc\?[^\s]*id=([-\w]{10,})/,
        /thumbnail\?[^\s]*id=([-\w]{10,})/,
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    // รับเฉพาะกรณีที่เป็น Google Drive File ID จริง ๆ เท่านั้น
    // ป้องกันไม่ให้ Path ของ AppSheet เช่น CAR_CRM-691939189/ ถูกนำไปเปิดเป็น URL ของ localhost
    if (/^[-\w]{25,}$/.test(url)) return url;
    return null;
}

function normalizeProofList(values) {
    return (values || [])
        .flatMap(value => textValue(value, '')
            .split(/\n|,|;|\s+(?=https?:\/\/)/)
            .map(v => v.trim())
        )
        .filter(value => value && value !== '-');
}

function isDisplayableImageUrl(value) {
    const url = textValue(value, '').trim();
    if (!/^https?:\/\//i.test(url)) return false;
    return /\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(url) || /googleusercontent\.com/i.test(url);
}

function buildProofItem(rawUrl) {
    const raw = textValue(rawUrl, '').trim();
    const fileId = extractFileId(raw);
    if (fileId) {
        return {
            type: 'image',
            src: `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`,
            href: `https://drive.google.com/file/d/${fileId}/view`,
            note: ''
        };
    }
    if (isDisplayableImageUrl(raw)) {
        return { type: 'image', src: raw, href: raw, note: '' };
    }
    if (/^https?:\/\//i.test(raw)) {
        return { type: 'link', href: raw, text: raw, note: '' };
    }
    if (raw && raw.length > 3) {
        let clean = raw.replace(/\/\/+/g, '/');
        if (clean.startsWith('/')) clean = clean.substring(1);
        const appNameMatch = clean.match(/^([^\/]+)/);
        const appName = appNameMatch ? appNameMatch[1] : 'CAR_CRM-691939189';
        const appsheetUrl = `https://www.appsheet.com/template/gettablefileurl?appName=${encodeURIComponent(appName)}&tableName=PayIn&fileName=${encodeURIComponent(clean)}`;
        return { type: 'image', src: appsheetUrl, href: appsheetUrl, note: '' };
    }
    return { type: 'path', text: raw, note: 'ไม่พบข้อมูลรูปภาพ' };
}

function isNewCustomerJob(job) {
    return normalizeHeader(job.customerType).includes(normalizeHeader('ลูกค้าใหม่'));
}

function isOldCustomerJob(job) {
    return normalizeHeader(job.customerType).includes(normalizeHeader('ลูกค้าเก่า'));
}

function isSalesJob(job) {
    return !isCancelledJob(job) && (isNewCustomerJob(job) || isOldCustomerJob(job));
}

function getPaymentStatusColorClass(status) {
    const value = textValue(status, "-");
    const normalized = value.toLowerCase().replace(/\s+/g, '');
    if (!value || value === "-") return 'bg-slate-100 text-slate-600 border-slate-200';
    if (normalized.includes('ชำระครบ') || normalized.includes('ชำระแล้ว') || normalized.includes('จ่ายแล้ว') || normalized.includes('โอนแล้ว') || normalized.includes('paid')) {
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
    if (normalized.includes('มัดจำ') || normalized.includes('บางส่วน') || normalized.includes('partial') || normalized.includes('deposit')) {
        return 'bg-amber-100 text-amber-800 border-amber-200';
    }
    if (normalized.includes('ยังไม่') || normalized.includes('ค้าง') || normalized.includes('รอชำระ') || normalized.includes('เครดิต') || normalized.includes('credit') || normalized.includes('unpaid')) {
        return 'bg-rose-100 text-rose-800 border-rose-200';
    }
    if (normalized.includes('ยกเว้น') || normalized.includes('exempt')) {
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
    return 'bg-blue-100 text-blue-800 border-blue-200';
}

function timeToNumber(timeStr) {
    if (!timeStr || timeStr === "-" || typeof timeStr !== 'string') return Number.MAX_SAFE_INTEGER;

    // ลบช่องว่างหน้า-หลัง และแปลงเป็นพิมพ์เล็กเผื่อมี am/pm (แม้ในตัวอย่างจะไม่มี)
    const cleanTime = timeStr.trim().toLowerCase();

    // ใช้ Regular Expression เพื่อดึงแค่ตัวเลขที่คั่นด้วย : ออกมา
    const match = cleanTime.match(/(\d+):(\d+)(?::(\d+))?/);

    if (match) {
        const h = parseInt(match[1], 10) || 0;
        const m = parseInt(match[2], 10) || 0;
        const s = parseInt(match[3], 10) || 0;
        return (h * 3600) + (m * 60) + s;
    }

    return Number.MAX_SAFE_INTEGER;
}

return { timeToNumber, isSalesJob, getPaymentStatusColorClass, normalizeProofList, buildProofItem, buildJobs, buildPayInDetailsMap, makeLookupMap, isCancelledJob, isClaimCustomerJob, isFixCustomerJob };
})();
