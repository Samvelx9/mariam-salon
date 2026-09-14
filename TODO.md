# To do

See `DONE.md` for what's already finished, and `build-roadmap-prompts.md` for the full
prompt text behind each step below.

## Resolved decisions
- ~~Where should Postgres run for dev?~~ → **Oracle Cloud VM**, via Docker Compose
  (`/opt/postgres` on `oracle-server`). Bound to `127.0.0.1:5432` only — reaching it
  from outside the VM (e.g. to run migrations from this sandbox) needs an SSH tunnel,
  or migrations get run directly on the VM.
- ~~Final production domain~~ → still open: `mariamik.info` currently running on the
  VM is a **placeholder**, not the final domain. TLS setup is deferred until the real
  domain is known (Step 8).

## Remaining build steps
- [x] ~~Step 2 — Database schema & migrations~~ (done, verified against real data)
- [x] ~~Step 3 — Guest-facing API~~ (done, verified end-to-end against real data)
- [ ] **Step 4** — Admin API (auth, services CRUD, availability, bookings status
      changes, expenses + autocomplete, financial aggregation)
- [ ] **Step 5** — Telegram notifications (bot setup, wire into booking create/cancel)
- [ ] **Step 6** — Guest-facing frontend (port `Main.dc.html` prototype to real app +
      real API + i18n)
- [ ] **Step 7** — Admin dashboard frontend (fresh design, same localization pattern)
- [ ] **Step 8** — Deployment (Oracle Cloud VM, process manager, reverse proxy + TLS)
- [ ] **Step 9** — QA pass (race conditions, cutoff boundaries, i18n, financial totals)

## Smaller open items (from the plan's "still to review" list)
- [ ] Repeat client tracking by phone number — decide if wanted (not currently planned)
- [ ] Full API endpoint list — gets nailed down as part of Steps 3 & 4

## Dev workflow note
For local iteration against the real VM database: open a tunnel with
`ssh -N -L 5433:127.0.0.1:5432 oracle-server &`, then `npm run dev:server` — 
`server/.env` (gitignored) already points `DATABASE_URL` through that tunnel port.
Remember to close the tunnel when done.

## Current next step
➡️ **Step 4 — Admin API**.
