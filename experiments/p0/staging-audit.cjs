'use strict';
// Offline preflight only. Never imports the server, reads env, calls APIs, or writes data.
const text = value => String(value ?? '').trim();
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value;
}
function validateStagingConfig(config, production) {
  const errors=[];
  const lists=['spreadsheetIds','deploymentIds','origins'];
  if (!production || lists.some(key => !Array.isArray(production[key]) || !production[key].length || production[key].some(id => !text(id)))) errors.push('PRODUCTION_INVENTORY_REQUIRED');
  if (!config || config.environment!=='staging' || config.syntheticOnly!==true) errors.push('SYNTHETIC_STAGING_REQUIRED');
  if (!config || !text(config.spreadsheetId) || !text(config.deploymentId) || !text(config.origin)) errors.push('STAGING_TARGET_REQUIRED');
  if (config?.adsEnabled!==false || config?.webhooksEnabled!==false || config?.triggersEnabled!==false) errors.push('EXTERNAL_AUTOMATION_MUST_BE_DISABLED');
  if (config?.productionFallback!==false) errors.push('PRODUCTION_FALLBACK_FORBIDDEN');
  if (config && production && lists.every(key => Array.isArray(production[key]))) {
    if (production.spreadsheetIds.map(text).includes(text(config.spreadsheetId))) errors.push('PRODUCTION_SPREADSHEET_FORBIDDEN');
    if (production.deploymentIds.map(text).includes(text(config.deploymentId))) errors.push('PRODUCTION_DEPLOYMENT_FORBIDDEN');
    const originOf=value => {try {const url=new URL(value);return url.protocol==='https:' || url.protocol==='http:' ? url.origin : null;} catch {return null;}};
    const origin=originOf(config.origin);
    if (!origin || !production.origins.every(value => originOf(value))) errors.push('INVALID_ORIGIN');
    else if (production.origins.some(value => originOf(value)===origin)) errors.push('PRODUCTION_ORIGIN_FORBIDDEN');
  }
  return {ok:!errors.length,errors};
}
const specs={
  lead:{id:'Lead ID',required:['Lead ID','วันที่','เบอร์โทร','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ']},
  Customer:{id:'CustID',required:['CustID','เบอร์โทรศัพท์','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ']},
  Bookings:{id:'JobID',required:['JobID','CustID','Lead ID','วันที่ติดตั้ง','Status']},
  PayIn:{id:'Pay_ID',required:['Pay_ID','JobID']}
};
function auditSnapshot(snapshot, expected, asOf) {
  const issues=[];
  const issue=(code,table,row) => issues.push({code,table,...(row===undefined?{}:{row})});
  if (!validDate(asOf)) issue('AS_OF_DATE_REQUIRED','snapshot');
  if (!expected || !text(expected.spreadsheetId) || !snapshot || snapshot.spreadsheetId!==expected.spreadsheetId) issue('SPREADSHEET_MISMATCH','snapshot');
  if (snapshot?.complete!==true) issue('INCOMPLETE_SNAPSHOT','snapshot');
  const indexes={};
  for (const [name,spec] of Object.entries(specs)) {
    const table=snapshot?.tables?.[name], target=expected?.tables?.[name];
    if (!table || !target || table.name!==name || target.name!==name || !Number.isInteger(target.gid) || target.gid<0 || table.gid!==target.gid) {issue('TABLE_IDENTITY_MISMATCH',name);continue;}
    const headers=table.headers;
    if (!Array.isArray(headers) || headers.some(h => typeof h!=='string') || new Set(headers.map(h => h.trim())).size!==headers.length || spec.required.some(h => !headers.includes(h))) {issue('SCHEMA_MISMATCH',name);continue;}
    if (!Array.isArray(table.rows)) {issue('ROWS_REQUIRED',name);continue;}
    const index=new Map(); indexes[name]=index;
    table.rows.forEach((row,i) => {
      if (!row || typeof row!=='object' || Array.isArray(row) || headers.some(h => !Object.hasOwn(row,h))) {issue('ROW_SHAPE_INVALID',name,i+2);return;}
      const id=text(row[spec.id]);
      if (!id) {issue('MISSING_ID',name,i+2);return;}
      if (index.has(id)) issue('DUPLICATE_ID',name,i+2);
      else index.set(id,row);
    });
  }
  // Never calculate a partial result when target, schema, shape or IDs are wrong.
  if (issues.length) return {ok:false,issues,counts:null};
  const leads=indexes.lead, customers=indexes.Customer, bookings=indexes.Bookings;
  const counts={leads:leads.size,customers:customers.size,bookings:bookings.size,payments:indexes.PayIn.size,
    scheduled:0,inProgress:0,completed:0,cancelled:0,unknownStatus:0,legacyBookingsWithoutLead:0,customersWithMultipleBookings:0,customersWithMultipleLeads:0,leadsWithMultipleBookings:0};
  const perCustomer=new Map(),perLead=new Map(),customerLeads=new Map(),leadCustomers=new Map(),phones=new Map();
  const phone=value => {const digits=text(value).replace(/\D/g,'');return digits.startsWith('66') && digits.length===11 ? '0'+digits.slice(2) : digits;};
  for (const [i,row] of [...customers.values()].entries()) {
    const number=phone(row['เบอร์โทรศัพท์']);
    if (number && phones.has(number)) issue('AMBIGUOUS_CUSTOMER_PHONE','Customer',i+2);
    else if (number) phones.set(number,text(row.CustID));
  }
  for (const [i,row] of [...bookings.values()].entries()) {
    const customer=text(row.CustID), lead=text(row['Lead ID']), date=text(row['วันที่ติดตั้ง']);
    if (!customer || !customers.has(customer)) issue('ORPHAN_CUSTOMER','Bookings',i+2);
    if (lead && !leads.has(lead)) issue('ORPHAN_LEAD','Bookings',i+2);
    if (!lead) {counts.legacyBookingsWithoutLead++;issue('LEGACY_LINK_REVIEW_REQUIRED','Bookings',i+2);}
    if (!validDate(date)) issue('INSTALL_DATE_INVALID','Bookings',i+2);
    perCustomer.set(customer,(perCustomer.get(customer)||0)+1);
    if (lead) {
      perLead.set(lead,(perLead.get(lead)||0)+1);
      if (!customerLeads.has(customer)) customerLeads.set(customer,new Set());
      customerLeads.get(customer).add(lead);
      if (!leadCustomers.has(lead)) leadCustomers.set(lead,new Set());
      leadCustomers.get(lead).add(customer);
      if (leadCustomers.get(lead).size>1) issue('LEAD_LINKED_TO_MULTIPLE_CUSTOMERS','Bookings',i+2);
      const leadPhone=phone(leads.get(lead)?.['เบอร์โทร']),customerPhone=phone(customers.get(customer)?.['เบอร์โทรศัพท์']);
      if (leadPhone && customerPhone && leadPhone!==customerPhone) issue('LINK_PHONE_CONFLICT_REVIEW_REQUIRED','Bookings',i+2);
    }
    if (row.Status==='เสร็จสิ้น') {counts.completed++;if (date>asOf) issue('COMPLETED_IN_FUTURE','Bookings',i+2);}
    else if (row.Status==='คิวใหม่') counts.scheduled++;
    else if (row.Status==='กำลังติดตั้ง') counts.inProgress++;
    else if (row.Status==='ยกเลิก') counts.cancelled++;
    else {counts.unknownStatus++;issue('STATUS_REVIEW_REQUIRED','Bookings',i+2);}
  }
  for (const [i,row] of [...indexes.PayIn.values()].entries()) if (!bookings.has(text(row.JobID))) issue('ORPHAN_PAYMENT','PayIn',i+2);
  for (const [i,row] of [...leads.values()].entries()) if (!validDate(text(row['วันที่']))) issue('LEAD_DATE_INVALID','lead',i+2);
  counts.customersWithMultipleBookings=[...perCustomer.values()].filter(n => n>1).length;
  counts.customersWithMultipleLeads=[...customerLeads.values()].filter(ids => ids.size>1).length;
  counts.leadsWithMultipleBookings=[...perLead.values()].filter(n => n>1).length;
  return {ok:!issues.length,issues,counts};
}
module.exports={validDate,validateStagingConfig,auditSnapshot};
