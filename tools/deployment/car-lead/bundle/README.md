# Separate CAR lead service: offline deployment preparation

This package prepares the existing CAR lead API for a separate HTTPS host. It does not start or deploy a service, expose a tunnel, copy existing customer data, or change the running CAR/GOOD CRM systems. GitHub Pages continues to host the static website at `https://solar-film.github.io/crm-car/`; Pages cannot execute this Node API.

## Build and inspect locally

From the CAR_CRM folder, run:

```powershell
node tools/deployment/car-lead/build-bundle.cjs
node tools/deployment/car-lead/build-bundle.cjs --check
node --test tools/deployment/car-lead/verify.test.cjs
```

The builder copies exactly eight runtime source files plus Dockerfile, .dockerignore and this README into `tools/deployment/car-lead/bundle`. `inventory.json` records every packaged file's size and SHA-256. A repeat build only verifies an existing exact bundle; it never overwrites changed files or deletes a directory. Dependency checks reject runtime imports outside the allowlist.

No `lead-data.env`, private environment file, SQLite database, legacy snapshot, browser password, HTML, test recording or GOOD CRM file is copied. The blank `production.env.example` stays outside the generated bundle. Do not add real values to that example.

## Deployment prerequisites

Choose a separate host supporting Docker/Node 24, HTTPS and a persistent disk. Keep its credentials separate from GOOD CRM. Supply a private environment file or the host's secret manager after the deployment is authorized. The fixed defaults are:

- Listen on `0.0.0.0:10000` behind the host's HTTPS endpoint.
- Persistent database `/var/data/car-leads.sqlite`, initially empty. Do not mount/copy the current CAR database.
- Exact browser origin `https://solar-film.github.io` (an origin has no `/crm-car/` path).
- A private CAR Access Key of at least 32 characters. Blank/missing or shorter keys fail startup before opening the service.
- Private CAR Page/Instagram tokens on the server only. Empty tokens leave channels unconfigured.
- LINE/Facebook webhook secrets remain empty. Provider intake uses existing read APIs/sheets; no webhook or conversation routing change is part of this package.

The database volume must be writable by the container's `node` user. SQLite is not suitable for a shared filesystem or simultaneous service replicas using the same file; run one instance against this volume. Use a SQLite/WAL-aware backup procedure before any later migration.

The health check calls `/api/lead-data/config` on loopback and checks the response shape. It proves the process responds, not that Meta permissions/tokens work. API data routes require `X-Car-Lead-Key`; the current API uses one shared key, not individual user accounts. Do not give a reviewer the production key or database.

## After explicit deployment authorization

Build the image using only the generated `bundle` as Docker build context. Supply credentials from outside that context, mount the private persistent volume at `/var/data`, and terminate HTTPS on the chosen host. The Dockerfile exposes container port 10000 but does not publish it by itself. Confirm authenticated API access and CORS from the actual Pages site before setting the lead page's external service URL.

The page's connection form accepts the HTTPS API origin and keeps its CAR Access Key in that browser session. Without an external service URL, the page defaults to the Pages origin, where `/api/lead-data/*` does not exist. This bundle does not change that client configuration or the Apps Script writer deployment.

The imported runtime exposes existing lead/storage operations as well as provider reads; this is not a read-only database API. Leave webhook credentials empty and do not register callback URLs. A reviewer demo requires its own data/access plan and any new test-message permissions separately.

## CRM authentication

The runtime includes `crm-session.cjs`. This API-only bundle does not include CRM HTML. The full CRM website must be served by the Node server on the same HTTPS origin as `/api/crm-auth/`; static GitHub Pages alone cannot protect pages or issue the session cookie. For a full server deployment, set `CAR_CRM_AUTH_USER`, `CAR_CRM_AUTH_PASSWORD_HASH`, `CAR_CRM_AUTH_COMMISSION_HASH`, and the exact `CAR_CRM_PUBLIC_ORIGIN`. See the workspace `CRM_AUTH_SETUP.md`. The existing separate Lead Access Key is still required for lead API access. Private `.crm-auth.json` is never packaged.
