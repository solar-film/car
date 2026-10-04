# CAR CRM: preparation for the existing online site

Prepared for `https://solar-film.github.io/crm-car/`. These files are an offline deployment candidate. Nothing in this directory publishes the site, creates a hosting service, registers a webhook, grants permissions, or submits Meta App Review.

## Separate components

| Component | Purpose | Data and access |
| --- | --- | --- |
| `car-pages` | Candidate update of the existing GitHub Pages interface | An explicit static file list; no environment files, SQLite database, recordings, or local review tools |
| `car-lead` | Dedicated staff backend for CAR | A new CAR-only Access Key and persistent database; private channel tokens supplied on the server |
| `car-ig-review` | Isolated Instagram review demonstration | Separate reviewer credential, fixed approved tester and reply; no CAR customer database or Apps Script writes |

GitHub Pages serves static files. The lead interface calls a separate `/api/lead-data/...` HTTP service, so a static upload alone cannot run the Instagram reader. The current client already supports an external HTTPS service through its connection form. Configure that URL after the staff service has actually been deployed and checked.

Do not give Meta the staff service's `CAR_LEAD_ACCESS_KEY`: it authorizes broader staff APIs and is not a reviewer role. The original full lead interface can write to Apps Script directly, so the reviewer interface must remain separate from it.

## What remains before publishing

1. Select the hosting provider and cost limit. Keep CAR in its own service and private deployment source, separate from Good CRM.
2. Configure private CAR channel credentials in the provider's secret settings. Never put them in the public `solar-film/crm-car` repository, a Pages bundle, or a Docker image.
3. Attach persistent storage to the staff backend. Start with a new database; transferring any existing database requires a separate decision and verified backup.
4. Review the Pages candidate's report, including legacy password literals in client files. Its mobile files are not a replacement for the existing mobile deployment. Do not delete existing remote files when updating the listed static files.
5. Test the staff HTTPS endpoint with the exact Pages origin, authorization failure, and allowed CAR read requests before configuring the online client. Record unavailable Meta access as an error, not zero contacts.
6. Establish the isolated review URL and reviewer/test-account procedure. The existing tester is `@crazyoilly`; this is not a login credential for a Meta reviewer.
7. Obtain fresh approval immediately before public exposure, private credential transmission, any new Instagram webhook/conversation-control test, or final agreement/submission. The previous temporary test was cleaned up and is not authorization to leave a new public receiver running.

## Existing Meta draft

The existing `CRM_LEAD` draft contains Instagram plus existing Facebook-related requests. The saved Instagram description distinguishes staff lead intake from the isolated fixed-reply demonstration. The uploaded Instagram clip was verified in the saved slot as approximately 2:31 on 3 October 2026.

The reviewer instructions currently point to Good CRM. Do not replace those instructions or remove existing Facebook requests merely to add CAR. Add verified CAR-specific instructions when its isolated reviewer endpoint works. The inspected `pages_manage_metadata` description is empty; `pages_messaging` has an empty description, no selected test Page, and empty reproduction steps. Existing uploaded Facebook videos still need content verification. Do not claim the Instagram recording demonstrates Messenger.

The local recorder on ports 3094/3095 is not a public deployment component. Its temporary tunnel, webhook subscription, and conversation-control test were stopped/restored after recording.

## Verification boundaries

Local bundle checks and fixture tests can establish isolation and expected authorization behavior. They do not establish a working hosting service, persistent storage after a real restart, Meta Advanced Access, reviewer access, or successful App Review. Run the real deployment checks after the chosen service exists and before calling the integration online.

Final Windows checks on 3 October 2026 passed: 60 static files, 19 HTML pages and 197 local asset references; seven exact backend runtime files; both reviewer syntax checks; and 20 backend/reviewer fixture tests. The Pages candidate was rebuilt from the latest source after `customer-data.html` changed during preparation. Rebuild and verify again immediately before any future publication.

Docker is installed but its daemon was not running, so no container image build is claimed. No new hosting service was created. The isolated review service expires two hours after process startup and still needs an approved reviewer/test-account strategy; its URL and key alone are not sufficient for an unattended Meta review.

References: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Render Node services](https://render.com/docs/deploy-node-express-app), [Render persistent disks](https://render.com/docs/disks). Render persistent disks require a paid service; no paid service is created by this preparation.
