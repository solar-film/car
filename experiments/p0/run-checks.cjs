'use strict';
// All child processes run local JavaScript only; this runner never starts a service.
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
for (const args of [['experiments/lead-intelligence.test.js'],['--test','experiments/p0/legacy-regression.test.cjs','experiments/p0/staging-audit.test.cjs']]) {
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',env:{...process.env,TZ:'Asia/Bangkok'}});
  if (result.error) throw result.error;
  if (result.status!==0) process.exit(result.status || 1);
}
console.log('Offline checks passed. Reproduction tests document open defects; this is not deployment approval.');
