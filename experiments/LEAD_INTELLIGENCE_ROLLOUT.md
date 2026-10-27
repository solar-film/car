# CAR CRM — Lead Quality & Attribution staging (not deployed)
## P0 continuation · 2026-10-27
Read the [P0 audit and test results](p0/P0_REVIEW_20261027.md) and [staging/backup/rollback plan](p0/STAGING_PLAN.md) before using the proposals below. `node experiments/p0/run-checks.cjs` now runs offline legacy regression and staging guards. The repository's backend sources differ from the local workspace and do not constitute a complete live Apps Script bundle. Reproduction tests confirm open defects, including per-JobID double counting in this experimental module; passing CI is not permission to integrate, merge or deploy.

This change deliberately adds **standalone files only**; none are referenced by the live HTML or Apps Script. No database/schema/data/advertising edits happen in this PR.

## Audit of existing source (2026-10-27)
- `LeadSheet.gs` already allocates a stable `Lead ID` and records the `lead` sheet; `lead-sheet.js` already saves source of awareness (`รู้จักเราจาก`), follow-up state, film choice and budget.
- `CarBookingStatusSync.gs` matches a Lead to Customer using phone/channel identity and selects the latest Booking for that customer. It skips unmatched and ambiguous identities. This is not a durable per-booking foreign-key link for repeat bookings.
- `contact-report-summary.js` aggregates contact events by day/channel, not unique paid-attributed people.
- No campaign/click tracking has been established end-to-end in the reviewed lead-write path.

## Proposed phased deployment (NOT executed)
1. **Data audit / backup**: verify which Apps Script deployment and Sheet are live; snapshot sheet schema and data, check duplicate Lead IDs and conflicting booking matches; obtain test environment. Resolve observed intermittent Sheet read errors separately before migration.
2. **Lost-lead fields**: add optional `salesOutcome`, `lostReason`, `nextFollowUpDate`, `quotedPrice`, `budgetMatched`, `installWithin7Days`. Do NOT overwrite `สถานะการติดตาม` or notes. Add columns only after schema approval, with backwards-compatible reader/writer, then test both old/new forms. Reason required only when selecting lost.
3. **Identity mapping**: introduce an explicit Lead ID ↔ CustID ↔ JobID relation in an additive mapping table. Never auto-assign ambiguous legacy bookings. Provide a manual review queue and reconciliation counts.
4. **Attribution**: retain first-touch awareness separately from contact channel and paid campaign. Record UTM values and supported Google click IDs from web landing intake; for Messenger/LINE obtain referrer via a supported integration or verified staff-provided source, otherwise mark unknown (never assume paid).
5. **Revenue**: classify as completed only with verified JobID and installation date; use revenue excluding VAT from the validated booking/sales record. Never include future scheduled appointments as completed revenue.
6. **Privacy & controls**: do not put customer PII, raw access tokens, or conversion secrets in this public repository. Use scoped credentials server-side, consent checks, retention, and transaction/idempotency logs.
7. **Verification**: run unit tests below, contract tests against staging Apps Script, compare 90-day aggregates against the existing dashboard and check non-regression for create/update Lead, booking sync, cancellation, repeated customers, claim jobs and mismatched/duplicate records. Pilot a small cohort, add rollback plan, obtain approval before merging or deploying.

## Pure analytical module
`lead-intelligence.js` provides a sample lead-quality score, validated lost-reason vocabulary, attribution normalization that preserves unknown, journey validation, and campaign aggregate reporting. These are **proposed rules, not adopted policies**, and are not connected to production. Scores must be calibrated against genuine completed-install conversions before operational use.

Run `node experiments/lead-intelligence.test.js`. For any production integration, add stronger date validation, enforce one Lead ID per distinct person interaction and one booking per JobID, link events by stable foreign keys, and ensure reports distinguish new contacts, repeat contacts, booking cohorts, completion date and refund/cancellation adjustments.

## Safe change policy
- Draft PR only; do not merge, publish GitHub Pages, deploy Apps Script, modify Sheets or Ads.
- No effect on live UI until a separate reviewed integration PR is merged and deployed.
- Reviewer checklist: schema migration/backfill, actual production credentials location (not value), recovery backup, privacy review, sample reconciliation, error monitoring, rollback.
