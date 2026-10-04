const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function element() {
 return { value:'', textContent:'', children:[], open:false, classList:{add(){},remove(){}},
 replaceChildren(){this.children=[];}, append(...nodes){this.children.push(...nodes);},
 appendChild(node){this.children.push(node);}, addEventListener(event,fn){this[event]=fn;}, focus(){this.focused=true;},
 get options(){return this.children;}, set innerHTML(value){this.children=[];} };
}
const elements = {};
const get = id => elements[id] ||= element();
const context=vm.createContext({document:{getElementById:get,createElement:element}});
context.window=context;
vm.runInContext(read('film-brands.js'),context);
const brands=context.FilmBrands;
assert.equal(JSON.stringify(brands.parse(' A, B, A , - ')), '["A","B"]');
brands.set('A, Legacy');
brands.populate(['A','B']);
assert.equal(get('bk-filmBrand').value,'A, Legacy');
assert.equal(get('bk-filmBrandOptions').children.length,3);
const check=get('bk-filmBrandOptions').children[1].children[0];
check.checked=true;check.change();
assert.equal(get('bk-filmBrand').value,'A, Legacy, B');
check.checked=false;check.change();
assert.equal(get('bk-filmBrand').value,'A, Legacy');
brands.set('');assert.equal(brands.validate(),false);
brands.set('A');assert.equal(brands.validate(),true);
const models=[{brand:'A',full:'A - 15'},{brand:'B',full:'B - 35'},{brand:'C',full:'C - 50'},{brand:'A',full:'A - 15'},{brand:'A',full:'A Plus - 20'}];
assert.equal(JSON.stringify(brands.filterModels(models,'A, B').map(m=>m.full)), '["A - 15","B - 35","A Plus - 20"]');
assert.equal(brands.filterModels(models,'Unknown').length,0);
assert.equal(brands.filterModels(models,'A Plus')[0].full,'A Plus - 20');
const html=read('index.html');
const fn=html.match(/        function openDetailFilmModal\(\) \{[\s\S]*?(?=        function closeDetailFilmModal)/)[0];
const select=element();select.name='บานหน้า';
context.document.querySelectorAll=()=>[select];
context.currentViewJobId='TEST';
context.allData=[{id:'TEST',film:'A, B',filmDetails:{'บานหน้า':'Legacy - 70'}}];
context.filmSeriesOptions=models;
context.reasonOptions=[];
context.findRowValue=(row,keys,fallback='')=>row[keys[0]]||fallback;
vm.runInContext(fn+'\nopenDetailFilmModal();',context);
assert.equal(get('df-brand').value,'A, B');
assert.equal(select.value,'Legacy - 70');
assert.ok(select.children.some(o=>o.value==='A - 15'));
assert.ok(select.children.some(o=>o.value==='B - 35'));
assert.ok(!select.children.some(o=>o.value==='C - 50'));
for(const file of ['index.html','customer-data.html','technician.html','technician-queue.html']) {
 const scripts=[...read(file).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
 new vm.Script(scripts,{filename:file});
}
console.log('Film brand selection, reload preservation, model filtering, legacy detail and page syntax checks passed.');
