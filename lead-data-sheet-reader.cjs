'use strict';
const {csv}=require('./lead-data-core.js');
const SHEET='1u__xYWoWZpmrnquc-Fpk19WtpcrckxSd0-_G35NWxXQ';
const fields=['date','admin','channel','contact','name','phone','carBrand','carModel','positions','filmBrand','filmModel','budget','customerType','knownFrom','followUp','note'];
const headers=['วันที่','Admin','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ','ชื่อลูกค้า','เบอร์โทร','ยี่ห้อรถยนต์','รุ่นรถยนต์','ตำแหน่งติดตั้ง * (เลือกได้หลายตำแหน่ง)','ยี่ห้อที่สนใจ','รุ่นที่สนใจ','งบประมาณ','ประเภทลูกค้า','รู้จักเราจาก','สถานะการติดตาม','*หมายเหตุ'];
function normalizeDate(value) {
 value=String(value || '').split(',')[0].trim().split(' ')[0];
 if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
 const m=/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(value);if(!m)return '';
 let y=Number(m[3]);if(y<100)y=y>=40?2500+y-543:2000+y;else if(y>2400)y-=543;
 const result=y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
 const parsed=new Date(result);return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===result?result:'';
}
function matchesCustomer(data,customer) {
 const norm=v=>String(v||'').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ');
 const phone=v=>{let n=String(v||'').replace(/\D/g,'');if(n.startsWith('66')&&n.length===11)n='0'+n.slice(2);return n;};
 const p=phone(data.phone), cp=phone(customer['เบอร์โทรศัพท์']);
 if(p && cp && p===cp)return true;
 const channel=norm(data.channel), contact=norm(data.contact);
 if(contact && contact!=='—' && contact!=='-' && channel && channel===norm(customer['ช่องทางติดต่อ']) && contact===norm(customer['ชื่อช่องทางติดต่อ']))return true;
 return false;
}
async function readLeads(fetcher=fetch) {
 const query='select A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q';
 async function readSheetText(url,errorMessage) {
   const response=await fetcher(url,{signal:AbortSignal.timeout(30000),cache:'no-store'});
   if(!response.ok)throw Error(errorMessage);
   return response.text();
 }
 const [leadText,customerText,historyText]=await Promise.all([
   readSheetText('https://docs.google.com/spreadsheets/d/'+SHEET+'/gviz/tq?tqx=out:json&sheet=lead&tq='+encodeURIComponent(query)+'&_='+Date.now(),'อ่านชีต lead ไม่สำเร็จ'),
   readSheetText('https://docs.google.com/spreadsheets/d/'+SHEET+'/gviz/tq?tqx=out:csv&sheet=Customer&tq='+encodeURIComponent('select A,B,D,E,F'),'ตรวจชีต Customer ไม่สำเร็จ'),
   readSheetText('https://docs.google.com/spreadsheets/d/'+SHEET+'/gviz/tq?tqx=out:csv&sheet='+encodeURIComponent('ประวัติการติดต่อ')+'&tq='+encodeURIComponent('select A,B,C,D,E,F,G,H,I,J')+'&_='+Date.now(),'อ่านจำนวนประวัติการติดต่อไม่สำเร็จ')
 ]);
 let text=leadText;if(/^\s*</.test(text))throw Error('ชีต lead ไม่ได้ส่งข้อมูลตาราง กรุณาตรวจสิทธิ์อ่าน');
 if (text.includes('google.visualization.Query.setResponse(')) {
   const result=JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1));
   if(result.status!=='ok' || !result.table)throw Error('อ่านค่าจริงจากชีต lead ไม่สำเร็จ');
   const table=result.table;
   const values=table.rows.map(row=>table.cols.map((col,index)=>{
     const cell=row.c[index];
     // Match Apps Script getValues for numeric cells instead of formatted amounts.
     return cell ? col.type==='number' ? String(cell.v ?? '') : String(cell.f ?? cell.v ?? '') : '';
   }));
   text=[table.cols.map(col=>col.label),...values].map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\n');
 }
 if(/^\s*</.test(customerText))throw Error('อ่านข้อมูล Customer ไม่สำเร็จ');
 const customers=csv(customerText);
 if(customers.length && ['ชื่อลูกค้า','เบอร์โทรศัพท์','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ'].some(h=>!Object.hasOwn(customers[0],h)))throw Error('หัวคอลัมน์ Customer เปลี่ยนแปลง');
 if(/^\s*</.test(historyText) || !historyText.includes('Contact ID') || !historyText.includes('Lead ID'))throw Error('ตรวจหัวคอลัมน์ประวัติการติดต่อไม่สำเร็จ');
 const historyCounts=new Map(); const histories=new Map();
 for(const entry of csv(historyText)) {
   const id=String(entry['Lead ID']||'').trim();
   if(id && String(entry['Contact ID']||'').trim()) {
     historyCounts.set(id,(historyCounts.get(id)||0)+1);
     const rawAt=String(entry['วันเวลาติดต่อ']||'').trim();
     const date=normalizeDate(rawAt);
     const time=(rawAt.match(/(\d{1,2}:\d{2}(?::\d{2})?)/)||[])[1]||'00:00';
     const at=/^\d{4}-\d{2}-\d{2}T/.test(rawAt)?rawAt:date?date+'T'+time.padStart(5,'0'):rawAt;
     const text=String(entry['เรื่องที่คุย']||'');
     if(text) { if(!histories.has(id))histories.set(id,[]); histories.get(id).push({id:String(entry['Contact ID']).trim(),at,by:String(entry['ผู้ดูแล']||''),text}); }
   }
 }
 const rows=csv(text);if(rows.length && headers.some(h=>!Object.hasOwn(rows[0],h)))throw Error('หัวคอลัมน์ชีต lead ไม่ตรงกับที่กำหนด');
 return {source:'google-sheet-lead',leads:rows.map((row,index)=>{const data=Object.fromEntries(fields.map((key,i)=>[key,row[headers[i]]||'']));data.time=(String(data.date).match(/(?:,|\s)\s*(\d{1,2}:\d{2}:\d{2})/) || [,''])[1];data.date=normalizeDate(data.date);return {leadId:String(row['Lead ID']||'').trim(),contactHistory:histories.get(String(row['Lead ID']||'').trim())||[],historyCount:historyCounts.get(String(row['Lead ID']||'').trim())||0,customerId:(()=>{const matched=customers.filter(customer=>matchesCustomer(data,customer));return matched.length===1?String(matched[0].CustID||'').trim():'';})(),isCustomer:customers.some(customer=>matchesCustomer(data,customer)),id:'sheet-lead:'+index,name:data.name,phone:data.phone,salesperson:data.admin,note:data.note,status:data.followUp||'ใหม่',sheetData:data,source:{platform:'sheet-lead'},readOnly:true};}).filter(l=>Object.values(l.sheetData).some(Boolean))};
}
module.exports={readLeads,normalizeDate,matchesCustomer};


