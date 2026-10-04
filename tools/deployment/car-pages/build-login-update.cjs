'use strict';
// Patch the verified live snapshot, not the unrelated local page revisions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..');
const work=path.join(root,'tmp/github-login-20261003');
const acorn=require(path.join(work,'auth-deps/node_modules/acorn'));
const remote=path.join(work,'remote',fs.readdirSync(path.join(work,'remote'))[0]);
const output=path.join(work,'public');
const names=new Set(['initLogin','setupLogin','doLogin','requestCommissionAccess','openTechnicianCommission']);
const remove=new Set(['LOGIN_USER','LOGIN_PASS','LOGIN_KEY','COMMISSION_PASS','COMMISSION_ACCESS_KEY','TECH_COMMISSION_ACCESS_KEY']);
function walk(node,visit){if(!node||typeof node!=='object')return;visit(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(n=>walk(n,visit));else if(value&&typeof value==='object')walk(value,visit);}}
function blocks(html){return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].filter(m=>m[1].trim()).map(m=>({code:m[1],offset:m.index+m[0].indexOf('>')+1}));}
function definitions(html){const found=new Map();for(const {code} of blocks(html)){const ast=acorn.parse(code,{ecmaVersion:'latest'});walk(ast,n=>{const name=n.type==='FunctionDeclaration'?n.id?.name:n.type==='VariableDeclarator'?n.id?.name:null;if(names.has(name))found.set(name,code.slice(n.start,n.end));});}return found;}
const changes=[];fs.mkdirSync(output,{recursive:true});
for(const file of fs.readdirSync(remote).filter(f=>f.endsWith('.html'))){
 const before=fs.readFileSync(path.join(remote,file),'utf8');
 if(!before.includes('carCrmLoggedIn'))continue;
 const replacements=definitions(fs.readFileSync(path.join(root,file),'utf8'));
 const edits=[];
 for(const {code,offset} of blocks(before)){
  const ast=acorn.parse(code,{ecmaVersion:'latest'});
  walk(ast,n=>{
   const name=n.type==='FunctionDeclaration'?n.id?.name:n.type==='VariableDeclarator'?n.id?.name:null;
   if(names.has(name)){assert(replacements.has(name),file+': missing '+name);edits.push({start:offset+n.start,end:offset+n.end,text:replacements.get(name),label:name});}
   if(n.type==='VariableDeclaration'&&n.declarations.every(d=>remove.has(d.id.name)))edits.push({start:offset+n.start,end:offset+n.end,text:'',label:'remove-client-credential'});
  });
  if(file==='price-audit.html') {
   const isLoad=n=>n.type==='ExpressionStatement' && n.expression.type==='CallExpression' && n.expression.callee.property?.name==='addEventListener' && n.expression.arguments[0]?.value==='load';
   const old=ast.body.find(isLoad);if(old){
    let replacement;
    for(const block of blocks(fs.readFileSync(path.join(root,file),'utf8'))){const parsed=acorn.parse(block.code,{ecmaVersion:'latest'}),event=parsed.body.find(isLoad),unlock=parsed.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='unlockPage');if(event&&unlock)replacement=block.code.slice(unlock.start,unlock.end)+'\n\n'+block.code.slice(event.start,event.end);}
    assert(replacement,'Missing price login replacement');edits.push({start:offset+old.start,end:offset+old.end,text:replacement,label:'shared-login-load-handler'});
   }
  }
 }
 if(file==='accounting.html'){
  const old="if (localStorage.getItem(LOGIN_KEY) === '1')";
  assert.equal(before.split(old).length,2);
  const at=before.indexOf(old);edits.push({start:at,end:at+old.length,text:'window.CarCrmAuth.onLogin(unlockPage);\n        if (window.CarCrmAuth.isLoggedIn())',label:'shared-session-restore'});
 }
 edits.sort((a,b)=>b.start-a.start);let text=before,previous=before.length;
 for(const e of edits){assert(e.end<=previous,'Overlapping edits');text=text.slice(0,e.start)+e.text+text.slice(e.end);previous=e.start;}
 assert(!/\bLOGIN_(?:USER|PASS|KEY)\b|\bCOMMISSION_PASS\b/.test(text),file+': leftover client credential');
 assert(text.includes('CarCrmAuth'),file+': auth integration absent');
 text=text.replace('</head>','    <script src="crm-auth.js?v=20261003-github-1" defer></script>\n</head>');
 if(text.includes('commission-auth.js'))text=text.replace(/src="commission-auth\.js(?:\?[^"]*)?"/g,'src="commission-auth.js?v=20261003-github-1"');
 for(const {code} of blocks(text))acorn.parse(code,{ecmaVersion:'latest'});
 fs.writeFileSync(path.join(output,file),text);
 changes.push({file,edits:edits.map(e=>e.label),beforeSha256:crypto.createHash('sha256').update(before).digest('hex'),afterSha256:crypto.createHash('sha256').update(text).digest('hex')});
}
for(const file of ['crm-auth.js','commission-auth.js'])fs.copyFileSync(path.join(root,file),path.join(output,file));
fs.writeFileSync(path.join(work,'login-update-manifest.json'),JSON.stringify({base:JSON.parse(fs.readFileSync(path.join(work,'remote-head.json'),'utf8')).sha,changes,newAssets:['crm-auth.js'],updatedAssets:['commission-auth.js']},null,2));
console.log(JSON.stringify({pages:changes.length,files:changes.map(c=>c.file),output}));
