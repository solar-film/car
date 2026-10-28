/* Staging-only analytical helpers. Not imported by production HTML. No network, storage or writes. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CarLeadIntelligence = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const reasons = Object.freeze([
    'ราคาไม่ตรงงบ', 'ยังไม่พร้อมติดตั้ง', 'เปรียบเทียบร้าน',
    'ไม่ตอบกลับ', 'วันนัดไม่สะดวก', 'ระยะทาง', 'เลือกผู้ให้บริการอื่น', 'อื่น ๆ'
  ]);
  const normalize = v => String(v == null ? '' : v).trim();
  const validDate = v => { const t=normalize(v); if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false; const d=new Date(t+'T00:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===t; };
  function qualify(lead) {
    const l = lead || {};
    const score = (normalize(l.carModel) ? 15 : 0)
      + (normalize(l.filmModel) || normalize(l.filmBrand) ? 15 : 0)
      + (l.budgetMatched === true ? 20 : 0)
      + (l.canVisit === true ? 15 : 0)
      + (l.installWithin7Days === true ? 25 : 0)
      + (l.permissionToContact === true ? 10 : 0);
    return {score, tier: score >= 75 ? 'hot' : score >= 45 ? 'warm' : 'cold'};
  }
  function validateLostReason(reason, outcome) {
    const r = normalize(reason);
    if (normalize(outcome) === 'lost' && !reasons.includes(r)) return {ok:false,error:'ต้องเลือกเหตุผลที่ไม่ซื้อ'};
    if (r && !reasons.includes(r)) return {ok:false,error:'เหตุผลไม่ซื้อไม่อยู่ในรายการมาตรฐาน'};
    return {ok:true};
  }
  function attribution(lead) {
    const l = lead || {};
    // Do not infer paid from a self-reported channel. Preserve unknown explicitly.
    const source = normalize(l.source) || 'unknown';
    const medium = normalize(l.medium) || 'unknown';
    const campaignId = normalize(l.campaignId);
    const adId = normalize(l.adId);
    const clickId = normalize(l.clickId);
    return {source,medium,campaignId,adId,clickId};
  }
  function validateJourney(item) {
    const v = item || {};
    if (!normalize(v.leadId)) return {ok:false,error:'ต้องมี Lead ID'};
    if (v.bookedAt && !validDate(v.bookedAt)) return {ok:false,error:'วันที่จองไม่ถูกต้อง'};
    if (v.installedAt && !validDate(v.installedAt)) return {ok:false,error:'วันที่ติดตั้งไม่ถูกต้อง'};
    if (v.status === 'completed' && (!normalize(v.jobId) || !v.installedAt))
      return {ok:false,error:'งานสำเร็จต้องมี JobID และวันที่ติดตั้ง'};
    if (v.revenueExVat != null && (!Number.isFinite(v.revenueExVat) || v.revenueExVat < 0))
      return {ok:false,error:'รายได้ต้องเป็นตัวเลขที่ไม่ติดลบ'};
    return {ok:true};
  }
  function report(journeys) {
    if (!Array.isArray(journeys)) throw new Error('ต้องส่งรายการ journey ที่อ่านครบแล้ว');
    const seen = new Map(), seenLeads = new Set(), grouped = new Map();
    const leadAttribution = new Map();
    for (const [index,row] of journeys.entries()) {
      const validation = validateJourney(row);
      if (!validation.ok) throw new Error('journey แถว ' + (index+1) + ': ' + validation.error);
      const a = attribution(row);
      const key = JSON.stringify([a.source,a.medium,a.campaignId,a.adId]);
      const leadId = normalize(row.leadId), jobId = normalize(row.jobId);
      if (leadAttribution.has(leadId) && leadAttribution.get(leadId) !== key) throw new Error('แหล่งที่มาของ Lead ขัดแย้ง กรุณาตรวจข้อมูลก่อนคำนวณ');
      leadAttribution.set(leadId,key);
      // One physical booking has one JobID across the entire dataset, including other leads/campaigns.
      const identity = JSON.stringify(jobId ? ['job',jobId] : ['lead',leadId]);
      const fingerprint = JSON.stringify([leadId,jobId,key,normalize(row.status),normalize(row.bookedAt),normalize(row.installedAt),row.revenueExVat ?? null]);
      if (seen.has(identity)) {
        if (seen.get(identity) !== fingerprint) throw new Error('JobID หรือข้อมูล journey ซ้ำและขัดแย้ง กรุณาตรวจข้อมูลก่อนคำนวณ');
        continue;
      }
      seen.set(identity,fingerprint);
      if (!grouped.has(key)) grouped.set(key,{...a,leads:0,bookings:0,completed:0,revenueExVat:0});
      const g = grouped.get(key);
      if (!seenLeads.has(leadId)) { g.leads++; seenLeads.add(leadId); }
      if (jobId) g.bookings++;
      if (row.status === 'completed') {g.completed++;g.revenueExVat+=row.revenueExVat || 0;}
    }
    return [...grouped.values()];
  }
  return Object.freeze({reasons,qualify,validateLostReason,attribution,validateJourney,report});
});
