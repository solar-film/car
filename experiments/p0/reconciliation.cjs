'use strict';
const {auditSnapshot}=require('./staging-audit.cjs');
function dateOnly(value){
  if(value instanceof Date||value&&typeof value==='object'&&value.$date){const d=value instanceof Date?value:new Date(value.$date);return Number.isFinite(d.getTime())?new Date(d.getTime()+7*3600000).toISOString().slice(0,10):'';}
  const text=String(value??'').trim();if(/^\d{4}-\d{2}-\d{2}(?:\b|T)/.test(text))return text.slice(0,10);
  const m=/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\b|\s|,)/.exec(text);if(!m)return text;
  let year=Number(m[3]);if(year>2400)year-=543;else if(year<100)year+=year>=40?1957:2000;
  return year+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
}
function reconcile(snapshot,asOf){
  const names=['lead','Customer','Bookings','PayIn'],tables={},expected={spreadsheetId:'synthetic-memory',tables:{}};
  for(const [gid,name]of names.entries()){
    const raw=snapshot?.tables?.[name],headers=raw?.[0];
    tables[name]={name,gid,headers,rows:Array.isArray(raw)?raw.slice(1).map(row=>Object.fromEntries((headers||[]).map((h,i)=>[h,((name==='lead'&&h==='วันที่')||(name==='Bookings'&&h==='วันที่ติดตั้ง'))?dateOnly(row[i]):row[i]??'']))):null};
    expected.tables[name]={name,gid};
  }
  const audit=auditSnapshot({spreadsheetId:'synthetic-memory',complete:true,tables},expected,asOf),issues=[...audit.issues];
  const history=snapshot?.tables?.['ประวัติการติดต่อ'],header=history?.[0],ids=new Set(),leads=new Set(tables.lead.rows?.map(r=>String(r['Lead ID']).trim())||[]);
  if(!Array.isArray(history)||['Contact ID','Lead ID','วันเวลาติดต่อ'].some(h=>!header?.includes(h)))issues.push({code:'HISTORY_SCHEMA_INVALID',table:'ประวัติการติดต่อ'});
  else for(const [i,row]of history.slice(1).entries()){
    const id=String(row[header.indexOf('Contact ID')]||'').trim(),lead=String(row[header.indexOf('Lead ID')]||'').trim();
    if(!id||ids.has(id)||!leads.has(lead))issues.push({code:'HISTORY_ID_OR_LINK_INVALID',table:'ประวัติการติดต่อ',row:i+2});ids.add(id);
  }
  return {ok:issues.length===0,issues,counts:issues.length?null:{...audit.counts,contactEvents:history.length-1},scope:'ALL_SYNTHETIC_ROWS_INCLUDING_CANCELLED',revenueVerified:false};
}
module.exports={dateOnly,reconcile};
