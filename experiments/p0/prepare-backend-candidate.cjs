'use strict';
// Build a complete private candidate from an authorized snapshot; never connects to Apps Script or deploys.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const input=process.argv[2];if(!input)throw Error('Pass the verified private Apps Script snapshot directory');
const sourceRoot=path.resolve(input),output=path.join(__dirname,'.local/backend-candidate');
const files=['appsscript.json','code.gs','CarContactStatsSync.gs','CarCrmAuth.gs','CarLeadAutoCapture.gs','CarLeadChatFill.gs','CarLeadService.gs'];
const pick=source=>{const a=source.indexOf('function carBookingStatusPlan_('),b=source.indexOf('function carReadStatusSyncTable_(',a);if(a<0||b<a)throw Error('Planner extraction boundaries missing');return {a,b,text:source.slice(a,b)};};
const candidate=pick(fs.readFileSync(path.join(__dirname,'../../CarBookingStatusSync.gs'),'utf8')).text;
const prepared=files.map(file=>{
  const original=fs.readFileSync(path.join(sourceRoot,file),'utf8');let content=original;
  if(file==='code.gs'){const old=pick(original);content=original.slice(0,old.a)+candidate+original.slice(old.b);new vm.Script(content);}
  else if(file.endsWith('.gs'))new vm.Script(content);
  else if(JSON.parse(content).timeZone!=='Asia/Bangkok')throw Error('Unexpected manifest timezone');
  return {file,content,changed:content!==original,sha256:crypto.createHash('sha256').update(content).digest('hex')};
});
if(prepared.filter(f=>f.changed).length!==1)throw Error('Only the bounded planner patch may differ from the verified snapshot');
fs.mkdirSync(output,{recursive:true});
for(const name of fs.readdirSync(output))if(![...files,'manifest.private.json'].includes(name))throw Error('Unexpected file in candidate; review manually: '+name);
for(const entry of prepared)fs.writeFileSync(path.join(output,entry.file),entry.content,'utf8');
fs.writeFileSync(path.join(output,'manifest.private.json'),JSON.stringify({deployAllowed:false,source:'authorized-read-only-snapshot',changedFunction:'carBookingStatusPlan_',files:prepared.map(({content,...entry})=>entry)},null,2)+'\n');
console.log('Private backend candidate prepared: 7 files; only carBookingStatusPlan_ changed. No deployment configuration created.');
