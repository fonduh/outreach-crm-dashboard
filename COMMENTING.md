# Private role discussions

In the signed-in owner dashboard, **Private viewing links** creates one link per
person, such as `/share/niral#access=…`. Copy the entire generated link. The name
is a readable address, not authentication: a high-entropy secret in the fragment
grants access to exactly that viewer's discussion. Anyone who receives the full
link can act as that viewer, so share it only with the intended person.

A viewer selects a role, posts comments, and edits their own comments later using
the same link. The owner selects the person's name in **Private comments**, reads
their comments, and replies. Each person sees only their own thread with the
owner. The generic `/share/` page and the signed-out owner overview expose no
comments. Viewing a local snapshot also does not unlock cloud comments.

**Replace link** invalidates the old secret and preserves the discussion.
**Revoke access** stops viewer reads and writes while keeping owner access.
Generated secrets are shown once; use Replace link if a link is lost. Disabling
public sharing or switching sharing to totals also blocks viewer comments.

Comments live in separate Supabase tables and save immediately, independently
of the Mac publisher. They never enter public snapshots, CSV exports, emails,
or GitHub artifacts. Comment text is rendered as plain text. Updates use version
checks to prevent silently overwriting edits in another tab. Retrying a submitted
comment with the same request ID does not create a duplicate. Unsent drafts are
kept in page memory when changing roles or refreshing CRM data; reloading or
closing the page discards unsent drafts. Saved comments survive reloads.

## Administration and verification

Install `backend/comments.sql` once with `python3 backend/install_comments.py`.
This uses the existing project's private setup configuration; it does not alter
existing sharing, authentication, snapshots, or CRM records. Never place setup
credentials, generated tokens, or comment content in `site/`.

The normal workflow uses the owner's authenticated UI. A local admin fallback:

```sh
python3 backend/manage_reviewers.py create niral --name Niral
python3 backend/manage_reviewers.py rotate niral
python3 backend/manage_reviewers.py revoke niral
```

The fallback writes the result to a Git-ignored, owner-readable private JSON file.
It never sends the link to the person. Creating an existing name fails instead
of silently changing access.

`site/404.html` routes personalized Pages paths through the shared application;
the browser retains `/share/name` and its fragment. Opening or refreshing a named
path first receives GitHub Pages' custom 404 response and then loads the app.
Fragments are not sent in the initial HTTP request; the browser sends the secret
only to the designated Supabase RPC. Pages use `Referrer-Policy: no-referrer` via
HTML metadata. No third-party analytics are included.

Checks:

```sh
node --test tests/*.test.mjs
python3 tests/comments-backend.py
# With a local site server on 127.0.0.1:8799 and Playwright available:
node tests/comments-browser.mjs
```

The backend suite exercises the real project's anonymous and authenticated
roles inside a rolled-back transaction. The browser suite uses fixture records
and mocked RPC responses so it cannot post test messages into real discussions.
It covers creating/editing comments, reload persistence, drafts across role
changes and refreshes, text injection, mobile overflow, rejected viewing links,
public-page isolation, owner replies, and link creation.
