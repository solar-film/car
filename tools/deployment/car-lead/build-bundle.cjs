'use strict';
// Offline packaging only: explicit source files, no environment or database reads.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const OUTPUT = path.join(__dirname, 'bundle');
const RUNTIME_FILES = Object.freeze([
    'lead-data-server.cjs',
    'crm-session.cjs',
    'lead-data-core.js',
    'lead-data-facebook.cjs',
    'lead-data-instagram.cjs',
    'lead-data-line-sheet.cjs',
    'lead-data-sheet-reader.cjs',
    'lead-data-options.cjs'
]);
const DEPLOYMENT_FILES = Object.freeze(['Dockerfile', '.dockerignore', 'README.md']);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function sourceFile(name) {
    const source = path.join(PROJECT_ROOT, name);
    if (!RUNTIME_FILES.includes(name) || !fs.lstatSync(source).isFile() || fs.lstatSync(source).isSymbolicLink()) {
        throw new Error('Only the explicit regular runtime files may be packaged');
    }
    if (path.dirname(fs.realpathSync(source)) !== fs.realpathSync(PROJECT_ROOT)) {
        throw new Error('Runtime source resolves outside the project root');
    }
    return source;
}

function verifyDependencies(directory, files = RUNTIME_FILES) {
    const allowed = new Set(files);
    for (const name of files) {
        const text = fs.readFileSync(path.join(directory, name), 'utf8');
        for (const match of text.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
            const dependency = match[1];
            if (dependency.startsWith('node:')) continue;
            if (!dependency.startsWith('./') || !allowed.has(dependency.slice(2))) {
                throw new Error(`Unapproved runtime dependency in ${name}`);
            }
            if (!fs.statSync(path.join(directory, dependency)).isFile()) {
                throw new Error(`Missing runtime dependency in ${name}`);
            }
        }
    }
}

function plannedFiles() {
    verifyDependencies(PROJECT_ROOT);
    return [
        ...RUNTIME_FILES.map(name => ({source: sourceFile(name), name: `runtime/${name}`})),
        ...DEPLOYMENT_FILES.map(name => ({source: path.join(__dirname, name), name}))
    ];
}

function verifyBundle(directory = OUTPUT) {
    const inventory = JSON.parse(fs.readFileSync(path.join(directory, 'inventory.json'), 'utf8'));
    const plan = plannedFiles();
    const expected = plan.map(item => item.name).sort();
    if (JSON.stringify(inventory.files.map(item => item.path).sort()) !== JSON.stringify(expected)) {
        throw new Error('Bundle inventory is not the exact allowlist');
    }
    const actual = fs.readdirSync(directory).sort();
    if (JSON.stringify(actual) !== JSON.stringify(['.dockerignore', 'Dockerfile', 'README.md', 'inventory.json', 'runtime'].sort())) {
        throw new Error('Unexpected file in the bundle');
    }
    if (JSON.stringify(fs.readdirSync(path.join(directory, 'runtime')).sort()) !== JSON.stringify([...RUNTIME_FILES].sort())) {
        throw new Error('Unexpected runtime file in the bundle');
    }
    for (const item of plan) {
        const file = path.join(directory, item.name);
        if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error('Bundle must contain regular files only');
        const bytes = fs.readFileSync(file);
        const record = inventory.files.find(record => record.path === item.name);
        if (record.bytes !== bytes.length || record.sha256 !== sha256(bytes) || record.sha256 !== sha256(fs.readFileSync(item.source))) {
            throw new Error(`Bundle integrity or source freshness failed: ${item.name}`);
        }
    }
    verifyDependencies(path.join(directory, 'runtime'));
    return inventory;
}

function buildBundle() {
    const plan = plannedFiles();
    if (fs.existsSync(OUTPUT)) {
        verifyBundle();
        return {directory: OUTPUT, reused: true, files: plan.length};
    }
    fs.mkdirSync(path.join(OUTPUT, 'runtime'), {recursive: true});
    const files = [];
    for (const item of plan) {
        const bytes = fs.readFileSync(item.source);
        fs.writeFileSync(path.join(OUTPUT, item.name), bytes, {flag: 'wx'});
        files.push({path: item.name, bytes: bytes.length, sha256: sha256(bytes)});
    }
    const inventory = {schema: 1, nodeRuntime: '24', entrypoint: 'runtime/lead-data-server.cjs',
        excludes: ['environment files', 'credentials', 'databases', 'browser HTML', 'review recordings', 'GOOD CRM'],
        files};
    fs.writeFileSync(path.join(OUTPUT, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n', {flag: 'wx'});
    verifyBundle();
    return {directory: OUTPUT, reused: false, files: plan.length};
}

if (require.main === module) {
    if (process.argv.length > 3 || !['', '--check'].includes(process.argv[2] || '')) throw new Error('Use no arguments or --check');
    const result = process.argv[2] === '--check' ? {directory: OUTPUT, verified: true, files: verifyBundle().files.length} : buildBundle();
    console.log(JSON.stringify(result));
}
module.exports = {PROJECT_ROOT, OUTPUT, RUNTIME_FILES, buildBundle, verifyBundle, verifyDependencies};
