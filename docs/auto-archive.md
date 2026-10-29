# Automatic archive and win/loss notes

The local CRM service applies the user-authorized policy: active applications
(applied, screen, take-home, interview, onsite) older than 60 calendar days in
their current stage become Rejected. Backlog, offers and closed roles are excluded.
The service checks at startup and every minute while the Mac is awake; existing
snapshot sync carries the results to this dashboard. This is a local recurring
rule, not a browser timer or a cloud scheduler.

Private role details show Win / loss notes derived from the latest corresponding
closing or offer activity. Automatic losses include prior stage, elapsed days,
stage entry date, and the explicit distinction from an employer-confirmed rejection.
Existing role notes and history are preserved. An Auto-archived filter isolates
these records. Offers are labeled Offer, not accepted/hired.

The new fields are owner-private and excluded from the existing public projection.
The public dashboard still shows the resulting Rejected stage. No SQL migration
or change to sharing permissions is needed.

Backend implementation and policy documentation live in the authoritative local
outreach-crm workspace: auto_archive.py, server.py, README.md, test_auto_archive.py.
Backups precede mutations; activity journaling prevents duplicate archive entries.

Validation: Python archive/timing tests, dashboard Node tests, and browser checks
for the archive filter, text escaping, and privacy. Browser check:
`PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/auto-archive-browser.mjs`
uses installed Chrome (override CHROME_CHANNEL if necessary).
