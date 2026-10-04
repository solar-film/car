'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {validateCaptureSource} = require('../tools/instagram-review/review.js');
const expected = 'current-document-id';
const origin = 'http://127.0.0.1:3094';
test('accept only the exact current review document as initial video source', () => {
    assert.equal(validateCaptureSource({displaySurface:'browser'},{handle:expected,origin},expected,origin),true);
});
test('reject window and screen before recording', () => {
    for (const displaySurface of ['window','monitor',undefined]) {
        assert.throws(() => validateCaptureSource({displaySurface},{handle:expected,origin},expected,origin),/แท็บ Chrome/);
    }
});
test('reject missing handle, other tabs, and another origin', () => {
    for (const handle of [null,{}, {handle:'old-document-id',origin}, {handle:expected,origin:'http://127.0.0.1:3092'}]) {
        assert.throws(() => validateCaptureSource({displaySurface:'browser'},handle,expected,origin),/ไม่ใช่หน้าสาธิต/);
    }
});
