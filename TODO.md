# To do

See `DONE.md` for what's already finished, and `build-roadmap-prompts.md` for the full
prompt text behind each step below.

## Open decision (blocks Step 2)
- [ ] Where should Postgres run for development — locally, or on the Oracle Cloud VM
      mentioned in the plan? (This sandbox has no local Postgres/Docker available.)

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
➡️ **Step 2 — Database schema & migrations**, once the Postgres target is decided.
