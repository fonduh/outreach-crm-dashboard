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

## Private backend setup

1. Create a Supabase project. Run `backend/schema.sql` in its SQL editor.
2. Invite your own user through Supabase Auth. Public account creation is not
   offered by this app. Add the GitHub Pages URL to Auth's allowed redirect URLs.
3. Put the project URL and **public** publishable/anon key into the site's
   **Data connection** dialog, then request a sign-in link.
4. On your own computer, copy `sync/.env.example` to an untracked `.env`, use the
   project's private legacy `service_role` JWT, and set your Auth user UUID as
   `CRM_OWNER_ID`. Keep this file private; never paste the secret into the website.
5. Run your local CRM server, then launch the publisher with those environment
   variables set:

```sh
python3 sync/sync_crm.py --once
python3 sync/sync_crm.py --interval 30
```

The publisher requires `CRM_ROOT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
and `CRM_OWNER_ID` in its environment. It uses only Python's standard library.
The `.env` example documents variables; the script does not automatically load it.
Use your process manager or shell environment to supply them.

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
