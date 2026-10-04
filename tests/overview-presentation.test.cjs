'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSalesSeries } = require('../overview-presentation.js');
const row = (date, price) => ({ date: new Date(date + 'T12:00:00'), price });

test('monthly series is chronological, uses the selected year and removes VAT after aggregation', () => {
    const rows = [row('2026-10-02', 1070), row('2025-10-02', 9999), row('2026-01-01', 535), row('2026-10-01', 2140), row('2026-11-01', 8888)];
    const before = JSON.stringify(rows);
    const result = buildSalesSeries(rows, 'monthly', '2026-10');
    assert.equal(result.keys.length, 10);
    assert.equal(result.keys[0], '2026-01');
    assert.equal(result.keys.at(-1), '2026-10');
    assert.ok(Math.abs(result.values[0] - 500) < 1e-8);
    assert.equal(result.values[1], 0);
    assert.equal(result.values.at(-1), 3000);
    assert.equal(result.total, 3500);
    assert.equal(JSON.stringify(rows), before);
});

test('daily series preserves every day and handles leap-year February', () => {
    const result = buildSalesSeries([row('2024-02-29', 107), row('2024-03-01', 214)], 'daily', '2024-02');
    assert.equal(result.keys.length, 29);
    assert.equal(result.values[28], 100);
    assert.equal(result.total, 100);
    assert.match(result.fullLabels.at(-1), /2567/);
    assert.equal(buildSalesSeries([], 'daily', '2026-02').keys.length, 28);
});

test('yearly series includes historical years and stops at the selected month', () => {
    const result = buildSalesSeries([row('2026-11-01', 10700), row('2024-01-01', 107), row('2026-10-01', 214)], 'yearly', '2026-10');
    assert.deepEqual(result.labels, ['2567', '2568', '2569']);
    assert.deepEqual(result.values, [100, 0, 200]);
    assert.equal(result.total, 300);
});

test('all-months mode spans year boundaries and uses the latest month for daily mode', () => {
    const rows = [row('2026-02-01', 107), row('2025-12-31', 214)];
    const result = buildSalesSeries(rows, 'monthly', '');
    assert.deepEqual(result.keys, ['2025-12', '2026-01', '2026-02']);
    assert.deepEqual(result.values, [200, 0, 100]);
    assert.equal(buildSalesSeries(rows, 'daily', '').keys[0], '2026-02-01');
});

test('empty or invalid data has an explicit no-data result and zero-valued records remain data', () => {
    const result = buildSalesSeries([{ date: null, price: 107 }, { date: new Date('invalid'), price: 107 }, row('2026-10-01', NaN)], 'monthly', '2026-10');
    assert.equal(result.hasData, false);
    assert.equal(result.total, 0);
    assert.equal(buildSalesSeries([row('2026-10-01', 0)], 'monthly', '2026-10').hasData, true);
});

test('reference layout preserves unique data targets, scopes assets and includes functional controls', () => {
    const html = fs.readFileSync(path.join(__dirname, '../overview.html'), 'utf8');
    const markup = html.slice(0, html.lastIndexOf('    <script>'));
    const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(ids.length, new Set(ids).size);
    for (const id of ['salesTrendChart', 'overviewMemoBell', 'dailySalesTableBody', 'salesSummaryGross', 'salesSummaryNet', 'targetProgressBar']) assert.ok(ids.includes(id), id);
    assert.equal((html.match(/data-trend-mode=/g) || []).length, 3);
    assert.equal((html.match(/data-rank-source=/g) || []).length, 3);
    for (const asset of ['images/overview-city-sedan.webp', 'images/overview-premium-suv.webp']) assert.ok(fs.statSync(path.join(__dirname, '..', asset)).size > 1000);
});
