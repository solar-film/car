'use strict';
const {auditSnapshot,validDate}=require('./staging-audit.cjs');
const bangkokDay=instant=>{
  const shifted=new Date(instant+7*3600000);
  return Number.isFinite(shifted.getTime())?shifted.toISOString().slice(0,10):'';
};
function dateOnly(value){
  if(value instanceof Date)return bangkokDay(value.getTime());
  if(value&&typeof value==='object')return typeof value.$date==='string'?dateOnly(value.$date):'';
  if(typeof value!=='string')return '';
  const text=value.trim();
  // Validate the source calendar before Date.parse, which can roll February 30 forward.
  const iso=/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(text);
  if(iso){
    const [,day,hour,minute,second,,zone]=iso;
    if(!validDate(day)||Number(hour||0)>23||Number(minute||0)>59||Number(second||0)>59)return '';
    if(!zone)return day; // A wall time without an offset is explicitly Bangkok time.
    if(zone!=='Z'&&(Number(zone.slice(1,3))>23||Number(zone.slice(4))>59))return '';
    return bangkokDay(Date.parse(text.replace(' ','T')));
  }
  const m=/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if(!m||Number(m[4]||0)>23||Number(m[5]||0)>59||Number(m[6]||0)>59)return '';
  let year=Number(m[3]);if(year>2400)year-=543;else if(year<100)year+=year>=40?1957:2000;
  const day=year+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  return validDate(day)?day:'';
}
function reconcile(snapshot,asOf){
  const names=['lead','Customer','Bookings','PayIn','ประวัติการติดต่อ'],tables={},issues=[],expected={spreadsheetId:'synthetic-memory',tables:{}};
  // Do not pad or truncate malformed rows into apparently complete records.
  for(const [gid,name]of names.entries()){
    const raw=snapshot?.tables?.[name],headers=Array.isArray(raw)?raw[0]:null;
    if(!Array.isArray(headers)||!headers.length||Array.from(headers).some(h=>typeof h!=='string'||!h.trim())||new Set(headers.map(h=>h.trim())).size!==headers.length){
      issues.push({code:name==='ประวัติการติดต่อ'?'HISTORY_SCHEMA_INVALID':'SCHEMA_MISMATCH',table:name});continue;
    }
    for(let i=1;i<raw.length;i++){
      const row=raw[i];
      if(!Array.isArray(row)||row.length!==headers.length||headers.some((_,j)=>!Object.hasOwn(row,j)))issues.push({code:'ROW_SHAPE_INVALID',table:name,row:i+1});
    }
    tables[name]={name,gid,headers,rows:[]};
    expected.tables[name]={name,gid};
  }
  const history=snapshot?.tables?.['ประวัติการติดต่อ'],header=tables['ประวัติการติดต่อ']?.headers;
  if(header&&['Contact ID','Lead ID','วันเวลาติดต่อ'].some(h=>!header.includes(h)))issues.push({code:'HISTORY_SCHEMA_INVALID',table:'ประวัติการติดต่อ'});
  const result=counts=>({ok:issues.length===0,issues,counts:issues.length?null:counts,scope:'ALL_SYNTHETIC_ROWS_INCLUDING_CANCELLED',revenueVerified:false});
  if(issues.length)return result(null);
  for(const name of names){
    tables[name].rows=snapshot.tables[name].slice(1).map(row=>Object.fromEntries(tables[name].headers.map((h,i)=>[h,((name==='lead'&&h==='วันที่')||(name==='Bookings'&&h==='วันที่ติดตั้ง'))?dateOnly(row[i]):row[i]??''])));
  }
  const audit=auditSnapshot({spreadsheetId:'synthetic-memory',complete:true,tables},expected,asOf);issues.push(...audit.issues);
  const ids=new Set(),leads=new Set(tables.lead.rows.map(r=>String(r['Lead ID']).trim()));
  for(const [i,row]of history.slice(1).entries()){
    const id=String(row[header.indexOf('Contact ID')]||'').trim(),lead=String(row[header.indexOf('Lead ID')]||'').trim();
    if(!id||ids.has(id)||!leads.has(lead))issues.push({code:'HISTORY_ID_OR_LINK_INVALID',table:'ประวัติการติดต่อ',row:i+2});ids.add(id);
    if(!dateOnly(row[header.indexOf('วันเวลาติดต่อ')]))issues.push({code:'HISTORY_DATE_INVALID',table:'ประวัติการติดต่อ',row:i+2});
  }
  return result({...audit.counts,contactEvents:history.length-1});
}
module.exports={dateOnly,reconcile};
