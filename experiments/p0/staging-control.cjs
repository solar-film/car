'use strict';
// Operator controls for the local synthetic simulator only, never a browser or a remote CRM.
const fs=require('node:fs'),path=require('node:path');
const base='http://127.0.0.1:3193';
async function main(){
  const login=await fetch(base+'/__stage/apps-script?crmAuth=1',{method:'POST',headers:{Origin:base},body:JSON.stringify({action:'login',user:'staging',password:'staging-only'})});
  if(!login.ok)throw Error('Local staging login failed');
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const headers={Origin:base,Cookie:cookie,'Content-Type':'application/json'};
  async function control(body){const r=await fetch(base+'/__stage/control',{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok)throw Error(value.error);return value;}
  const [command='status',name='backup.json']=process.argv.slice(2);
  if(command==='status')return console.log(JSON.stringify(await control(),null,2));
  if(command==='reconcile'){
    const snapshot=(await control({action:'snapshot'})).snapshot,{reconcile}=require('./reconciliation.cjs'),{today}=require('./staging-model.cjs');
    return console.log(JSON.stringify(reconcile(snapshot,today()),null,2));
  }
  if(command==='fault-on'||command==='fault-off')return console.log(await control({action:'flags',failReads:command==='fault-on'}));
  if(command==='reference'){
    if(!['film_Brand','Promotion','Car_model'].includes(name))throw Error('Unsupported synthetic reference');
    const r=await fetch(base+'/__stage/gviz?sheet='+encodeURIComponent(name),{headers});return console.log(await r.text());
  }
  if(command==='seed-promotion'){
    const saved=(await control({action:'snapshot'})).snapshot;
    if(!saved.tables.Promotion.some(row=>row[0]==='PRO-SYN-1'))saved.tables.Promotion.push(['PRO-SYN-1','โปรโมชั่นสมมติ','0','ON','','']);
    await control({action:'restore',snapshot:saved});return console.log('Synthetic promotion added; no production table is accessible.');
  }
  if(!/^[A-Za-z0-9_-]+\.json$/.test(name))throw Error('Use a simple local JSON backup name');
  const folder=path.join(__dirname,'.local'),file=path.join(folder,name);fs.mkdirSync(folder,{recursive:true});
  if(command==='snapshot'){fs.writeFileSync(file,JSON.stringify((await control({action:'snapshot'})).snapshot,null,2)+'\n');return console.log('Synthetic backup saved locally: '+name);}
  if(command==='restore'){
    const snapshot=JSON.parse(fs.readFileSync(file,'utf8'));await control({action:'restore',snapshot});
    if(JSON.stringify((await control({action:'snapshot'})).snapshot)!==JSON.stringify(snapshot))throw Error('Restore readback differs');
    return console.log('Synthetic restore readback verified.');
  }
  throw Error('Unsupported local control command');
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
