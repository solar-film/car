'use strict';
// Explicitly supplied local snapshot only; no default credentials or production connection.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const folder=process.argv[2];if(!folder)throw Error('Pass the private authorized source snapshot directory');
const file=path.join(path.resolve(folder),'code.gs'),source=fs.readFileSync(file,'utf8');
new vm.Script(source,{filename:'authorized-source-snapshot.gs'});
if(!source.includes('function upsertCarLeadSheet_')||!source.includes('function syncCarBookingStatuses_'))throw Error('Expected complete CAR writer bundle');
const result=spawnSync(process.execPath,['--test','experiments/p0/staging-flow.test.cjs'],{cwd:path.resolve(__dirname,'../..'),stdio:'inherit',env:{...process.env,TZ:'Asia/Bangkok',CAR_P0_SOURCE_SNAPSHOT:file}});
if(result.error)throw result.error;
process.exitCode=result.status||0;
