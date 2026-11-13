'use strict';
// Local, memory-only simulator. There is deliberately no HTTP client, proxy, CRM env or database access.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createModel}=require('./staging-model.cjs');
const root=path.resolve(__dirname,'../..');
const pages=['lead-data.html','customer-data.html','index.html','contact-stats.html','sales-summary.html','overview.html','install-summary.html','crm-login.html'];
const files=new Set([...pages,'lead-data-app.js','lead-data-core.js','lead-data.css','lead-sheet.js','first-known-options.js','sidebar.js','crm-auth.js','crm-login.js','crm-login.css','page-heading.css','apple-style.css','booking-form-layout.js','booking-form-layout.css','booking-read-model.js','film-brands.js','contact-report-summary.js','overview-ui.css','overview-presentation.js','overview-memo-manager.js','commission-auth.js','app.webmanifest']);
const assets={
  'tailwind.css':path.join(__dirname,'.local/tailwind.css'),
  'papaparse.js':path.join(__dirname,'node_modules/papaparse/papaparse.min.js'),
  'chart.js':path.join(__dirname,'node_modules/chart.js/dist/chart.umd.js'),
  'datalabels.js':path.join(__dirname,'node_modules/chartjs-plugin-datalabels/dist/chartjs-plugin-datalabels.min.js'),
  'lucide.js':path.join(__dirname,'node_modules/lucide/dist/umd/lucide.min.js'),
  'xlsx.js':path.join(__dirname,'node_modules/xlsx/dist/xlsx.full.min.js')
};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
function transform(name,source){
  let text=source.replace(/https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/g,'/__stage/apps-script')
    .replace(/(['"])https:\/\/docs\.google\.com\/spreadsheets\/d\/\1\s*\+\s*SHEET_ID\s*\+\s*(['"])\/gviz\/tq/g,"'/__stage/gviz")
    .replace(/https:\/\/docs\.google\.com\/spreadsheets\/d\/(?:\$\{SHEET_ID\}|[A-Za-z0-9_-]+)\/gviz\/tq/g,'/__stage/gviz')
    .replace(/(const SHEET_ID\s*=\s*['"])[^'"]+(['"])/g,'$1STAGING_MEMORY$2')
    .replace(/https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/PapaParse\/[^/'"]+\/papaparse.min.js/g,'/__stage/vendor/papaparse.js')
    .replace(/https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/xlsx\/[^/'"]+\/xlsx.full.min.js/g,'/__stage/vendor/xlsx.js')
    .replace(/https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/font-awesome\/[^/'"]+\/css\/all.min.css/g,'/__stage/vendor/fontawesome/css/all.min.css')
    .replace(/https:\/\/cdn.jsdelivr.net\/npm\/chartjs-plugin-datalabels(?:@[^'"\s<>]+)?/g,'/__stage/vendor/datalabels.js')
    .replace(/https:\/\/cdn.jsdelivr.net\/npm\/chart.js(?:@[^'"\s<>]+)?/g,'/__stage/vendor/chart.js')
    .replace(/https:\/\/unpkg.com\/lucide@latest/g,'/__stage/vendor/lucide.js');
  if(name==='crm-auth.js')text=text.replace('const cloud =','const cloud = true ||').replace("credentials:remote ? 'omit' : 'same-origin'","credentials:'same-origin'");
  if(name.endsWith('.html')){
    text=text.replace(/<script[^>]+src=["']https:\/\/cdn.tailwindcss.com[^"']*["'][^>]*><\/script>/g,'<link rel="stylesheet" href="/__stage/vendor/tailwind.css">')
      .replace(/<link[^>]+(?:href=["']https:\/\/fonts.googleapis.com)[^>]*>/g,'')
      .replace(/https:\/\/(?:unpkg.com|cdn.jsdelivr.net\/npm)\/@phosphor-icons\/web(?:@[^/'"\s>]+)?(?:\/src\/regular\/style.css)?/g,'/__stage/vendor/phosphor/regular/style.css')
      .replace('<html lang="th"','<html data-lead-transport="apps-script" lang="th"');
    const bootstrap='<script>window.tailwind={};localStorage.setItem("carCrmWriteToken","synthetic-write-token");</script>';
    const bannerStyle='<style>.stage-context-banner{padding:8px 16px;background:#fffbeb;color:#92400e;border-bottom:1px solid #fcd34d;font:13px/1.5 Prompt,sans-serif;pointer-events:none}@media(min-width:1024px){.stage-context-banner{margin-left:18rem}}@media(max-width:1023px){.stage-context-banner{margin-top:64px}}</style>';
    text=text.replace(/<head([^>]*)>/,'<head$1>'+bootstrap+bannerStyle).replace(/<body([^>]*)>/,'<body$1><div role="status" class="stage-context-banner">STAGING · ข้อมูลสมมติ · บันทึกในหน่วยความจำ</div>').replace('<title>','<title>STAGING · ');
    if(name==='crm-login.html')text=text.replace('value="admin"','value="staging"');
  }
  if(/https:\/\/(?:script.google.com\/macros|docs.google.com\/spreadsheets)/.test(text))throw Error('Unmapped production data endpoint in '+name);
  return text;
}
function createStagingServer({model=createModel()}={}){
  const sessions=new Map(),stats={requests:0,writes:0,cspViolations:0},violations=[];
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  async function input(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>1024*1024)throw Object.assign(Error('Request too large'),{status:413});}return text?JSON.parse(text):{};}
  function authenticated(req,body={}){
    const cookie=/carStageSession=([A-Za-z0-9_-]+)/.exec(req.headers.cookie||'')?.[1];
    return [body.sessionToken,cookie].some(token=>token&&sessions.get(token)>Date.now());
  }
  const server=http.createServer(async(req,res)=>{
    stats.requests++;
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; worker-src 'none'; report-uri /__stage/csp");
    try{
      const origin='http://127.0.0.1:'+server.address().port;
      if(req.headers.host!==new URL(origin).host)throw Object.assign(Error('Only the local staging host is allowed'),{status:403});
      const url=new URL(req.url,origin);
      if(req.method==='POST'&&req.headers.origin&&req.headers.origin!==origin)throw Object.assign(Error('Cross-origin writes are forbidden'),{status:403});
      if(url.pathname==='/__stage/csp'&&req.method==='POST'){await input(req);stats.cspViolations++;violations.push('Browser CSP blocked an unmapped resource');return json(res,200,{ok:true});}
      if(url.pathname==='/__stage/apps-script'){
        if(req.method==='GET')return json(res,200,{contactHistoryDeletion:1,contactHistoryEdit:model.fixture().context.CAR_CONTACT_HISTORY_EDIT_VERSION_||0,backendVersion:'2026-09-23-payin-four-proofs'});
        const body=await input(req);
        if(url.searchParams.get('crmAuth')==='1'){
          if(body.action==='login'){
            if(body.user!=='staging'||body.password!=='staging-only')return json(res,401,{ok:false,error:'ชื่อผู้ใช้หรือรหัสผ่านทดสอบไม่ถูกต้อง'});
            const token=crypto.randomBytes(32).toString('base64url'),expiresAt=Date.now()+3600000;sessions.set(token,expiresAt);
            res.setHeader('Set-Cookie','carStageSession='+token+'; HttpOnly; SameSite=Strict; Path=/');
            return json(res,200,{ok:true,authenticated:true,sessionToken:token,expiresAt});
          }
          if(body.action==='logout'){sessions.clear();res.setHeader('Set-Cookie','carStageSession=; Max-Age=0; Path=/');return json(res,200,{ok:true});}
          return json(res,200,{ok:true,configured:true,authenticated:authenticated(req,body),expiresAt:Date.now()+3600000});
        }
        if(!authenticated(req,body))return json(res,401,{ok:false,code:401,error:'เซสชันทดสอบหมดอายุ กรุณาเข้าสู่ระบบใหม่'});
        if(url.searchParams.get('crmLead')==='1'){
          if(model.flags.failReads&&['records','sheet-leads'].includes(body.action))throw Object.assign(Error('จำลองการอ่านข้อมูลไม่สำเร็จ'),{status:503});
          const actions={config:()=>({local:false,storage:'staging-memory',lineConfigured:false,facebookConfigured:false,instagramConfigured:false}),
            session:()=>({id:'STAGING',name:'ผู้ใช้ทดสอบ · STAGING',mode:'apps-script'}),options:()=>model.options,
            records:()=>({leads:[],installations:[],sheetLeads:model.leads()}),'sheet-leads':()=>({leads:model.leads()}),
            'sheet-status':()=>({contacts:[],leads:model.leads()}),inbox:()=>({contacts:[],account:'synthetic',hasMore:false})};
          if(!actions[body.action])throw Object.assign(Error('Unsupported staging Lead action'),{status:400});
          return json(res,200,{ok:true,...actions[body.action]()});
        }
        const result=model.mutate(body);stats.writes++;return json(res,200,result);
      }
      if(url.pathname==='/api/lead-data/sheet-leads'){
        if(!authenticated(req))return json(res,401,{error:'Staging sign-in required'});
        if(model.flags.failReads)throw Object.assign(Error('จำลองการอ่านข้อมูลไม่สำเร็จ'),{status:503});
        return json(res,200,{leads:model.leads()});
      }
      if(url.pathname==='/__stage/control'){
        if(!authenticated(req))return json(res,401,{ok:false,error:'Staging sign-in required'});
        if(req.method==='GET')return json(res,200,{ok:true,stats,violations,flags:model.flags,counts:{leads:model.leads().length,customers:model.rows('Customer').length,bookings:model.rows('Bookings').length}});
        const body=await input(req);
        if(body.action==='flags')Object.assign(model.flags,Object.fromEntries(['failReads','htmlCsv','failAfterWrite'].filter(k=>typeof body[k]==='boolean').map(k=>[k,body[k]])));
        else if(body.action==='snapshot')return json(res,200,{ok:true,snapshot:model.snapshot()});
        else if(body.action==='restore')model.restore(body.snapshot);
        else if(body.action==='expire-session')sessions.clear();
        else throw Object.assign(Error('Unsupported staging control action'),{status:400});
        return json(res,200,{ok:true});
      }
      if(url.pathname==='/__stage/gviz'){
        if(!authenticated(req))return json(res,401,{error:'Staging sign-in required'});
        if(model.flags.htmlCsv){res.writeHead(200,{'Content-Type':'text/html'});return res.end('<html>synthetic login response</html>');}
        const name=url.searchParams.get('sheet'),rows=model.rows(name),allHeaders=model.fixture().tables[name][0],query=url.searchParams.get('tq')||'';
        const select=/^select\s+([A-Z]{1,2}(?:\s*,\s*[A-Z]{1,2})*)(?=\s|$)/i.exec(query)?.[1];
        const columnIndex=letters=>[...letters.toUpperCase()].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
        const headers=select?select.split(',').map(s=>allHeaders[columnIndex(s.trim())]).filter(Boolean):allHeaders;
        const where=/\bwhere\s+([A-Z]+)\s*=\s*'([^']*)'/i.exec(query),filtered=where?rows.filter(row=>String(row[allHeaders[columnIndex(where[1])]])===where[2]):rows;
        const value=v=>v instanceof Date?new Date(v.getTime()+7*3600000).toISOString().slice(0,19).replace('T',' '):String(v??'');
        if(url.searchParams.get('tqx')==='out:json'){
          res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8'});
          return res.end('google.visualization.Query.setResponse('+JSON.stringify({status:'ok',table:{cols:headers.map(label=>({label,type:'string'})),rows:filtered.map(row=>({c:headers.map(h=>({v:value(row[h]),f:value(row[h])}))}))}})+');');
        }
        const csv=line=>line.map(v=>'"'+value(v).replaceAll('"','""')+'"').join(',');
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8'});return res.end([csv(headers),...filtered.map(row=>csv(headers.map(h=>row[h])))].join('\n'));
      }
      if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
      if(url.pathname==='/'){res.writeHead(302,{Location:'/lead-data.html#leads'});return res.end();}
      if(url.pathname==='/desktop'||url.pathname==='/mobile'){
        const width=url.pathname==='/mobile'?375:1366,entry=pages.includes(url.searchParams.get('page'))?url.searchParams.get('page'):'lead-data.html';
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end('<html lang="th"><title>STAGING '+width+' px</title><body style="margin:0"><iframe title="STAGING '+width+' px" src="/'+entry+(entry==='lead-data.html'?'#leads':'')+'" style="width:'+width+'px;height:900px;border:0"></iframe></body></html>');
      }
      const name=decodeURIComponent(url.pathname.slice(1));let file;
      if(name.startsWith('__stage/vendor/')){
        const asset=name.slice('__stage/vendor/'.length);file=assets[asset];
        for(const [prefix,dir]of [['fontawesome/','@fortawesome/fontawesome-free'],['phosphor/','@phosphor-icons/web/src']])if(asset.startsWith(prefix)&&/\.(css|woff2?|ttf|svg)$/.test(asset)){
          const base=path.join(__dirname,'node_modules',dir),candidate=path.resolve(base,asset.slice(prefix.length));if(candidate.startsWith(base+path.sep))file=candidate;
        }
      }else if(files.has(name)||/^images\/[A-Za-z0-9_.-]+\.(png|svg|webp)$/.test(name))file=path.join(root,name);
      if(!file||!fs.existsSync(file))return json(res,404,{error:'Not in the staging asset allowlist'});
      const ext=path.extname(file);res.setHeader('Content-Type',mime[ext]||'application/octet-stream');
      const bytes=fs.readFileSync(file);return res.end(file.startsWith(root+path.sep)&&!name.startsWith('__stage/')&&['.html','.js'].includes(ext)?transform(name,bytes.toString('utf8')):bytes);
    }catch(error){json(res,error.status||500,{ok:false,success:false,code:error.status||500,error:error.status?error.message:'Staging adapter error'});}
  });
  return {server,model,stats,listen:(port=3193)=>new Promise(resolve=>server.listen(port,'127.0.0.1',()=>resolve(server.address())))};
}
if(require.main===module){
  for(const file of Object.values(assets))if(!fs.existsSync(file))throw Error('Offline assets missing. Run npm ci and npm run prepare:assets in experiments/p0 first.');
  const args=process.argv.slice(2),sourceAt=args.indexOf('--source-dir'),sourceDir=sourceAt>=0?args[sourceAt+1]:null;
  if(sourceAt>=0&&!sourceDir)throw Error('Pass a verified private source snapshot directory');
  const bundleSource=sourceDir?fs.readFileSync(path.join(path.resolve(sourceDir),'code.gs'),'utf8'):null;
  const stage=createStagingServer({model:createModel({bundleSource})});stage.listen(3193).then(address=>console.log('CAR CRM synthetic staging: http://127.0.0.1:'+address.port+'/lead-data.html#leads (staging / staging-only); writer='+ (bundleSource?'authorized source snapshot in VM':'contract simulator')));
}
module.exports={createStagingServer,transform,pages};
