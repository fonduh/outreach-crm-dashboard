# Torus outbound demo

A separate prospecting workspace adapted from the Niral reviewer's private-link collaboration pattern. It shares hosting and the configured Supabase project with the existing dashboard; it never reads or writes job-search records or Niral's discussions.

## Open

- Public sandbox: https://fonduh.github.io/outreach-crm-dashboard/torus/
- Fonda and Marcus have separate full private URLs, saved locally in `artifacts/torus/fonda.private.json` and `marcus.private.json` (ignored by Git, mode 0600). These open the same durable workspace with distinct note identities. No links have been sent.
- The public sandbox saves only in that browser. It cannot see the private workspace. “Reset demo” affects only browser-local data.

Full private links grant access to the demo; the name alone does not. A person with the full Marcus link can act as Marcus. To invalidate a link: `python3 backend/manage_torus.py rotate --viewer marcus` or `revoke --viewer marcus`. Notes survive rotation and revocation.

## Walkthrough

1. **Overview:** qualified meetings, prospect flow, upcoming meetings, and watchlist.
2. Open **Arcwell Process**: review fit evidence and the outreach angle; approve or request rework; resolve the founder ask.
3. Set a meeting time and agenda. Save to move the contact to Meeting. Download its calendar event from Meetings.
4. Use Marcus's link to leave a note; Fonda can reply. Each can edit their own notes. Changes poll every 15 seconds; Refresh fetches immediately. Unsaved forms are not replaced by polling.
5. Mark the meeting Held and record the outcome. Handoff requires strong current ICP fit, founder approval, and a held meeting.
6. Change the ICP criteria. Prospects show Recheck until their evidence is reviewed against the new version. Changing only the meeting target does not change the ICP version.

## Product decisions

- The motion is Research → Ready → Contacted → Replied → Meeting → Handoff, with Nurture and Closed as separate outcomes. Stage counts describe current state, not historical conversions.
- One record represents a contact at an account. Multiple contacts at the same account are allowed; exact company/contact duplicates are blocked in the UI.
- Four initial fit signals: target segment, document-review pain, an active project, and the right buyer. Unknown is distinct from confirmed or failed. All four confirmed signals yield Strong; any failed signal yields Low. Fit is a hypothesis until evidenced.
- Initial ICP is an authored hypothesis informed by Torus's public product and GTM role, not a founder-approved target market. Qualification is Strong current fit + founder approval + a scheduled or held meeting.
- Meetings store UTC instants and display the viewer's local timezone explicitly. Calendar export does not send invitations, book someone else's calendar, or send outreach.
- The meeting target is an editable demo-cycle target, not a claimed weekly result. Channel yield is qualified meetings / current prospects by source, not a historical reply or conversion rate.
- All seed accounts, people, evidence, and meetings are fictional. No sample notes are attributed to Marcus. Users add their own notes.
- Archiving preserves records, notes, and history. Export includes private data for the current workspace; it does not include access tokens.

## Implementation

Buildless HTML, CSS and ES modules in `site/torus/`. `model.mjs` owns fit and meeting rules. `store.mjs` separates browser-local and private cloud persistence. `backend/torus.sql` uses an isolated private schema and three narrowly scoped RPCs. Tables are not directly accessible to browser roles. Capability hashes stay server-side, note authorship is server-derived, and revisions reject stale writes. SQL validates core record and meeting invariants. Notes have size/rate limits and idempotent retries. Note text is rendered as plain text.

This is a collaborative candidate demo, not an automated email sequencer or a calendar integration. Follow-on work: real ICP agreement with founders; approved prospect import/enrichment; event/source attribution; email/calendar connections; account-level multi-contact mapping; period-based cohort conversion reporting. These need real inputs and explicit connection scopes.

## Validation

- `node tests/torus-browser.mjs` — local persistence, filters, prospect editing, meeting scheduling, timezone/calendar export, handoff gates, note edits, text injection, ICP revisions, mobile layout.
- `python3 tests/torus-backend.py` — real database authorization, cross-workspace isolation, authorship, retry safety, concurrency, qualification and revocation; rolled back.
- `node tests/torus-live-browser.mjs` — separate Fonda/Marcus browser contexts with real Supabase transport; a temporary isolated workspace is created and deleted.
- `node --test tests/*.test.mjs` — existing dashboard regression suite.

Browser tests use installed Playwright, a local server on 127.0.0.1:8842, and Chrome. Test artifacts are ignored. Production private workspace is not used for test mutations.

Sources checked October 14, 2026: https://www.usetorus.com/ and https://www.ycombinator.com/companies/torus/jobs/kBIlCwY-member-of-nontechnical-staff-gtm .
