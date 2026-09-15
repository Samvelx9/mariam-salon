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
- [x] ~~Step 9 — QA pass~~ (done — 7/7 automated tests passing against the real
      database, plus a browser-based i18n pass closing the last language/app gaps.
      Found and fixed 3 bugs in the test script and 1 real app bug (Armenian date
      formatting). Pushed and redeployed live.)

**All 9 roadmap steps are now complete.** The app is live at http://mariamik.info/
(guest) and http://mariamik.info/admin/ (admin). See `DONE.md` for full history.

## Landing page (added after the roadmap)
- [x] Guest app now opens on a landing page (photo, intro, contacts, address, hours)
      instead of the price list; treatments → zones → booking.
- [x] Admin gains a **Landing page** tab (profile + photo upload) and a **Treatments**
      tab (service categories); Services gained a treatment picker and display order.
- [ ] **Mariam still has to fill the landing page in** — the profile's about text,
      contacts, address, map link and photo are all blank, so those sections are
      hidden on the live page until she enters them under Admin → Landing page.
- [x] ~~The price lists are still placeholder data.~~ Replaced with Mariam's real
      sugar/wax price list — twelve zones, priced identically under **Waxing** and
      **Sugaring** (migration `1789390653080_real-price-list`). Two follow-ups:
  - [ ] **Durations are estimates.** Her price sheet lists no durations, so each
        zone got a working guess (15–60 min). Mariam should check them under
        Admin → Services; they drive how much of the day a booking takes.
  - [ ] **Electrolysis has no prices yet.** It's left with zero zones, so the
        treatment is hidden from the landing page until she adds them, rather
        than showing invented numbers.

## Admin usability round (added 2026-09-15, after Mariam's first look)
- [x] **Add bookings by hand** — `POST /api/admin/bookings` plus a form on the
      Bookings tab, for phone bookings and walk-ins. Deliberately skips the
      opening-hours and 90-minute-cutoff checks the guest flow applies (Mariam
      may squeeze someone in whenever she likes); only an overlap with an
      existing booking is refused, by the database's own constraint. Sends no
      Telegram notification — she is the one entering it.
- [x] **Calendar on the Bookings tab** — month grid with a per-day count and the
      open day's bookings listed underneath, and a year view of twelve months
      with bookings/completed/income beside each. Filtering to Cancelled still
      switches to the flat clean-up list.
- [x] **Services fold by treatment** — each treatment is a row that opens to show
      its zones, so the page starts as three lines instead of twenty-four.
- [x] **Expenses can be edited and deleted** — `PATCH`/`DELETE
      /api/admin/expenses/:id` and inline controls on each recent-expense row.
      (This replaces the old "no delete endpoint exists by design" note below.)
- [x] **Language menu closes on an outside click or Escape**, in both apps, and
      shows `HY` / `RU` / `EN` rather than flag emoji — the flags fell back to
      country letter pairs, so English read as "GB".
- [x] **Lunch break per weekday** — `weekly_hours.lunch_start` / `lunch_end`
      (migration `1789390653090_weekly-lunch-break`), edited with the rest of the
      week, and excluded from the guest's bookable slots.

- [x] **Treatments can be priced by the hour** (`service_categories.is_hourly`,
      migration `1789390653100_hourly-treatments`). Ticking "Почасовая оплата" on
      a treatment turns every zone's price into an hourly rate; the guest then
      picks a length in 30-minute steps, from half an hour up to six, priced pro
      rata, and the slot list only offers starts with that much room.
      Duration and price are always computed server-side from the chosen hours,
      never trusted from the client.
  - [ ] **Mariam decides whether Electrolysis is hourly.** Left off for now: the
        price already entered there would change meaning the moment it's ticked
        (per session → per hour), which is hers to say.

## Smaller open items (from the plan's "still to review" list)
- [ ] Repeat client tracking by phone number — decide if wanted (not currently planned)
- [ ] Full API endpoint list — gets nailed down as part of Steps 3 & 4

## Dev workflow note
For local iteration against the real VM database: open a tunnel with
`ssh -N -L 5433:127.0.0.1:5432 oracle-server &`, then `npm run dev:server` — 
`server/.env` (gitignored) already points `DATABASE_URL` through that tunnel port.
Remember to close the tunnel when done.

To re-run the QA suite later (e.g. before a future deploy): with the server running
as above, `QA_ADMIN_USERNAME=... QA_ADMIN_PASSWORD=... npm run test:qa` from
`server/`. Unset `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` first to avoid spamming
Mariam's real Telegram with QA noise. Leaves 2 stray `expenses` rows per run —
delete those from Admin → Dashboard → recent expenses afterward.

## What's left (all outside the original 9-step roadmap, which is now complete)
1. **Replace the placeholder admin credentials** (`mariam` / test password) with
   real ones — the highest-priority remaining item, since the dashboard is live.
   `npm run create-admin -- <username> <password>` against the VM's Postgres.
2. **Decide the final production domain**, then follow README "Enabling TLS" —
   not urgent, the app works fully over HTTP on the placeholder domain in the
   meantime, and the swap needs no code changes.
3. The two smaller open items above (repeat-client tracking, full API endpoint
   list) — neither is blocking, both are optional future decisions.
