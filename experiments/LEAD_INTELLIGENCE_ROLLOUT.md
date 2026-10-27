# CAR CRM — Lead Quality & Attribution staging (not deployed)
## P0 continuation · 2026-10-27
Read the [P0 audit and test results](p0/P0_REVIEW_20261027.md) and [staging/backup/rollback plan](p0/STAGING_PLAN.md) before using the proposals below. `node experiments/p0/run-checks.cjs` runs 109 synthetic regression/audit/HTTP tests. Authorized read-only inspection verified the live source editor against private release97 and the active deployment metadata. The repository remains an incomplete backend bundle; a complete candidate is kept private. JobID conflicts now block this experimental report. Passing CI is not permission to merge or deploy.

P0 now proposes bounded frontend and status-planner fixes and a local memory-only staging server. No database/schema/customer-data/advertising edits or deployment happen in this PR. This experimental attribution module remains disconnected from runtime UI.

## Audit of existing source (2026-10-27)
- `LeadSheet.gs` already allocates a stable `Lead ID` and records the `lead` sheet; `lead-sheet.js` already saves source of awareness (`รู้จักเราจาก`), follow-up state, film choice and budget.
- Verified source97 already uses Bookings Lead ID for explicit links and phone-based customer matching. The P0 planner candidate rejects duplicate/orphan links and leaves ambiguous legacy queues for review; it does not introduce a new mapping table or backfill records.
- `contact-report-summary.js` aggregates contact events by day/channel, not unique paid-attributed people.
- No campaign/click tracking has been established end-to-end in the reviewed lead-write path.

## Proposed phased deployment (NOT executed)
1. **Data audit / backup**: verify which Apps Script deployment and Sheet are live; snapshot sheet schema and data, check duplicate Lead IDs and conflicting booking matches; obtain test environment. Resolve observed intermittent Sheet read errors separately before migration.
2. **Lost-lead fields**: add optional `salesOutcome`, `lostReason`, `nextFollowUpDate`, `quotedPrice`, `budgetMatched`, `installWithin7Days`. Do NOT overwrite `สถานะการติดตาม` or notes. Add columns only after schema approval, with backwards-compatible reader/writer, then test both old/new forms. Reason required only when selecting lost.
3. **Identity mapping**: validate the existing Lead ID ↔ CustID ↔ JobID links and reuse the existing Bookings Lead ID column. Never auto-assign ambiguous legacy bookings. Review exceptions and reconcile before considering any additional storage.
4. **Attribution**: retain first-touch awareness separately from contact channel and paid campaign. Record UTM values and supported Google click IDs from web landing intake; for Messenger/LINE obtain referrer via a supported integration or verified staff-provided source, otherwise mark unknown (never assume paid).
5. **Revenue**: classify as completed only with verified JobID and installation date; use revenue excluding VAT from the validated booking/sales record. Never include future scheduled appointments as completed revenue.
6. **Privacy & controls**: do not put customer PII, raw access tokens, or conversion secrets in this public repository. Use scoped credentials server-side, consent checks, retention, and transaction/idempotency logs.
7. **Verification**: run unit tests below, contract tests against staging Apps Script, compare 90-day aggregates against the existing dashboard and check non-regression for create/update Lead, booking sync, cancellation, repeated customers, claim jobs and mismatched/duplicate records. Pilot a small cohort, add rollback plan, obtain approval before merging or deploying.

## Pure analytical module
`lead-intelligence.js` provides a sample lead-quality score, validated lost-reason vocabulary, attribution normalization that preserves unknown, journey validation, and campaign aggregate reporting. These are **proposed rules, not adopted policies**, and are not connected to production. Scores must be calibrated against genuine completed-install conversions before operational use.

Run `node experiments/lead-intelligence.test.js`. For any production integration, add stronger date validation, enforce one Lead ID per distinct person interaction and one booking per JobID, link events by stable foreign keys, and ensure reports distinguish new contacts, repeat contacts, booking cohorts, completion date and refund/cancellation adjustments.

## Safe change policy
- Draft PR only; do not merge, publish GitHub Pages, deploy Apps Script, modify Sheets or Ads.
- No effect on live UI until the proposed fixes pass Google Staging/UAT and receive explicit merge/deploy approval.
- Reviewer checklist: schema migration/backfill, actual production credentials location (not value), recovery backup, privacy review, sample reconciliation, error monitoring, rollback.
