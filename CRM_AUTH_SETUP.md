# CAR CRM login: GitHub Pages and local Node service

## Existing GitHub Pages site

`https://solar-film.github.io/crm-car/` uses `crm-auth.js` with the existing Apps Script `/exec?crmAuth=1` endpoint. Install `CarCrmAuth.gs` alongside the existing writer code and add the two `crmAuth` dispatch lines shown in `Code.gs`. Preserve the live writer source, Script Properties, deployment URL, access settings and other script files. The live combined writer can be newer than this workspace: do not overwrite it with an older local copy.

Private Script Property `CAR_CRM_AUTH_CONFIG` holds `username`, salted scrypt `passwordHash`, `commissionHash`, a random 32-byte hex `secret`, and `revision`. Never publish this value, a provisioning script, `.crm-auth.json`, or backup sources. Existing credentials are migrated unchanged. Authentication returns a random opaque session token stored in browser localStorage; Apps Script stores only its digest. Main sessions last 12 hours and commission access 30 minutes. Logout revokes the server session. Legacy `carCrmLoggedIn` flags are ignored. Storage events verify sessions with Apps Script before unlocking another tab. Temporary network errors do not reload an already authenticated form and erase its draft.

GitHub Pages still serves static assets publicly. This login controls the normal page workflow; it does not make published Google Sheets CSV data private or replace the separate writer token / Lead Access Key. The Apps Script retry guard is best-effort per browser, not an IP firewall or attack monitoring system. Existing credentials had previously appeared in public client files and repository history; removing them from current files does not erase that history.

For a static preview only, set `data-transport="apps-script"` on the `crm-auth.js` script tag. Other hosts default to the local Node auth API. The production hostname and Apps Script URL are explicit constants. No additional hosting subscription is used.

For an authentication-only release, `tools/deployment/car-pages/build-login-update.cjs` patches the verified live snapshot and produces 14 existing gated pages plus two auth assets, preserving unrelated page logic and existing files. The full local Pages bundle also contains unpublished Lead-service changes and requires separate validation; do not replace the live site with that bundle as part of login migration.

## Node service

CRM passwords are checked by `crm-session.cjs` inside `lead-data-server.cjs`. Browser code contains no password. Changing `carCrmLoggedIn` in localStorage does not grant access. The server protects every CRM HTML entry except `crm-login.html` and uses a random `HttpOnly; SameSite=Strict` session cookie. Main sessions last 12 hours; separate technician commission access lasts 30 minutes. Restarting the server clears sessions.

## Local use

Open `http://127.0.0.1:3092/`, with the existing Node CAR service running:

```powershell
node lead-data-server.cjs
```

The local `.crm-auth.json` contains salted scrypt hashes migrated from the existing login and commission credentials. It is private, ignored by Git, denied by the static-file server, and excluded from deployment bundles. Keep the file on the server; do not publish or paste it into chat. Old localStorage login flags are deliberately discarded; sign in once again after the upgrade. Same-origin tabs and new pages reuse the server cookie.

Opening HTML with `file://` cannot supply authentication. A generic static preview requires the explicit Apps Script transport described above. Local Node hosting uses a same-origin auth API. The API-only Lead bundle includes auth runtime code but does not include CRM HTML.

## Remote hosting

Use HTTPS and set `CAR_CRM_PUBLIC_ORIGIN` to the exact origin, for example `https://crm.example.com`, with no trailing slash or path. Forward the original Host header through the trusted HTTPS proxy. Remote cookies have the `Secure` attribute. Keep the separate `CAR_LEAD_ACCESS_KEY` and existing Write Token requirements; they are independent of the browser login.

Credentials may be supplied privately through these server environment variables instead of `.crm-auth.json`:

- `CAR_CRM_AUTH_USER`
- `CAR_CRM_AUTH_PASSWORD_HASH`
- `CAR_CRM_AUTH_COMMISSION_HASH`

Hash format is a random 16-byte salt in hex, a colon, and a 64-byte scrypt result in hex. `passwordHash()` in `crm-session.cjs` creates this format. Provision new credentials privately before public hosting because the old passwords previously appeared in client files. Never place passwords or hashes in HTML, JavaScript assets, repository examples, or the public candidate.

Ten failed attempts per address and gate are blocked for ten minutes. Wrong origins, non-JSON login requests, oversized bodies, expired cookies and forged cookies are rejected. Client cross-tab storage notifications only trigger a fresh server check; they never carry authorization.

## Data access boundary

This change protects entry to the CRM served by this Node server. It does not change the existing Google Sheets published CSV access, Google Drive/AppSheet permissions, or other copies of the old static site. A published CSV remains accessible through its own Google URL. Restricting that underlying data requires an authenticated read backend and a separate migration of those existing data sources.

## Apps Script fixes

Deploy the updated `Code.gs` and `LeadSheet.gs` together with the existing `CarContactHistory.gs`, `CarBookingStatusSync.gs`, and `appsscript.json` to the same Apps Script project. Keep the existing script properties and `/exec` URL. Do not replace existing sheet data. The local tests simulate Apps Script; they do not update the deployed version.

Lead updates compare the previous fields even when the lead key already matches. The name-cell note retains the existing lead marker and adds a request/snapshot digest to distinguish an exact network retry from a stale edit. An interrupted request reserves its row for the same retry; a newer conflicting edit is blocked. Invalid update/delete requests without a usable identifier fail before acquiring a write lock or changing any cells.
