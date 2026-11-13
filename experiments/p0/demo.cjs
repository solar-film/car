'use strict';
const {sample}=require('./synthetic-fixture.cjs');
const {auditSnapshot}=require('./staging-audit.cjs');
const {snapshot,expected}=sample();
console.log(JSON.stringify({mode:'OFFLINE_SYNTHETIC_ONLY',...auditSnapshot(snapshot,expected,'2026-10-27')},null,2));
