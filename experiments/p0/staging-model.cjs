'use strict';
// Synthetic browser adapter. Lead/history/status operations execute the candidate Apps Script in a VM.
// Customer/Booking mutations below emulate a contract; they do not certify the live backend implementation.
const crypto=require('node:crypto');
const {fixture,columns}=require('./apps-script-fixture.cjs');
const schemas=require('./staging-schema.cjs');
const clone=value=>structuredClone(value);
const text=value=>String(value??'').trim();
const phone=value=>{const n=text(value).replace(/\D/g,'');return n.startsWith('66')&&n.length===11?'0'+n.slice(2):n;};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fault=(message,status=400)=>Object.assign(Error(message),{status});
function createModel({bundleSource=null}={}){
  const tables=Object.fromEntries(Object.entries(schemas).map(([name,header])=>[name,[[...header]]]));
  const options={Car_model:['Vios','Revo'],Car_Brand:['Toyota'],Car_model_brand:{Vios:'Toyota',Revo:'Toyota'},
    'ตำแหน่งกระจก':['เต็มคัน','บานหน้า','ซันรูฟ'],film_Brand:['G-TEC'],film_series:['CM15','CM30'],
    'สถานะการติดตาม':['🟡 สอบถามใหม่','🟠 เสนอราคาแล้ว','🔵 ติดตาม','🟢 มัดจำ/นัดติดตั้งแล้ว','✅ ปิดการขายสำเร็จ','❌ ยกเลิก / ไม่สนใจ'],
    'พนักงานขาย':['ฝ่ายขายสมมติ']};
  Object.assign(tables,{
    Car_model:[['Car_model_ID','ยี่ห้อรถยนต์','รุ่นรถยนต์','ขนาดรถ'],['CM-SYN-1','Toyota','Vios','S'],['CM-SYN-2','Toyota','Revo','M']],
    Car_Brand:[['Car_Brand_ID','ยี่ห้อรถยนต์'],['CB-SYN-1','Toyota']],
    film_Brand:[['ID','ยี่ห้อฟิล์ม','รุ่นฟิล์ม'],['FB-SYN-1','G-TEC','CM15']],
    film_series:[['ID','รุ่นฟิล์ม','ยี่ห้อฟิล์ม','ราคา'],['FS-SYN-1','CM15','G-TEC','4000'],['FS-SYN-2','CM30','G-TEC','4500']],
    'พนักงานขาย':[['ID','พนักงานขาย'],['STAFF-SYN-1','ฝ่ายขายสมมติ']],
    'ตำแหน่งกระจก':[['ID','ตำแหน่งติดตั้ง'],['POS-SYN-1','เต็มคัน'],['POS-SYN-2','บานหน้า']],
    'สถานะการติดตาม':[['สถานะการติดตาม'],...options['สถานะการติดตาม'].map(s=>[s])],
    'รู้จักครั้งแรก':[['รู้จักครั้งแรก'],['Facebook'],['Google'],['ลูกค้าเก่า']],
    Promotion:[['Pro_ID','โปรโมชั่น','ส่วนลด','สถานะ','วันที่เริ่ม','วันที่สิ้นสุด'],['PRO-SYN-1','โปรโมชั่นสมมติ','0','ON','','']],
    Time:[['เวลา'],['09:00'],['10:00'],['13:00'],['15:00']],
    'สถิตการติดต่อ':[['วันที่','โทร','Line','FB','Tiktok','WalkIn','อื่นๆ']],
    'เป้ายอดขาย':[['เดือน','เป้ายอดขาย','หมายเหตุ']],
    Detail_film:[['ID','JobID','เหตุผลขอตัดฟิล์ม']],
    'เหตุผลขอตัดฟิล์ม':[['ID','เหตุผล','กลุ่ม']],
    memo:[['ID','ประเภท','วันที่','หัวข้อ','รายละเอียด','ผู้บันทึก','สถานะ','วันที่ลงรายการ']],
    data:[['MIS_ID','JobID','ตำแหน่งติดตั้ง','รุ่นฟิล์ม','กว้าง','ยาว','จำนวน','ทีมช่าง','เหตุผลขอตัดฟิล์ม','หมายเหตุ','วันที่ลงรายการ']],
    'ทีมช่าง':[['ID','ชื่อช่าง','สถานะ','หมายเหตุ'],['TECH-SYN-1','ช่างสมมติ','ใช้งาน','']],
    Waranty:[['WA_ID','JobID','การรับประกัน']],
    'ขนาดกระจก':[['ID','รุ่นรถยนต์','ขนาดรถ']],
    'กลุ่มราคา':[['ID','กลุ่มราคา'],['PRICE-SYN-1','S']]
  });
  let f=fixture({tables,bundleSource}),mutations=new Map();
  const flags={failReads:false,htmlCsv:false,failAfterWrite:false};
  function rows(name){const table=f.tables[name];if(!table)throw fault('ไม่พบตารางสมมติที่กำหนด: '+name,404);return table.slice(1).map(row=>Object.fromEntries(table[0].map((h,i)=>[h,row[i]??''])));}
  function append(name,values){const header=f.tables[name][0];f.sheets[name].appendRow(header.map(h=>values[h]??''));}
  append('Customer',{CustID:'C-SYN-1','ชื่อลูกค้า':'ลูกค้าสมมติ A','เบอร์โทรศัพท์':'0000000001','ช่องทางติดต่อ':'Line','ชื่อช่องทางติดต่อ':'synthetic-A'});
  for(const [suffix,name,status] of [['001','ลูกค้าสมมติ A','✅ ปิดการขายสำเร็จ'],['002','ลูกค้าสมมติ A · รถอีกคัน','🟡 สอบถามใหม่']])append('lead',{'Lead ID':'L-261027-'+suffix,'วันที่':today(),'Admin':'ฝ่ายขายสมมติ','ชื่อลูกค้า':name,'เบอร์โทร':'0000000001','ช่องทางติดต่อ':'Line','ชื่อช่องทางติดต่อ':'synthetic-A','ประเภทลูกค้า':'ลค.ใหม่','รู้จักเราจาก':'Facebook','สถานะการติดตาม':status});
  append('Bookings',{JobID:'J-SYN-1',CustID:'C-SYN-1','Lead ID':'L-261027-001','วันที่ติดตั้ง':today(),'เวลานัด':'09:00','ประเภทลูกค้า':'ลค.ใหม่','รุ่นรถยนต์':'Vios','ยี่ห้อฟิล์ม':'G-TEC','ตำแหน่งติดตั้ง':'เต็มคัน','มูลค่าสินค้า':'4280','ยอดขาย':'4280',Status:'เสร็จสิ้น'});
  const at=value=>value instanceof Date?new Date(value.getTime()+7*3600000).toISOString().slice(0,19).replace('T',' '):String(value??'');
  function leads(){
    return rows('lead').map(row=>{
      const fields=['date','admin','channel','contact','name','phone','carBrand','carModel','positions','filmBrand','filmModel','budget','customerType','knownFrom','followUp','note'];
      const data=Object.fromEntries(columns.map((name,i)=>[fields[i],at(row[name])]));data.date=data.date.slice(0,10);data.extraChannels=text(row['ช่องทางเพิ่มเติม']);
      const id=text(row['Lead ID']),found=rows('Customer').filter(c=>phone(data.phone)&&phone(data.phone)===phone(c['เบอร์โทรศัพท์']));
      const history=rows('ประวัติการติดต่อ').filter(h=>h['Lead ID']===id).map(h=>({id:h['Contact ID'],at:at(h['วันเวลาติดต่อ']).replace(' ','T'),by:h['ผู้ดูแล'],text:h['เรื่องที่คุย']}));
      return {id:'sheet-lead:'+id,leadId:id,name:data.name,phone:data.phone,salesperson:data.admin,note:data.note,status:data.followUp,sheetData:data,
        source:{platform:'sheet-lead'},readOnly:true,customerId:found.length===1?found[0].CustID:'',isCustomer:found.length===1,contactHistory:history,historyCount:history.length};
    });
  }
  function unique(name,key,value){const found=rows(name).filter(r=>text(r[key])===text(value));if(found.length!==1)throw fault('ไม่พบ '+key+' ที่ตรงเพียงรายการเดียว',409);return found[0];}
  function mutate(body){
    try{f.context.verifyWriteToken_(body);}catch(error){throw fault(error.message,403);}
    if(['upsertLead','updateLeadSheet'].includes(body.action)){
      const saved=f.save(body);if(!saved.success)throw fault(saved.error,409);return saved;
    }
    const name=body.sheetName;if(!['Customer','Bookings','PayIn'].includes(name))throw fault('Staging ไม่รองรับการเขียนตารางนี้');
    const spec={Customer:['CustID','CUS'],Bookings:['JobID','JOB'],PayIn:['Pay_ID','PAY']}[name],header=f.tables[name][0];
    const update=body.action==='update',id=update?text(body.recordId||body.custId):'';
    if(!['insert','update','',undefined].includes(body.action))throw fault('Staging ไม่รองรับ action นี้');
    const mutationId=text(body.mutationId),key=name+':'+mutationId;
    if(!update&&!/^[A-Za-z0-9_-]{8,100}$/.test(mutationId))throw fault('รายการใหม่ต้องมี mutationId สำหรับป้องกันคำขอซ้ำ');
    const fingerprint=JSON.stringify(Object.fromEntries(Object.keys(body).filter(k=>!['token','sessionToken'].includes(k)).sort().map(k=>[k,body[k]])));
    if(!update&&mutations.has(key)){
      const prior=mutations.get(key);if(prior.fingerprint!==fingerprint)throw fault('mutationId เดิมมีข้อมูลต่างกัน',409);
      unique(name,spec[0],prior.result.id);return {...prior.result};
    }
    const existing=update?unique(name,spec[0],id):null;
    if(name==='Customer'&&body['เบอร์โทรศัพท์']){
      const other=rows(name).filter(r=>phone(r['เบอร์โทรศัพท์'])===phone(body['เบอร์โทรศัพท์'])&&r.CustID!==id);if(other.length)throw fault('เบอร์โทรนี้มีลูกค้าอยู่แล้ว',409);
    }
    if(name==='Bookings'){
      unique('Customer','CustID',body.CustID||existing?.CustID);
      if(existing&&body.CustID&&body.CustID!==existing.CustID)throw fault('ห้ามเปลี่ยน CustID ของคิวเดิมในการทดสอบนี้',409);
      const leadId=text(body['Lead ID']||existing?.['Lead ID']);if(leadId)unique('lead','Lead ID',leadId);
      if(existing&&body['Lead ID']&&existing['Lead ID']&&body['Lead ID']!==existing['Lead ID'])throw fault('ห้ามเปลี่ยน Lead ID ของคิวเดิม',409);
      const previous=body.expectedStatus??body.previousStatus;if(existing&&previous!==undefined&&previous!==existing.Status)throw fault('สถานะเดิมเปลี่ยนไปแล้ว',409);
    }
    if(name==='PayIn'){unique('Bookings','JobID',body.JobID||existing?.JobID);if(existing&&body.JobID&&body.JobID!==existing.JobID)throw fault('Pay_ID ไม่ตรงกับ JobID',409);}
    if(bundleSource){
      const result=f.save(body);if(!result.success||result.verified!==true)throw fault(result.error||'Source snapshot did not verify the write',409);
      const written=unique(name,spec[0],result.id);if(name==='Bookings'&&body['Lead ID']&&written['Lead ID']!==body['Lead ID'])throw fault('Source snapshot did not preserve Lead ID',409);
      if(!update)mutations.set(key,{fingerprint,result});
      if(flags.failAfterWrite){flags.failAfterWrite=false;throw fault('จำลองการเชื่อมต่อขาดหลังบันทึก กรุณาส่งคำขอเดิม',503);}
      return result;
    }
    const record={...(existing||{}),...Object.fromEntries(header.filter(h=>h!==spec[0]&&Object.hasOwn(body,h)).map(h=>[h,body[h]])),[spec[0]]:existing?.[spec[0]]||f.context.generateId(spec[1])};
    const rowNumber=update?f.tables[name].findIndex((r,i)=>i>0&&text(r[header.indexOf(spec[0])])===id)+1:f.tables[name].length+1;
    f.sheets[name].getRange(rowNumber,1,1,header.length).setValues([header.map(h=>record[h]??'')]);
    const written=rows(name)[rowNumber-2];if(header.some(h=>text(written[h])!==text(record[h])))throw fault('ยังยืนยัน readback ไม่ได้',409);
    const result={success:true,id:record[spec[0]],action:update?'update':'insert',sheetName:name,rowNumber,verified:true};
    if(!update)mutations.set(key,{fingerprint,result});
    if(name==='Bookings')result.leadSync=f.context.syncCarBookingStatuses_(record.CustID,text(record['Lead ID']));
    if(flags.failAfterWrite){flags.failAfterWrite=false;throw fault('จำลองการเชื่อมต่อขาดหลังบันทึก กรุณาส่งคำขอเดิม',503);}
    return result;
  }
  function snapshot(){return clone({tables:Object.fromEntries(Object.entries(f.tables).map(([name,rows])=>[name,rows.map(row=>row.map(value=>value instanceof Date?{$date:value.toISOString()}:value))])),notes:[...f.notes],formats:[...f.formats],mutations:[...mutations]});}
  function restore(saved){
    if(!saved||!saved.tables||!Array.isArray(saved.notes)||!Array.isArray(saved.formats)||!Array.isArray(saved.mutations))throw fault('snapshot ไม่ครบ');
    if(JSON.stringify(Object.keys(saved.tables).sort())!==JSON.stringify(Object.keys(f.tables).sort()))throw fault('ชุดตาราง snapshot ไม่ตรง',409);
    for(const [name,table] of Object.entries(f.tables))if(JSON.stringify(saved.tables[name]?.[0])!==JSON.stringify(table[0]))throw fault('schema snapshot ไม่ตรง',409);
    const restored=Object.fromEntries(Object.entries(saved.tables).map(([name,rows])=>[name,rows.map(row=>row.map(value=>value&&typeof value==='object'&&typeof value.$date==='string'?new Date(value.$date):value))]));
    const next=fixture({tables:restored,bundleSource});for(const item of saved.notes)next.notes.set(...item);for(const item of saved.formats)next.formats.set(...item);
    f=next;mutations=new Map(clone(saved.mutations));
  }
  return {rows,leads,mutate,snapshot,restore,flags,options,today,fixture:()=>f};
}
module.exports={createModel,today};
