'use strict';
// Local-only checks, including an ephemeral loopback HTTP server with synthetic data; no external requests.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const files=['experiments/lead-intelligence.js','experiments/lead-intelligence.test.js',
  ...fs.readdirSync(__dirname).filter(file => file.endsWith('.cjs')).map(file => 'experiments/p0/'+file),
  'Code.gs','CarContactHistory.gs','CarBookingStatusSync.gs','LeadSheet.gs','crm-auth.js','lead-data-app.js','contact-report-summary.js'];
for (const file of files) new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});
console.log('Syntax passed: '+files.length+' JavaScript / Apps Script files');
let inlineCount=0;
for(const file of ['lead-data.html','customer-data.html','contact-stats.html','overview.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(/\bsrc\s*=|application\/ld\+json/i.test(match[1])||!match[2].trim())continue;
    new vm.Script(match[2],{filename:file+':inline-'+(++inlineCount)});
  }
}
console.log('Inline syntax passed: '+inlineCount+' scripts in 4 affected pages');
const tests=fs.readdirSync(__dirname).filter(file=>file.endsWith('.test.cjs')).map(file=>'experiments/p0/'+file);
for (const args of [['experiments/lead-intelligence.test.js'],['--test',...tests]]) {
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',env:{...process.env,TZ:'Asia/Bangkok'}});
  if (result.error) throw result.error;
  if (result.status!==0) process.exit(result.status || 1);
}
console.log('Offline checks passed. Reproduction tests document open defects; this is not deployment approval.');
