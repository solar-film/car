# CAR CRM Pages offline candidate

This prepares a private snapshot of the current CAR frontend for the existing `https://solar-film.github.io/crm-car/` site. It does not publish, upload, commit, change a branch, modify the running local frontend, or change GOOD CRM.

**Do not publish this full candidate as the login update.** GitHub Pages login is supported by the existing Apps Script deployment through `crm-auth.js`. The separate `build-login-update.cjs` script builds an auth-only update from a verified live snapshot. This full local candidate includes other unpublished changes, including a Lead page whose Node service still needs separate hosting. See `CRM_AUTH_SETUP.md` for both transports and the data-access boundary.

## Files and verification

`allowlist.json` contains the audited dependency closure: exactly 20 root HTML entry points and 43 explicitly named client assets (63 total). The builder reads only those named files. It excludes `.env`, `.lead-data`, database files, exports, backups, Apps Script sources, `tools`, tests, temporary files, recordings, private assets, and unreferenced images. Reports, scripts, and this README are outside `candidate/public`.

The existing mobile app is not referenced by these 20 desktop entry points, so it is not copied. This is not an instruction to delete the existing online `mobile/` files or any other online files.

Only the copied HTML and manifest are transformed:

- Leading `/` is removed from PWA references to `app.webmanifest` and the `images/car-crm-app*.png` icons.
- Manifest `id`, `start_url`, and `scope` become `./`; manifest icon paths become relative.
- All remaining bytes, including JavaScript, CSS, images, external endpoints, and existing functionality, are preserved.

The build verifies all static local asset references under `/crm-car/`, resolves manifest URLs to that same subpath, rejects extra or forbidden payload files, and compares the source and output SHA-256 hash for each file. Expected changes: 19 HTML files plus the manifest; expected unchanged files: 43. Runtime-generated URLs and browser/API behavior require later verification with the actual CAR backend.

## Build locally

Run from the CAR_CRM workspace with Node.js:

```powershell
node tools/deployment/car-pages/build.cjs
node tools/deployment/car-pages/build.cjs --verify
```

Output:

- `candidate/public/`: private Pages candidate payload only.
- `candidate/inventory.private.json`: hashes, transformations, validation scope, and publication blockers. Keep this outside any public upload.

Repeated builds overwrite only the explicitly allowed candidate files. Unexpected files or symlinks cause an error; the builder performs no recursive deletion.

## Existing site

The parent read-only Chrome audit on 3 October 2026 verified the public repository `solar-film/crm-car`, branch `main`, and latest commit `89ba2482f5f2c0134f9af5d2e45919297ae1385d` ("Add files via upload", 1 October 2026, 09:25 GMT+7). The repository view contained 37 files, including `mobile/`. This records observed state; it does not assert that the deployment source settings are confirmed or that the remote will remain unchanged.

This workspace is not a Git checkout; this builder neither checks out nor changes that repository or its branch. Before any later publication, reverify the repository, Pages source settings, branch, latest commit, credentials, backend URL, and the exact proposed upload with the user.

After the separate CAR service exists, enter its exact HTTPS URL in the Lead page's existing connection form; that saves `carLeadServiceUrl` locally in the browser. A remote URL has not been invented or injected into the copied code. Current frontend defaults to the page origin until configured, which is insufficient for a GitHub Pages installation.
