# To do

See `DONE.md` for what's already finished, and `build-roadmap-prompts.md` for the full
prompt text behind each step below.

## Resolved decisions
- ~~Where should Postgres run for dev?~~ → **Oracle Cloud VM**, via Docker Compose
  (`/opt/postgres` on `oracle-server`). Bound to `127.0.0.1:5432` only — reaching it
  from outside the VM (e.g. to run migrations from this sandbox) needs an SSH tunnel,
  or migrations get run directly on the VM.
- ~~Final production domain~~ → still open, but no longer blocking: the app is
  **live now** on the placeholder `mariamik.info` (Step 8). Swapping to a final
  domain later is purely nginx + DNS + a new TLS cert — no rebuild, since the
  frontends only ever call a relative `/api` path. See README "Deployment".

## Remaining build steps
- [x] ~~Step 2 — Database schema & migrations~~ (done, verified against real data)
- [x] ~~Step 3 — Guest-facing API~~ (done, verified end-to-end against real data)
- [x] ~~Step 4 — Admin API~~ (done, verified end-to-end against real data)
- [x] ~~Step 5 — Telegram notifications~~ (done, real bot, verified live delivery)
- [x] ~~Step 6 — Guest-facing frontend~~ (done, verified live in a real browser
      against the real backend, two full scripted flows, zero console errors)
- [x] ~~Step 7 — Admin dashboard frontend~~ (done, verified live against the real
      backend, zero console errors)
- [x] ~~Step 8 — Deployment~~ (done — live at http://mariamik.info/ and
      http://mariamik.info/admin/, verified end-to-end against the public domain in
      a real browser. TLS deferred, see "Resolved decisions" above.)
- [ ] **Step 9** — QA pass (race conditions, cutoff boundaries, i18n, financial totals)

## Smaller open items (from the plan's "still to review" list)
- [ ] Repeat client tracking by phone number — decide if wanted (not currently planned)
- [ ] Full API endpoint list — gets nailed down as part of Steps 3 & 4

## Dev workflow note
For local iteration against the real VM database: open a tunnel with
`ssh -N -L 5433:127.0.0.1:5432 oracle-server &`, then `npm run dev:server` — 
`server/.env` (gitignored) already points `DATABASE_URL` through that tunnel port.
Remember to close the tunnel when done.

## Reminder
- [ ] Replace the placeholder admin credentials (`mariam` / test password, created
      during Step 4 testing) with real ones — the admin dashboard is now actually
      live, so this is no longer just theoretical. Run
      `npm run create-admin -- <username> <password>` against the VM's Postgres
      (see README "Secrets").

## Current next step
➡️ **Step 9 — QA pass** (the last step in the roadmap).
