const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = html.slice(html.indexOf('        let bookingLoadPromise = null;'), html.indexOf('        // คืนค่า Class สีพื้นหลัง'));
const urls = ['CSV_URL', 'DETAIL_CSV_URL', 'REASON_CSV_URL', 'CUSTOMER_CSV_URL', 'PAYIN_CSV_URL', 'DATA_CSV_URL', 'MEMO_CSV_URL', 'GLASS_SIZE_CSV_URL', 'INSTALLER_CSV_URL', 'WARRANTY_CSV_URL', 'TEAM_CSV_URL', 'FILM_SERIES_CSV_URL'];
async function run(failCore = false) {
    let release;
    const delayed = new Promise(resolve => { release = resolve; });
    const visible = {};
    let renders = 0;
    let requests = 0;
    const context = {
        console: { log() {}, error() {} }, Date, Promise,
        dom: { loadingMessage: 'loading', tableContainer: 'table', errorMessage: 'error' },
        CONTACT_CSV_URLS: [],
        fetch: async url => {
            requests++;
            if (url === 'GLASS_SIZE_CSV_URL') await delayed;
            return { ok: !(failCore && url === 'CSV_URL'), text: async () => url };
        },
        fetchFirstAvailableCsv: async () => ({ ok: true, text: async () => 'contacts' }),
        parseCsv: async text => [{ JobID: 'J1', source: text }],
        parseMemoCsv: async () => [],
        isInvalidSheetResponseText: () => false,
        buildContactRows: rows => rows, buildMemoRows: rows => rows,
        makeLookupMap: () => ({}), buildPayInDetailsMap: () => ({}),
        findKey: (keys, matcher) => keys.find(matcher),
        textValue: (value, fallback) => value || fallback,
        normalizeLookupId: value => value.toLowerCase(),
        BookingReadModel: { buildJobs: rows => rows },
        setVisible: (key, value) => { visible[key] = value; },
        setText() {}, applyFilters: () => { renders++; }
    };
    urls.forEach(url => { context[url] = url; });
    vm.createContext(context);
    vm.runInContext(source, context);
    const pending = context.fetchGoogleSheetData();
    assert.equal(context.fetchGoogleSheetData(), pending, 'refreshes share the same load');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests, 12);
    if (failCore) {
        assert.equal(renders, 0, 'failed core data must not produce a partial table');
        assert.equal(visible.error, true);
    } else {
        assert.equal(visible.table, true, 'table appears while a detail sheet is pending');
        assert.equal(renders, 1);
        assert.equal(context.cutDataMap.J1[0].source, 'DATA_CSV_URL');
    }
    release();
    await pending;
    if (!failCore) {
        assert.equal(context.glassSizeMap.J1.source, 'GLASS_SIZE_CSV_URL');
        assert.equal(renders, 2, 'final render retains the existing complete-data behavior');
    }
}
(async () => {
    await run();
    await run(true);
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
    scripts.forEach(([, code]) => new vm.Script(code));
    console.log('Booking progressive load tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
