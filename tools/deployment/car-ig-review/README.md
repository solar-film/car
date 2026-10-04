# Isolated CAR Instagram reviewer service — prepared, not deployed

This is a separate controlled reviewer environment. It is not the main CAR lead API, does not connect to Good CRM, and is not a public-ready or Meta-approved deployment. No hosting, real credential loading, webhook changes, messages or Meta submission were performed by preparing these files.

The main CAR staff frontend can remain on GitHub Pages. GitHub Pages cannot execute this Node service or receive its webhook. This reviewer requires its own HTTPS Node/container host; its UI is served from that same origin. It does not use the GitHub Pages origin as an API client and enables no cross-origin access.

## Included scope

- A dedicated reviewer key, at least 32 characters, entered into the review page. The key is held only in page memory and is distinct from the main CAR key and all Good CRM credentials.
- Authenticated status and signed-Test verification for business `@mhlcarfilm` and approved tester `@crazyoilly`. Identity is checked through the existing pure Meta profile validation routine, not inferred from a numeric personal Instagram ID.
- A receiver at `/instagram-review-webhook` that checks the raw payload HMAC, exact business account, fresh inbound `Test`, and approved sender's username. Unrelated messages are neither retained nor displayed.
- Optional single fixed reply: `ทดสอบเชื่อมต่อ CAR CRM สำหรับขอสิทธิ์ Meta`. Sending and thread takeover both default to **off**. The client cannot supply a recipient, arbitrary message, channel, cursor or App Secret.
- Each service process has a two-hour test lifetime. A reply needs a verified inbound Test less than five minutes old. A successful, rejected or uncertain send attempt locks further sends for that process. New Test events do not unlock it.
- Test thread control is separate, disabled by default, and restricted to the same signed/verified Test identity. Control release is attempted after send success/failure, expiry and graceful shutdown. Expiry/shutdown waits for an active operation before cleanup and retains identity while release is uncertain. After expiry, authenticated status and a same-origin release of that already-known thread remain available for cleanup; verification, takeover, webhook reception and sending remain closed.

There are no CRM customer records, sheet readers/writers, legacy imports, LINE/Facebook intake routes, token entry form, recorder, database or `CarLeadSheet` scripts. The main CRM's real lead-saving workflow is not simulated by this test page.

## Offline validation

From the repository root:

```powershell
node --test tools/deployment/car-ig-review/server.test.cjs
node --check tools/deployment/car-ig-review/server.cjs
node --check tools/deployment/car-ig-review/review.js
```

The tests use loopback ephemeral HTTP transport, fixture credentials and mock Graph responses only. They check auth/host/origin failures, no status-secret leakage, forbidden routes and custom recipients, raw HMAC validation, outsider rejection, disabled writes by default, expiry, single-use sends, uncertain-send locking, concurrent operations, and control release including expiry races. Passing them does not prove live hosting, browser appearance, Meta permissions or delivery.

## Prepared container

Build from the repository root with this exact Dockerfile:

```powershell
docker build -f tools/deployment/car-ig-review/Dockerfile -t car-ig-review:prepared .
```

`Dockerfile.dockerignore` is a **positive context allowlist** for this specific Dockerfile, and the Dockerfile also uses exact `COPY` entries. Only the review server/UI and the pure `tools/instagram-review/webhook.cjs` and `thread.cjs` modules enter the image. Do not replace it with a broad `COPY . .` or broad context exceptions: the repository contains private environment files, SQLite data and recordings.

No container image build is claimed until a Docker daemon is available and the command actually succeeds. No new package installation is required; the image uses Node 24 built-in modules.

## Deployment preparation and approval boundary

Before deploying, choose a **separate CAR review host**, inspect its exposure/costs and obtain approval for that concrete host and data flow. Supply values through that host's secret settings using `review.env.example` as field names only. Do not copy a local `lead-data.env`, commit real secrets, upload them with GitHub Pages, or reuse a Good CRM key.

- `CAR_IG_REVIEW_ORIGIN`: exact reviewer HTTPS origin, with no path or trailing slash. The reverse proxy must preserve that hostname in `Host`. Only the HTTPS edge should be public; the HTTP Node port must stay behind that edge.
- `CAR_IG_REVIEW_KEY`: a new random reviewer-only credential, supplied to the intended reviewer through the review instructions rather than exposed in the website or status API.
- `CAR_IG_REVIEW_PAGE_TOKEN`, `CAR_IG_REVIEW_APP_SECRET`, `CAR_IG_REVIEW_VERIFY_TOKEN`: server secrets for the agreed CAR review test. Blank values keep the receiver unconfigured. The verification token is distinct from the access key.
- `CAR_IG_REVIEW_ALLOW_REPLY=0` and `CAR_IG_REVIEW_ALLOW_THREAD_CONTROL=0`: retain these defaults until the owner gives fresh approval for the deployed test and the exact account/recipient/purpose. Thread-control permission in Meta must also be expressly approved before enabling takeover.
- The image listens internally on port `3096`. A host-level HTTP health probe must include the configured public `Host` header; ordinary loopback requests with a different Host are intentionally rejected.

The old temporary testing approvals ended with cleanup. Do not recreate a tunnel, change an app/Page webhook, enable conversation control, send real messages or submit App Review based on preparation alone. An app-level Instagram webhook change can affect linked accounts even though this receiver discards unrelated payloads. Preserve existing Messenger/Page fields, Apps Script callbacks and all Good CRM/LINE flows; review the actual existing configuration before any approved change.

If thread takeover is eventually approved, allow **at least 100 seconds of graceful stop time** at the hosting layer (`docker stop --time 100` when Docker is used). Cleanup is best effort: a failed Meta API call, network outage or forced host kill can leave ownership uncertain. The service emits a safe warning when release cannot be confirmed; the owner must verify Meta conversation control before another round. Automatic restarts reset the two-hour process lifetime, so do not use unattended restart policies for an approved temporary session. Remove the reviewer endpoint, credentials and approved temporary Meta settings at the agreed end.

## Reviewer access still needs a real strategy

The dedicated key can open this page; it is not an Instagram login. The current allowlist is the already-authorized tester `@crazyoilly`, and this page cannot make an unrelated Meta reviewer account act as that tester. Do not provide personal Instagram credentials to Meta. Arrange an approved accessible test-account strategy and precise reviewer steps before submission; changing the tester allowlist needs a separate scoped implementation/approval.

The two-hour lifetime starts when the process starts. This is an owner/tester-coordinated temporary run, not an unattended reviewer service that can wait through a day/week-long Meta review queue. Preparing this package does not provide Meta with a live testable URL.

The existing final 2:31 video demonstrates the isolated real fixed-reply test. A deployed reviewer URL and live evidence must be verified separately. Do not claim this isolated page implements the main CRM's general reply composition or demonstrates unrelated Messenger permissions.
