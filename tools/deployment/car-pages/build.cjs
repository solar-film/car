'use strict';

// Offline preparation only. This script has no network, Git, or publication step.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const SOURCE_ROOT = path.resolve(__dirname, '../../..');
const CANDIDATE_ROOT = path.join(__dirname, 'candidate');
const PUBLIC_ROOT = path.join(CANDIDATE_ROOT, 'public');
const ALLOWLIST = Object.freeze(JSON.parse(fs.readFileSync(path.join(__dirname, 'allowlist.json'), 'utf8')));
const PAGES_ROOT = new URL('https://solar-film.github.io/crm-car/');
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const sameBytes = (left, right) => Buffer.compare(left, right) === 0;
const forbidden = /(?:^|\/)(?:\.env(?:\..*)?|\.lead-data|\.git|node_modules|backups?|tools|tests|tmp|recordings|privateassets)(?:\/|$)|(?:\.gs|\.cjs|\.db|\.sqlite(?:3)?|\.csv|\.tsv|\.log|\.mp4|\.zip)$|AppScript\.js$/i;

function contained(root, relative) {
    assert(!path.isAbsolute(relative) && !relative.includes('\\') && !relative.split('/').includes('..'), `Unsafe allowlist path: ${relative}`);
    const absolute = path.resolve(root, relative);
    assert(absolute.startsWith(root + path.sep), `Path escaped dedicated root: ${relative}`);
    return absolute;
}

function assertNoSymlinks(root, relative) {
    let current = root;
    for (const part of relative.split('/')) {
        current = path.join(current, part);
        if (fs.existsSync(current)) assert(!fs.lstatSync(current).isSymbolicLink(), `Symlink is not permitted: ${relative}`);
    }
}

function transform(relative, source) {
    let text = source.toString('utf8');
    const transformations = [];
    if (relative.endsWith('.html')) {
        text = text.replace(/((?:href|src)\s*=\s*["'])\/(app\.webmanifest|images\/car-crm-app(?:-192|-512)?\.png)(?=[?'"#])/g, (match, attribute, resource) => {
            transformations.push(`relative-pwa-reference:${resource}`);
            return attribute + resource;
        });
    } else if (relative === 'app.webmanifest') {
        const original = JSON.parse(text);
        const manifest = structuredClone(original);
        for (const field of ['id', 'start_url', 'scope']) {
            assert.equal(original[field], '/', `Unexpected source manifest ${field}`);
            manifest[field] = './';
            transformations.push(`manifest-${field}:./`);
        }
        for (const icon of manifest.icons) {
            assert(/^\/images\/car-crm-app-(192|512)\.png(?:\?|$)/.test(icon.src), 'Unexpected source manifest icon');
            icon.src = icon.src.slice(1);
            transformations.push(`relative-manifest-icon:${icon.src.split('?')[0]}`);
        }
        // Preserve original whitespace and all other values; only replace these literal values.
        text = text.replace(/("(?:id|start_url|scope)"\s*:\s*)"\/"/g, '$1"./"')
            .replace(/("src"\s*:\s*")\/(images\/car-crm-app-(?:192|512)\.png[^"\r\n]*)"/g, '$1$2"');
        assert.deepEqual(JSON.parse(text), manifest, 'Manifest contains an unexpected change');
    }
    return { bytes: transformations.length ? Buffer.from(text, 'utf8') : source, transformations };
}

function staticReferences(relative, bytes) {
    if (!/\.(?:html|js|css|svg|webmanifest)$/.test(relative)) return [];
    const text = bytes.toString('utf8');
    const values = [];
    if (relative === 'app.webmanifest') values.push(...JSON.parse(text).icons.map(icon => icon.src));
    for (const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) values.push(match[1]);
    for (const match of text.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/g)) values.push(match[1]);
    for (const match of text.matchAll(/["'`]([^"'`\r\n<>]*\.(?:html|js|css|svg|png|webp|webmanifest)(?:[?#][^"'`\r\n<>]*)?)["'`]/g)) values.push(match[1]);
    return [...new Set(values)].filter(value => {
        if (!value || value.startsWith('#') || /^(?:[a-z]+:|\/\/)/i.test(value)) return false;
        if (/[${}\s]/.test(value)) return false; // Computed values require runtime verification, not guesses.
        return /\.(?:html|js|css|svg|png|webp|webmanifest)(?:[?#]|$)/.test(value);
    }).map(value => ({ source: relative, value, url: new URL(value, new URL(relative, PAGES_ROOT)) }));
}

function listFiles(root, prefix = '') {
    const entries = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const relative = prefix + entry.name;
        assert(!entry.isSymbolicLink(), `Symlink is not permitted in payload: ${relative}`);
        if (entry.isDirectory()) entries.push(...listFiles(path.join(root, entry.name), relative + '/'));
        else if (entry.isFile()) entries.push(relative);
        else throw new Error(`Unsupported payload entry: ${relative}`);
    }
    return entries.sort();
}

function verifyCandidate() {
    assert.equal(ALLOWLIST.length, 63, 'Review the exact allowlist when its size changes');
    assert.equal(new Set(ALLOWLIST).size, ALLOWLIST.length, 'Duplicate allowlist entries');
    const actual = listFiles(PUBLIC_ROOT);
    assert.deepEqual(actual, [...ALLOWLIST].sort(), 'Payload contains missing or unapproved files');
    const inventory = [];
    const references = [];
    for (const relative of ALLOWLIST) {
        assert(!forbidden.test(relative), `Forbidden material in payload: ${relative}`);
        assertNoSymlinks(SOURCE_ROOT, relative);
        assertNoSymlinks(PUBLIC_ROOT, relative);
        const source = fs.readFileSync(contained(SOURCE_ROOT, relative));
        const payload = fs.readFileSync(contained(PUBLIC_ROOT, relative));
        const expected = transform(relative, source);
        assert(sameBytes(payload, expected.bytes), `Payload differs from the permitted transformation: ${relative}`);
        inventory.push({ path: relative, bytes: payload.length, sourceSha256: sha256(source), payloadSha256: sha256(payload), transformations: expected.transformations });
        references.push(...staticReferences(relative, payload));
    }
    for (const ref of references) {
        assert(ref.url.origin === PAGES_ROOT.origin && ref.url.pathname.startsWith(PAGES_ROOT.pathname), `Reference escapes /crm-car/: ${ref.source} -> ${ref.value}`);
        const target = decodeURIComponent(ref.url.pathname.slice(PAGES_ROOT.pathname.length));
        assert(ALLOWLIST.includes(target), `Unresolved local reference: ${ref.source} -> ${ref.value}`);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC_ROOT, 'app.webmanifest'), 'utf8'));
    for (const field of ['id', 'start_url', 'scope']) assert.equal(new URL(manifest[field], new URL('app.webmanifest', PAGES_ROOT)).href, PAGES_ROOT.href, `Manifest ${field} escapes /crm-car/`);
    const changed = inventory.filter(file => file.sourceSha256 !== file.payloadSha256);
    assert.equal(inventory.filter(file => file.path.endsWith('.html')).length, 20);
    assert.equal(changed.length, 20, 'Only 19 HTML files and the manifest should change');
    assert(changed.every(file => file.path.endsWith('.html') || file.path === 'app.webmanifest'));
    return { inventory, assetReferenceCount: references.length, changedFiles: changed.length, unchangedFiles: inventory.length - changed.length };
}

function build() {
    assertNoSymlinks(SOURCE_ROOT, 'tools/deployment/car-pages');
    assertNoSymlinks(CANDIDATE_ROOT, 'public');
    fs.mkdirSync(PUBLIC_ROOT, { recursive: true });
    const existing = listFiles(PUBLIC_ROOT);
    assert(existing.every(file => ALLOWLIST.includes(file)), 'Existing candidate contains unapproved files; review manually before rebuilding');
    for (const relative of ALLOWLIST) {
        assert(!forbidden.test(relative), `Forbidden allowlist entry: ${relative}`);
        assertNoSymlinks(SOURCE_ROOT, relative);
        assertNoSymlinks(PUBLIC_ROOT, relative);
        const input = fs.readFileSync(contained(SOURCE_ROOT, relative));
        const output = contained(PUBLIC_ROOT, relative);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, transform(relative, input).bytes);
    }
    const result = verifyCandidate();
    const report = {
        generatedAt: new Date().toISOString(),
        status: 'PRIVATE_OFFLINE_CANDIDATE_PUBLICATION_BLOCKED',
        intendedPagesRoot: PAGES_ROOT.href,
        fileCount: result.inventory.length,
        htmlEntryCount: 20,
        assetReferenceCount: result.assetReferenceCount,
        changedFiles: result.changedFiles,
        unchangedFiles: result.unchangedFiles,
        blockers: [
            { code: 'FULL_CANDIDATE_RUNTIME_UNVERIFIED', files: ['crm-auth.js', 'crm-login.html'], action: 'GitHub Pages auth uses the existing Apps Script endpoint. The separate auth-only release was tested against the live snapshot; this full local candidate includes unrelated revisions and still needs complete runtime verification.' },
            { code: 'CAR_BACKEND_URL_UNCONFIGURED', files: ['lead-data-app.js:56'], action: 'Provision the separate authenticated CAR HTTPS service and configure carLeadServiceUrl through the existing connection form. GitHub Pages cannot execute /api/lead-data.' },
            { code: 'OFFLINE_BUILD_ONLY', action: 'This builder does not upload, push, deploy, remove existing online files, or submit anything to Meta. Publish only the exact reviewed change set.' }
        ],
        verificationScope: 'Exact allowlist, static asset references, PWA subpath resolution, and source/payload hashes. This is not a secret-free certification or browser/API/production verification.',
        files: result.inventory
    };
    // Inventory and blockers intentionally live outside the public payload.
    fs.writeFileSync(path.join(CANDIDATE_ROOT, 'inventory.private.json'), JSON.stringify(report, null, 2) + '\n');
    return { status: report.status, fileCount: report.fileCount, htmlEntryCount: report.htmlEntryCount, changedFiles: report.changedFiles, unchangedFiles: report.unchangedFiles, assetReferenceCount: report.assetReferenceCount, payload: PUBLIC_ROOT, inventory: path.join(CANDIDATE_ROOT, 'inventory.private.json') };
}

if (require.main === module) {
    try {
        console.log(JSON.stringify(process.argv.includes('--verify') ? verifyCandidate() : build(), (key, value) => key === 'inventory' && Array.isArray(value) ? `${value.length} verified files` : value, 2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { ALLOWLIST, build, verifyCandidate, transform, staticReferences, PUBLIC_ROOT };
