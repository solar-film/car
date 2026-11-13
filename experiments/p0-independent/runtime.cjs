'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'../..',file),'utf8');
function backend({token='fixture-write-only',locked=true}={}) {
  const calls={opens:0,locks:0,releases:0,leadWrites:0,rows:[]},cache=new Map();
  const sheet={appendRow(row){calls.rows.push(row);},getLastRow:()=>calls.rows.length+1};
  const context=vm.createContext({
    console:{log(){},warn(){},error(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>token})},
    LockService:{getScriptLock:()=>({tryLock(){calls.locks++;return locked;},hasLock:()=>locked,releaseLock(){calls.releases++;}})},
    SpreadsheetApp:{openById(){calls.opens++;return{getSheetByName:()=>sheet};},flush(){}},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
    CacheService:{getScriptCache:()=>({get:key=>cache.get(key),put:(key,value)=>cache.set(key,value)})}
  });
  vm.runInContext(read('Code.gs'),context,{filename:'Code.gs'});
  context.upsertCarLeadSheet_=()=>{calls.leadWrites++;return {success:true,verified:true};};
  function stubBookingStorage() {
    // Storage adapters only. Validation and routing still execute the real doPost.
    context.ensurePlainTextColumns_=()=>{};
    context.generateId=()=> 'JOB-FIXTURE-'+(calls.rows.length+1);
    context.isUnique=()=>true;
    context.thaiTimestamp=()=> '2026-10-27 12:00:00';
    context.assertWrittenRow_=(_s,_schema,rowNumber)=>({rowNumber});
    context.syncCarBookingStatuses_=()=>({matched:0});
  }
  const post=body=>{
    const result=context.doPost({postData:{contents:JSON.stringify(body)}});
    return result?.text?JSON.parse(result.text):result;
  };
  return {context,calls,post,stubBookingStorage};
}
function syncPlan(leads,customers,bookings) {
  const context=vm.createContext({});
  vm.runInContext(read('CarBookingStatusSync.gs'),context);
  return JSON.parse(JSON.stringify(context.carBookingStatusPlan_(leads,customers,bookings)));
}
const customer={CustID:'C-FIXTURE','เบอร์โทรศัพท์':'0810000001','ช่องทางติดต่อ':'Line','ชื่อช่องทางติดต่อ':'fixture'};
const lead=id=>({'Lead ID':id,'วันที่':'2026-10-01','เบอร์โทร':'0810000001','ช่องทางติดต่อ':'Line','ชื่อช่องทางติดต่อ':'fixture','สถานะการติดตาม':'🟡 สอบถามใหม่'});
const booking=(id,date,status,lid='')=>({JobID:id,CustID:'C-FIXTURE','วันที่ติดตั้ง':date,'เวลานัด':'13:00',Status:status,'Lead ID':lid});
module.exports={backend,syncPlan,customer,lead,booking,read};
