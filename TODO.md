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
- [ ] **Step 2** — Database schema & migrations (services, availability, bookings,
      expenses, admin_user; `btree_gist` EXCLUDE constraint; seed 5 services)
- [ ] **Step 3** — Guest-facing API (services, slots, create/lookup/cancel/reschedule
      booking, 90-min cutoff)
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

## Current next step
➡️ **Step 2 — Database schema & migrations**, targeting the Postgres instance now
running on `oracle-server` (via an SSH tunnel or run directly on the VM).
