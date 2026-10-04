'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname,'../price-audit.html'),'utf8');
test('a sheet car label containing HTML remains text in the rendered price title',()=>{
    const elements = {};
    const element = id => elements[id] ||= {value:'selected',innerHTML:'',classList:{add(){},remove(){}}};
    const context = vm.createContext({document:{getElementById:element},
        findSelectedCar:()=>({car:{model:'<img src=x onerror="window.bad=true">'}}),
        formatModelLine:car=>car.model,getPriceRowsForCar:()=>[{}],
        selectableFilmBrands:[{key:'fixture',label:'Fixture'}],selectedFilmBrands:new Set(['fixture']),selectedProId:'promo',
        orderRows:rows=>rows,isSummaryRow:()=>false,formatPreviewValue:()=>'',priceRowClass:()=>'',getPriceKey:()=>'',getPricePosition:()=>'',notifyEmbedHeight(){}});
    const escape = html.slice(html.indexOf('        function escapeHtml('),html.indexOf('        function getFirstField('));
    const render = html.slice(html.indexOf('        function renderPriceTable()'),html.indexOf('        function notifyEmbedHeight()'));
    vm.runInContext(escape + render,context);context.renderPriceTable();
    assert.match(elements.priceTableTitle.innerHTML,/&lt;img src=x onerror=&quot;window.bad=true&quot;&gt;/);
    assert.doesNotMatch(elements.priceTableTitle.innerHTML,/<img/);
    assert.match(elements.priceTableEl.innerHTML,/<table/);
});
