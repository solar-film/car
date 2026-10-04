'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const PAYIN_HEADERS = [
  'Pay_ID', 'JobID', 'สถานะ', 'ใบเสนอราคา', 'เลขที่บิล/ใบเสร็จ', 'ประเภทการชำระ',
  'ยอดเงิน(บาท)', 'หมายเหตุ', 'หลักฐาน_1', 'หลักฐาน_2', 'หลักฐาน_3', 'หลักฐาน_4', 'วันที่บันทึกรายการ'
];

class RangeMock {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }
  getValues() {
    return Array.from({ length: this.rowCount }, (_, rowOffset) =>
      Array.from({ length: this.columnCount }, (_, columnOffset) =>
        this.sheet.rows[this.row - 1 + rowOffset]?.[this.column - 1 + columnOffset] ?? ''
      )
    );
  }
  getValue() { return this.getValues()[0]?.[0] ?? ''; }
  setValues(values) {
    values.forEach((rowValues, rowOffset) => rowValues.forEach((value, columnOffset) => {
      const rowIndex = this.row - 1 + rowOffset;
      const columnIndex = this.column - 1 + columnOffset;
      if (this.sheet.ignoreProofWrites && columnIndex >= 8 && columnIndex <= 11) return;
      while (!this.sheet.rows[rowIndex]) this.sheet.rows[rowIndex] = [];
      this.sheet.rows[rowIndex][columnIndex] = value;
    }));
    return this;
  }
  setValue(value) { return this.setValues([[value]]); }
  setNumberFormat() { return this; }
  clearContent() {
    for (let rowOffset = 0; rowOffset < this.rowCount; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < this.columnCount; columnOffset += 1) {
        const row = this.sheet.rows[this.row - 1 + rowOffset];
        if (row) row[this.column - 1 + columnOffset] = '';
      }
    }
    return this;
  }
}

class SheetMock {
  constructor(rows) {
    this.rows = rows.map(row => row.slice());
    this.ignoreProofWrites = false;
  }
  getDataRange() { return new RangeMock(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  getRange(row, column, rowCount = 1, columnCount = 1) { return new RangeMock(this, row, column, rowCount, columnCount); }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(0, ...this.rows.map(row => row.length)); }
  getMaxRows() { return Math.max(100, this.rows.length); }
  appendRow(row) { this.rows.push(row.slice()); }
  deleteRow(row) { this.rows.splice(row - 1, 1); }
}

class FileMock {
  constructor(blob) { this.blob = blob; this.name = blob.name; this.trashed = false; this.description = ''; }
  setDescription(value) { this.description = value; return this; }
  setTrashed(value) { this.trashed = value; return this; }
  isTrashed() { return this.trashed; }
}

function iterator(items) {
  let index = 0;
  return { hasNext: () => index < items.length, next: () => items[index++] };
}

class FolderMock {
  constructor(trace) { this.files = []; this.trace = trace; }
  getFilesByName(name) {
    const matches = this.files.filter(file => file.name === name && !file.trashed);
    let index = 0;
    return { hasNext: () => index < matches.length, next: () => matches[index++] };
  }
  createFile(blob) {
    this.trace.push('drive:create');
    const file = new FileMock(blob);
    this.files.push(file);
    return file;
  }
  getName() { return 'Pay_In'; }
  getId() { return 'folder-123'; }
  getParents() {
    return iterator([{
      getName: () => 'Images',
      getParents: () => iterator([{ getName: () => 'CAR_CRM-691939189' }])
    }]);
  }
}

function createRuntime() {
  const trace = [];
  const sheet = new SheetMock([PAYIN_HEADERS]);
  const folder = new FolderMock(trace);
  const lock = {
    tryLock() { trace.push('lock:try'); return true; },
    releaseLock() { trace.push('lock:release'); },
    hasLock() { return true; }
  };
  const context = {
    console,
    Date,
    Math,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    parseInt,
    parseFloat,
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput(text) {
        return { text, setMimeType() { return this; } };
      }
    },
    PropertiesService: {
      getScriptProperties() {
        return { getProperty(key) { return key === 'CAR_CRM_WRITE_TOKEN' ? 'secret' : 'folder-123'; } };
      }
    },
    SpreadsheetApp: {
      flush() {},
      openById() {
        return {
          getSheetByName(name) { return name === 'PayIn' ? sheet : null; },
          getSheets() { return [{ getName: () => 'PayIn' }]; },
          insertSheet() { throw new Error('unexpected insert'); }
        };
      }
    },
    DriveApp: { getFolderById(id) { assert.equal(id, 'folder-123'); return folder; } },
    LockService: { getScriptLock() { return lock; } },
    Utilities: {
      base64Decode(value) { trace.push('base64:decode'); return Array.from(Buffer.from(value, 'base64')); },
      newBlob(bytes, mimeType, name) { return { bytes, mimeType, name }; },
      formatDate() { return '2026,8,29'; },
      getUuid() { return '00000000-0000-4000-8000-000000000000'; }
    },
    Session: { getScriptTimeZone() { return 'Asia/Bangkok'; } },
    Logger: { log() {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  const source = fs.readFileSync(require.resolve('../Code.gs'), 'utf8') + '\n;globalThis.__api = { doGet, doPost, upsertPayIn_, attachPayInProof_, decodePayInProof_ };';
  vm.runInContext(source, context, { filename: 'Code.gs' });
  return { ...context.__api, sheet, folder, trace };
}

function call(runtime, payload, contentLength) {
  const contents = JSON.stringify(payload);
  const output = runtime.doPost({ postData: { contents }, contentLength: contentLength ?? contents.length });
  return JSON.parse(output.text);
}

const runtime = createRuntime();
const health = JSON.parse(runtime.doGet().text);
assert.equal(health.status, 'API ready');
assert.match(health.backendVersion, /^2026-09-23-payin-four-proofs$/);
const driveHealth = JSON.parse(runtime.doGet({ parameter: { driveCheck: '1' } }).text);
assert.deepEqual(driveHealth.drive, { ready: true });

const insert = call(runtime, {
  action: 'upsertPayIn', sheetName: 'PayIn', JobID: 'JOB-1', token: 'secret',
  'สถานะ': 'มัดจำ', 'ยอดเงิน(บาท)': '1000', 'หลักฐาน_1': 'client/evil.jpg'
});
assert.equal(insert.success, true);
assert.equal(insert.action, 'insert');
assert.match(insert.id, /^PAY-/);
assert.equal(runtime.sheet.rows.length, 2);
assert.equal(runtime.sheet.rows[1][8], '', 'client cannot write a proof path directly');

const replay = call(runtime, {
  action: 'upsertPayIn', sheetName: 'PayIn', JobID: 'JOB-1', token: 'secret',
  'สถานะ': 'ชำระครบ', 'ยอดเงิน(บาท)': '5500'
});
assert.equal(replay.success, true);
assert.equal(replay.action, 'update');
assert.equal(replay.id, insert.id);
assert.equal(runtime.sheet.rows.length, 2, 'metadata replay is idempotent by JobID');
assert.equal(runtime.sheet.rows[1][2], 'ชำระครบ');

const staleRecordId = call(runtime, {
  action: 'upsertPayIn', sheetName: 'PayIn', recordId: 'PAY-STALE', JobID: 'JOB-1', token: 'secret',
  'สถานะ': 'มัดจำ', 'ยอดเงิน(บาท)': '1'
});
assert.equal(staleRecordId.success, false);
assert.match(staleRecordId.error, /ไม่พบ Pay_ID/);
assert.equal(runtime.sheet.rows[1][2], 'ชำระครบ', 'stale record id cannot update the row found only by JobID');

const duplicateRuntime = createRuntime();
duplicateRuntime.sheet.rows.push(
  ['PAY-A', 'JOB-DUP', 'มัดจำ', '', '', '', 100, '', '', '', '', '', ''],
  ['PAY-B', 'JOB-DUP', 'ชำระครบ', '', '', '', 200, '', '', '', '', '', '']
);
const duplicateJob = call(duplicateRuntime, {
  action: 'upsertPayIn', sheetName: 'PayIn', JobID: 'JOB-DUP', token: 'secret', 'ยอดเงิน(บาท)': '999'
});
assert.equal(duplicateJob.success, false);
assert.match(duplicateJob.error, /PayIn ซ้ำ/);
assert.equal(duplicateRuntime.sheet.rows[1][6], 100);
assert.equal(duplicateRuntime.sheet.rows[2][6], 200);

const mismatchedHeaderRuntime = createRuntime();
[mismatchedHeaderRuntime.sheet.rows[0][3], mismatchedHeaderRuntime.sheet.rows[0][4]] =
  [mismatchedHeaderRuntime.sheet.rows[0][4], mismatchedHeaderRuntime.sheet.rows[0][3]];
const mismatchedHeader = call(mismatchedHeaderRuntime, {
  action: 'upsertPayIn', sheetName: 'PayIn', JobID: 'JOB-SCHEMA', token: 'secret'
});
assert.equal(mismatchedHeader.success, false);
assert.match(mismatchedHeader.error, /หัวตาราง PayIn ไม่ตรง/);
assert.equal(mismatchedHeaderRuntime.sheet.rows.length, 1);

const requestId = '12345678-1234-4123-8123-1234567890ab';
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01]).toString('base64');
runtime.trace.length = 0;
const attached = call(runtime, {
  action: 'attachPayInProof', sheetName: 'PayIn', recordId: insert.id, JobID: 'JOB-1',
  slot: 1, mimeType: 'image/jpeg', base64: jpeg, clientRequestId: requestId, token: 'secret'
});
assert.equal(attached.success, true);
assert.match(attached.relativePath, /^CAR_CRM-691939189\/Images\/Pay_In\//);
assert.equal(runtime.sheet.rows[1][8], attached.relativePath);
assert.equal(runtime.folder.files.filter(file => !file.trashed).length, 1);
assert.ok(runtime.trace.indexOf('drive:create') < runtime.trace.lastIndexOf('lock:try'), 'Drive creation happens before the short bind lock');

const duplicate = call(runtime, {
  action: 'attachPayInProof', sheetName: 'PayIn', recordId: insert.id, JobID: 'JOB-1',
  slot: 1, mimeType: 'image/jpeg', base64: jpeg, clientRequestId: requestId, token: 'secret'
});
assert.equal(duplicate.success, true);
assert.equal(duplicate.reused, true);
assert.equal(duplicate.verified, true);
assert.equal(runtime.folder.files.filter(file => !file.trashed).length, 1, 'same request id never creates another file');

const fourthRequestId = 'abcdef12-1234-4123-8123-1234567890ab';
const fourthProof = call(runtime, {
  action: 'attachPayInProof', sheetName: 'PayIn', recordId: insert.id, JobID: 'JOB-1',
  slot: 4, mimeType: 'image/jpeg', base64: jpeg, clientRequestId: fourthRequestId, token: 'secret'
});
assert.equal(fourthProof.success, true);
assert.equal(runtime.sheet.rows[1][11], fourthProof.relativePath, 'fourth proof is stored in หลักฐาน_4');

const fifthProof = call(runtime, {
  action: 'attachPayInProof', sheetName: 'PayIn', recordId: insert.id, JobID: 'JOB-1',
  slot: 5, mimeType: 'image/jpeg', base64: jpeg, clientRequestId: requestId, token: 'secret'
});
assert.equal(fifthProof.success, false);
assert.match(fifthProof.error, /ตำแหน่งรูปหลักฐานไม่ถูกต้อง/);

const proofWriteFailureRuntime = createRuntime();
const proofWriteFailureInsert = call(proofWriteFailureRuntime, {
  action: 'upsertPayIn', sheetName: 'PayIn', JobID: 'JOB-PROOF-FAIL', token: 'secret',
  'สถานะ': 'ชำระครบ', 'ยอดเงิน(บาท)': '1200'
});
proofWriteFailureRuntime.sheet.ignoreProofWrites = true;
const proofWriteFailure = call(proofWriteFailureRuntime, {
  action: 'attachPayInProof', sheetName: 'PayIn', recordId: proofWriteFailureInsert.id, JobID: 'JOB-PROOF-FAIL',
  slot: 1, mimeType: 'image/jpeg', base64: jpeg, clientRequestId: requestId, token: 'secret'
});
assert.equal(proofWriteFailure.success, false);
assert.match(proofWriteFailure.error, /ตรวจสอบช่อง หลักฐาน_1 แล้วไม่พบ path รูป/);
assert.equal(proofWriteFailureRuntime.folder.files.filter(file => !file.trashed).length, 0, 'unverified proof upload is rolled back');

const mismatch = call(runtime, {
  action: 'attachPayInProof', sheetName: 'PayIn', recordId: 'PAY-WRONG', JobID: 'JOB-1',
  slot: 2, mimeType: 'image/jpeg', base64: jpeg, clientRequestId: requestId, token: 'secret'
});
assert.equal(mismatch.success, false);
assert.match(mismatch.error, /ไม่พบ PayIn/);

const badSignature = call(runtime, {
  action: 'attachPayInProof', sheetName: 'PayIn', recordId: insert.id, JobID: 'JOB-1',
  slot: 2, mimeType: 'image/jpeg', base64: Buffer.from('not-jpeg').toString('base64'), clientRequestId: requestId, token: 'secret'
});
assert.equal(badSignature.success, false);
assert.match(badSignature.error, /ไม่ใช่ไฟล์รูป JPG/);

const unknown = call(runtime, { action: 'mystery', sheetName: 'PayIn', token: 'secret' });
assert.equal(unknown.success, false);
assert.match(unknown.error, /ไม่รู้จัก action/);

const tooLarge = call(runtime, { action: 'upsertPayIn', sheetName: 'PayIn', JobID: 'JOB-2', token: 'secret' }, 11 * 1024 * 1024);
assert.equal(tooLarge.success, false);
assert.match(tooLarge.error, /ใหญ่เกิน 10 MB/);
assert.equal(runtime.sheet.rows.length, 2, 'oversized request changes nothing');

console.log('apps-script PayIn tests passed');


for (const action of ['update','delete']) {
 const invalid=createRuntime(); const before=JSON.stringify(invalid.sheet.rows);
 const result=call(invalid,{action,sheetName:'PayIn',token:'secret','ยอดเงิน(บาท)':'1000'});
 assert.equal(result.success,false);
 assert.match(result.error,/ต้องระบุ/);
 assert.equal(JSON.stringify(invalid.sheet.rows),before);
 assert.equal(invalid.folder.files.length,0);
 assert.equal(invalid.trace.includes('lock:try'),false);
}
