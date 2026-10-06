# Private job-search dashboard

GitHub Pages hosts the interface. Application records, contacts, local CRM tokens,
and backend secret keys are not part of this repository or the Pages artifact.

The dashboard supports two data connections:

- **Private backend:** Supabase Auth and row-level security protect each owner's
  snapshot. A local publisher mirrors the CSV CRM every 30 seconds while the
  local computer and CRM server are running. Realtime notifications and polling
  refresh the website. The last successful snapshot remains available when the
  computer is offline; the site displays its sync time.
- **Local snapshot:** choose a JSON file exported by `sync/sync_crm.py`. The file
  is held in browser-tab session storage and never uploaded by the file viewer.
  Tag edits in this mode affect that browser snapshot only; export it to keep them.

The local CSV CRM remains the source of truth. Website tag edits are queued in
`crm_tag_requests`; the publisher checks for conflicts, applies them through the
local CRM API, verifies persistence, and then uploads the refreshed snapshot.
The website reports queued changes as pending, not saved to the CRM. Application
statuses are not editable through this connection.

## Audience view (no sign-in)

Share `https://fonduh.github.io/outreach-crm-dashboard/share/` with viewers.
It shows companies, roles, stages, and totals without authentication. Anyone
with the link can read this selected information. It contains no contacts,
private notes, email evidence, relationship tags, or next-action reminders.
Viewers can filter the chart and roles but cannot edit the CRM.

`backend/sharing.sql` installs a read-only, allowlisted SQL projection through
`get_shared_crm`. It reads the latest private snapshot only when an explicitly
enabled entry in `crm_shared_views` identifies the owner. Anonymous users cannot
read the full snapshot, read sharing configuration, or write either table.
The shared client checks for updates every 30 seconds; the existing Mac sync
continues to update the underlying private snapshot.

After installing `backend/sharing.sql`, control sharing locally:

```sh
python3 backend/manage_sharing.py company_roles  # companies, roles, stages, totals
python3 backend/manage_sharing.py totals        # anonymized totals only
python3 backend/manage_sharing.py off           # stop serving the shared data
```

Disabling sharing stops future requests; it cannot recall copies viewers saved.
The owner dashboard at the root URL still uses private sign-in. Its Mermaid
process settings stay browser-local; the audience view uses the standard stage
map with the current counts and a separate browser storage key. No CRM data is
committed to GitHub. The audience page requests no search indexing, which is
not access control.

## Private backend setup

1. Create a Supabase project and run `setup_access.py` in an interactive Terminal.
   The helper stores project access locally with owner-only file permissions.
2. Run `python3 backend/setup_backend.py`. This installs the schema and owner-only
   access policies, disables public signup, registers your selected email without
   sending mail, and configures the dashboard redirect. It creates a private local
   sync config and `site/config.js`, containing only the project URL and public key.
3. Deploy `site/`, open the dashboard, choose **Sign in**, and request a link using
   the email registered during setup. Connection settings are already filled in.
   Supabase's default mail service only delivers to project team email addresses;
   a different address needs custom SMTP configured in Supabase.
4. Run `python3 sync/run_sync.py --once` for the initial upload. On macOS, run
   `python3 sync/install_macos.py` to install and start the server and publisher as
   login services. The publisher checks every 30 seconds while the Mac is awake.

The macOS installer creates `com.fondahu.outreach-crm-server` and
`com.fondahu.outreach-crm-sync` in `~/Library/LaunchAgents`. Logs are under
`~/Library/Logs/outreach-crm/`. Server stdout is suppressed because the existing
server prints its local extension token at startup. Both services restart after
failure and at login. A sleeping or logged-out Mac does not sync; the last cloud
snapshot remains available. Queued website tag edits wait until sync resumes.

`sync/run_sync.py` reads `sync/config.private.json` (permissions 600). Secrets
stay in that Git-ignored file, never in launchd plists or command-line arguments.
For manual process management, `sync/sync_crm.py` accepts `CRM_ROOT`,
`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `CRM_OWNER_ID` in its environment.
Legacy `SUPABASE_SERVICE_ROLE_KEY` is also supported. The `.env` example is only
for reference; neither script automatically sources `.env` files.

To make a local snapshot without connecting any cloud backend:

```sh
CRM_ROOT=/path/to/outreach-crm python3 sync/sync_crm.py --export-only /private/path/private-crm-snapshot.json
```

## Deployment

Only `site/` is uploaded to Pages. The Actions workflow publishes on changes to
`main`. Select GitHub Actions as the repository's Pages source.

The existing local CRM needs `/dashboard-data`, `/health`, and `/company-tags`
endpoints, with its token in `.crm_token`. The publisher verifies the server's
workspace before reading or updating it. It never pushes CRM records to GitHub.

## Editable stages

Interested includes all records. Applied / recruiting includes progressed roles,
with explicit submission records counted separately. Each job also belongs to one
current leaf group. Edit Mermaid and display bindings in the interface. Browser
process settings can be exported/imported independently of private job records.

## Sources and dependencies

- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase database changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- Mermaid 11.12.0 and Supabase JS 2.57.4 are bundled with their MIT licenses in `site/`.
