'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('overview heading follows the selected month and supports the all-months view', () => {
    const html = fs.readFileSync(require.resolve('../overview.html'), 'utf8');
    const elements = new Map();
    const context = vm.createContext({ Date, document: {
        addEventListener() {},
        getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); }
    } });
    context.window = context;
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (!/\bsrc=/.test(script[1])) vm.runInContext(script[2], context);
    }
    vm.runInContext("cacheDom(); renderPeriodLabels('2026-10')", context);
    assert.equal(elements.get('overviewTitle').innerText, 'ภาพรวมธุรกิจ เดือน ตค. 69');
    vm.runInContext("renderPeriodLabels('2026-09')", context);
    assert.equal(elements.get('overviewTitle').innerText, 'ภาพรวมธุรกิจ เดือน กย. 69');
    vm.runInContext("renderPeriodLabels('')", context);
    assert.equal(elements.get('overviewTitle').innerText, 'ภาพรวมธุรกิจ ทุกเดือน');
    assert.doesNotMatch(html, /overview-hero-quote|ให้ทุกเส้นทางชัดเจนกว่าเดิม/);
});

test('larger overview title takes precedence over shared important heading styles', () => {
    const css = fs.readFileSync(require.resolve('../overview-ui.css'), 'utf8');
    const heading = css.match(/\.overview-header h1\.car-page-heading-title\s*\{([^}]+)\}/)[1];
    assert.match(heading, /font-size:\s*28px\s*!important/);
    assert.match(heading, /line-height:\s*1\.4\s*!important/);
});
