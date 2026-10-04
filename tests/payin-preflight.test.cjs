const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const start = html.indexOf('        async function verifyPayInBackendVersion()');
const end = html.indexOf('        function generateSizeId()', start);
assert.ok(start >= 0 && end > start);
let health = { backendVersion: 'current', drive: { ready: true } };
let requests = 0;
const context = vm.createContext({
  PAYIN_SCRIPT_URL: 'https://example.test/exec',
  PAYIN_REQUIRED_BACKEND_VERSION: 'current',
  payInBackendVersionPromise: null,
  fetch: async url => {
    requests++;
    assert.equal(new URL(url).searchParams.get('driveCheck'), '1');
    return { text: async () => JSON.stringify(health) };
  }
});
vm.runInContext(html.slice(start, end), context);
(async () => {
  await context.verifyPayInBackendVersion();
  health = { backendVersion: 'current', drive: { ready: false } };
  await assert.rejects(context.verifyPayInBackendVersion(), /Google Drive/);
  assert.equal(requests, 2, 'a previous success must not hide changed permissions');
  health = { backendVersion: 'current' };
  await assert.rejects(context.verifyPayInBackendVersion(), /Google Drive/);
  health = { backendVersion: 'old', drive: { ready: true } };
  await assert.rejects(context.verifyPayInBackendVersion(), /New version/);
  health = { backendVersion: 'current', drive: { ready: true } };
  await context.verifyPayInBackendVersion();
  assert.equal(context.payInBackendVersionPromise, null);
  console.log('PayIn preflight tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
