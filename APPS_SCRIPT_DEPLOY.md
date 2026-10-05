# Apps Script Deploy Guide

This project has two different Apps Script backends. Deploy the file that matches the page you are fixing.

## CAR CRM writer pages

Use these files for `index.html`, `customer-data.html`, and the other pages that write to the shared backend:

- `Code.gs`
- `LeadSheet.gs`
- `CarContactHistory.gs`
- `CarBookingStatusSync.gs`
- `appsscript.json`

Required deployment steps:

1. Open the Google Sheet used by CAR CRM.
2. Go to `Extensions` > `Apps Script`.
3. Put the contents of `Code.gs` into the Apps Script `Code.gs` file.
   Also update `LeadSheet.gs`, `CarContactHistory.gs`, and `CarBookingStatusSync.gs` in the same project; the Lead API depends on these files.
4. Add or replace the Apps Script manifest with `appsscript.json`.
5. Open `Project Settings` > `Script properties`.
6. Add `CAR_CRM_WRITE_TOKEN` with a long random secret value.
7. For PayIn photos, the script normally verifies and finds `CAR_CRM-691939189/Images/Pay_In` inside `appsheet/data` automatically. If it cannot verify that path or Google Drive contains more than one matching app folder, add `CAR_CRM_PAYIN_FOLDER_ID` with the Folder ID of the existing `Pay_In` folder.
8. In the `PayIn` sheet, insert `หลักฐาน_3` and `หลักฐาน_4` immediately after `หลักฐาน_2` and before `วันที่บันทึกรายการ`.
9. Save the project.
10. Select and run `authorizeOnce()`.
11. Approve both the Google Sheets and Google Drive permission prompts. In the granular permissions screen, select the Drive permission to create and edit files; permission to view files alone cannot upload PayIn photos. `authorizeOnce()` now explicitly requires the full Sheets and Drive scopes.
    Run `verifyPayInDriveWriteOnce()` after granting permissions. It creates a small probe image in the existing PayIn folder, verifies it, and moves only that probe to trash. Confirm its log reports `created: true` and `trashed: true`; a successful folder read alone does not prove upload permission.
12. Go to `Deploy` > `Manage deployments` > edit the web app deployment.
13. Select `Version` > `New version`.
14. Keep `Execute as` set to `Me`.
15. Keep access set to `Anyone` or `Anyone with the link`.
16. Deploy and keep using the `/exec` URL in the writer pages.

This prevents the error:

`You do not have permission to call SpreadsheetApp.openById. Required permissions: https://www.googleapis.com/auth/spreadsheets`

The important permanent fix is the explicit `spreadsheets` and `drive` scopes in `appsscript.json`, plus running `authorizeOnce()` before deploying the new version. The Drive scope is required for the PayIn camera/photo upload in `index.html`.

## PayIn photo storage

- The PayIn form accepts up to four JPG, PNG, or WebP photos, downsizes them in the browser, and sends them to `Code.gs`.
- `Code.gs` saves the actual files in the existing AppSheet folder `CAR_CRM-691939189/Images/Pay_In`.
- The sheet keeps AppSheet-compatible relative paths in `หลักฐาน_1` through `หลักฐาน_4`; existing AppSheet and CAR CRM views can therefore use the same files.
- Each save carries a short-lived idempotency key, preventing common mobile/network retries from creating the same PayIn row and photos twice.
- The script does not make payment evidence public. Access continues to follow the existing Google Drive/AppSheet permissions.
- `driveCheck=1` reports ready only when the deployment has full Drive authorization and can read the configured evidence folder. This check creates no probe files; use `verifyPayInDriveWriteOnce()` to verify actual writing.
- Replacing or removing a proof updates the sheet reference but retains the previous private Drive file for audit/recovery; no evidence file is permanently deleted by the web form.

For write access, every POST request must include the same token as `CAR_CRM_WRITE_TOKEN`. The writer pages (`customer-data.html`, `index.html`, `contact-stats.html`, `technician.html`, `technician-queue.html`, and `other-damage.html`) ask for this token the first time a user saves data, then store it in that browser's `localStorage` under `carCrmWriteToken`. If the stored token is rejected, the page clears it, asks again, and retries once. Do not commit the real token to GitHub.

If the browser shows `Write token ไม่ถูกต้องหรือไม่ได้ระบุ`:

1. Confirm the latest HTML files have been published to the website. An older page may POST without a token.
2. Confirm the `CAR_CRM_WRITE_TOKEN` property is set in the same Apps Script project used by that page's `/exec` URL.
3. Enter the property value exactly when prompted. Do not send or paste the real token into GitHub issues or chat.
4. If the browser still has an obsolete value, clear the site's stored data or run `localStorage.removeItem('carCrmWriteToken')` in DevTools, then save again.

## Legacy apps-script.gs

`apps-script.gs` is a legacy backend from the removed `admin.html` page. It uses a token API (`API_TOKEN`) and a different request/response contract from `Code.gs`.

Do not deploy `apps-script.gs` for `customer-data.html`.

## Quick Check

If `customer-data.html` can load rows but saving fails, check the Apps Script deployment first:

- Is the deployed code from `Code.gs`?
- Is `appsscript.json` present in Apps Script?
- Is `CAR_CRM_WRITE_TOKEN` set in Script properties?
- Was `authorizeOnce()` run and approved?
- Was a new deployment version published after approval?
