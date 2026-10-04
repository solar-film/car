# Instagram App Review test tool

This isolated tool records a real API reply from @mhlcarfilm to the user-controlled @crazyoilly account. It does not modify the CRM database, existing LINE/Facebook intake, or existing private configuration.

Run `node tools/instagram-review/server.cjs` from the CAR_CRM folder, then open http://127.0.0.1:3094/.

The optional receiver on 127.0.0.1:3095 exposes only `/instagram-review-webhook`. It requires an in-memory CRM_LEAD App Secret, a random verification token, valid Meta HMAC signatures, the expected Instagram business account, a fresh inbound Test, and a profile API check matching exactly crazyoilly. Other messages are discarded. The receiver expires after two hours; restart it for a new approved session.

The App Secret is entered directly in the local helper, stays in memory, and is never returned by an API or written to disk. The existing Page token remains server-side. The reply is fixed, requires explicit confirmation, and blocks repeat sending after a confirmed or ambiguous send result.

Send failures show the Meta error code, subcode, and a bounded reason with credentials and account identifiers redacted. The optional local Save button writes the actual MediaRecorder bytes under `tools/instagram-review/recordings`; it accepts only MP4/WebM, the same-origin session key, and a maximum of 64 MiB. Recordings are not publicly served or uploaded. The public receiver port never exposes recorder APIs.

Do not expose the receiver or register Meta webhook permissions without user approval. A public HTTPS proxy transports the webhook payload before the local tool can filter it. The public proxy must target only port 3095, never the recorder or CRM ports. Instagram webhook registration must remain separate from existing Page/LINE subscriptions.

Use the Instagram object in the Webhooks product for app-level `messages`. The Messenger Instagram page-level Subscribe controls can replace existing Facebook Page subscription fields; do not use them for this isolated test. The original MHL Page fields are `messages`, `messaging_optins`, `messaging_postbacks`, and `standby`.

The app has multiple linked Instagram accounts. Obtain approval for the actual transport scope before enabling the app-level subscription. Local diagnostics expose only counters and sanitized identity-check failures, never message payloads, sender IDs, secrets, or unrelated profile names.

Conversation control is off by default. Only start a specifically approved test session with `CAR_IG_REVIEW_THREAD_CONTROL=1` after the business permits temporary Instagram takeover. The tool can take/release only the fresh, HMAC-verified Test conversation of @crazyoilly; clients cannot specify recipients. Successful or failed reply attempts release a taken test conversation, and a manual release control is available for cleanup. An ambiguous control response prevents repeat takeover until an owner read resolves it. Restore the original Instagram per-app permission after the round; do not change Messenger permissions or the default routing application.

For an explicitly requested recording retry, the New Round control requires a confirmed previous send, released conversation control, and another signed Test received after that send attempt. An ambiguous send cannot be rearmed.

Capture the exact current review tab, not a Chrome/PWA window. The recorder uses a random per-document Capture Handle restricted to the local origin and rejects other tabs, windows, or screens before starting. Chrome must support Capture Handle. When moving to the controlled Instagram conversation after a successful reply, the user must click Chrome's “Share this tab instead” control; switching the foreground tab alone does not switch the captured source. Browser automation runs in background. Inspect decoded frames from the saved video to verify both the actual API reply and Instagram receipt before treating it as review evidence.

Do not record credentials or unrelated conversations. The recording must show an actual successful API reply and receipt in the controlled Instagram account. A trial that records a failed reply does not qualify for App Review; passing fixture tests does not prove live Meta API access.
