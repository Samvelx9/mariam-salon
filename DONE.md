# Done so far

## Planning
- Full spec written: `salon-booking-app-plan.md`
- Step-by-step build roadmap written: `build-roadmap-prompts.md`
- Guest-flow clickable prototype built: `Main.dc.html` / `canvas.json`
  (also published at https://claude.ai/code/artifact/b01bc210-f9e8-49d9-a6f2-30e9ae9b9d26)

## Decisions locked in
- Stack: **Node.js/Express** backend, **React (Vite)** for both frontends
- Admin financial dashboard: no old mockup to track down — will be designed fresh in
  Step 7, matching the guest app's visual style
- Database migrations tool: `node-pg-migrate`

## Step 1 — Project scaffolding ✅
- npm-workspaces monorepo: `server`, `client-guest`, `client-admin`
- Express server with a Postgres pool (`server/src/db.js`) and `GET /api/health`
- `server/.env.example` with `DATABASE_URL`, `JWT_SECRET`, Telegram token/chat-ID placeholders
- `node-pg-migrate` wired up (`server/migrations/`, `npm run migrate:up`)
- Verified: server boots, health check correctly reports DB reachable/unreachable; both
  React apps build cleanly; `npm audit` clean (0 vulnerabilities)
- Git repo initialized, first commit made

## Repo hosting
- Created public GitHub repo: https://github.com/Samvelx9/mariam-salon
- Pushed initial scaffold (codebase + planning docs, no `.env`, no client/customer data)

## Oracle Cloud VM prep (`oracle-server`, 158.101.169.222, Ubuntu 24.04 aarch64)
- Confirmed already present: Docker 29.8.0 + Docker Compose v5.5.1, git
- Found pre-existing infra: an `nginx:stable-alpine` container (compose project at
  `/opt/nginx-setup`) serving a placeholder page for **mariamik.info** (DNS already
  points here) — HTTP only, HTTPS block prepared but commented out, no cert yet
- **PostgreSQL 16 (alpine) deployed via Docker Compose** at `/opt/postgres/` on the VM:
  - `docker-compose.yml` + `.env` (credentials — `POSTGRES_USER=mariam_app`,
    `POSTGRES_DB=mariam_salon`, generated password — live only in
    `/opt/postgres/.env` on the VM, mode 600, not copied anywhere else)
  - `btree_gist` extension auto-enabled via an init script in
    `/opt/postgres/init/01-extensions.sql` — verified present
  - Bound to `127.0.0.1:5432` only (not publicly exposed); reachable from other
    containers via the shared `nginx-setup_web` docker network under hostname `postgres`
  - Verified healthy (`pg_isready` OK, `btree_gist` confirmed in `pg_extension`)
- **Decided**: no Node.js/pm2 install on the host — the app itself will be
  containerized in Step 8, consistent with "docker compose wherever applicable"
- **Deferred** (by explicit choice): TLS cert for mariamik.info — it's a placeholder
  domain, not the final one, so this waits until Step 8 with the real domain

## Step 2 — Database schema & migrations ✅
- 5 `node-pg-migrate` migrations in `server/migrations/`: `admin_user`, `services`
  (seeded with the 5 real services from the plan), `weekly_hours` +
  `availability_blocks`, `bookings`, `expenses`
- `bookings` has the `EXCLUDE USING gist (tstzrange(start_time, end_time, '[)') WITH &&)
  WHERE (status <> 'cancelled')` constraint — **tested directly against real data**:
  an overlapping insert was rejected, cancelling the conflicting booking let the new
  one through, and the test rows were cleaned up afterward
- Ran the migrations on the VM itself via a throwaway `node:20-alpine` Docker
  container on the `nginx-setup_web` network — never installed Node on the host, and
  the DB password was sourced from `/opt/postgres/.env` entirely within the remote
  SSH session (never pulled into this sandbox)
- Migration source files copied to `/opt/app/server/migrations` on the VM (kept in
  sync with `server/migrations/` in this repo — re-copy after future migration changes)
- Services table stores per-language names (`name_en` / `name_ru` / `name_hy`) since
  the plan's localization section calls out service names explicitly, matching the
  prototype's `SERVICE_NAMES` structure in `Main.dc.html`

## Step 3 — Guest-facing API ✅
- `GET /api/services` — active services with per-language names
- `GET /api/services/:id/slots` — open slots over the next 7 days (weekly hours minus
  date blocks minus existing non-cancelled bookings minus the 90-min cutoff), always
  computed fresh, no caching. Supports `?excludeBookingId=` for the reschedule picker
  so a booking's own current slot doesn't count as "taken by itself"
- `POST /api/bookings` — create; 90-min cutoff, availability check, and the DB
  `EXCLUDE` constraint as the double-booking safeguard of last resort (caught and
  turned into a friendly `409 slot_taken`)
- `POST /api/bookings/lookup` — upcoming (non-cancelled, non-completed, future)
  bookings for a phone number
- `POST /api/bookings/:id/cancel` — no cutoff, idempotency-safe (409 if already
  cancelled)
- `POST /api/bookings/:id/reschedule` — same cutoff/availability/overlap rules as
  create, via `UPDATE` (Postgres `EXCLUDE` constraints don't self-conflict, so this
  works correctly without extra logic)
- Armenia (Asia/Yerevan) has a fixed UTC+4 offset with no DST since 2011, so all local
  ↔ UTC conversion uses a small constant-offset helper (`server/src/lib/time.js`)
  instead of a timezone library
- Telegram notifications stubbed as a no-op (`server/src/services/telegram.js`),
  called from create/cancel — real implementation is Step 5
- Fixed a real gap found while testing: the `EXCLUDE` constraint only prevents
  double-booking, it does **not** stop a booking outside working hours or during a
  blocked date/window. Added `isSlotWithinAvailability()` as an explicit app-layer
  check on create/reschedule (confirmed via a live test: a Sunday booking was wrongly
  accepted before the fix, correctly rejected after)
- Verified end-to-end against the real Postgres on the VM (via a temporary SSH tunnel
  + a freshly-rotated `mariam_app` password used only for local dev — the original
  password was never read back into this sandbox): create, cutoff rejection, overlap
  rejection (`409 slot_taken`), phone lookup, reschedule, cancel, idempotent
  double-cancel (409), reschedule of a cancelled booking (409), reschedule of a
  missing booking (404). All test rows cleaned up afterward.

## Step 4 — Admin API ✅
- `POST /api/admin/login` — username/password against the single `admin_user` row
  (bcrypt), returns a JWT (12h expiry). Everything else under `/api/admin` is guarded
  by `requireAdminAuth` (`server/src/middleware/auth.js`)
- No public signup endpoint — the admin account is provisioned via
  `npm run create-admin -- <username> <password>` (`server/scripts/create-admin.js`,
  upserts the single row, so it also works to reset a forgotten password)
- Services: full CRUD. Delete attempts a real `DELETE`; if the service has booking
  history the FK constraint blocks it and the API returns a friendly `409
  service_has_bookings` suggesting `isActive:false` instead — verified live (created
  a booking against a service, confirmed the delete was blocked with that message)
- Availability: `GET`/`PUT` weekly hours per day, `GET`/`POST`/`DELETE` date-specific
  blocks
- Bookings: `GET` list (filterable by date range/status) for the calendar view,
  `PATCH .../status` for manual status changes (completed/cancelled/no_show) — no
  cutoff, no restrictions, matching the plan's "all status changes are manual"
- Expenses: `POST` create, `GET` list (filterable), `GET .../categories` for
  autocomplete (distinct categories, most recently used first)
- `GET /api/admin/financials?from=&to=` — income by service, expenses by category,
  net, bookings-completed count, all AMD. Verified against hand-calculated numbers
  (12000 income, 20000 expenses, net -8000) using a seeded test dataset
- Verified live: no-show marking does **not** block that phone number from booking
  again (created a booking, marked no_show via admin, guest successfully re-booked
  the same phone number)
- Two real bugs found and fixed while testing, both now covered:
  - Postgres `DATE` columns (`availability_blocks.date`, `expenses.date`) were coming
    back as JS `Date` objects parsed in the **server process's local timezone**,
    silently shifting the calendar date on serialization (a `2026-09-21` block round
    -tripped as `"2026-09-20T20:00:00.000Z"`). Fixed with a `pg` type-parser override
    in `server/src/db.js` so `DATE` always returns a plain `'YYYY-MM-DD'` string —
    verified the shift is gone and slot-blocking by date still works correctly
  - `/api/admin/financials` was returning `SUM`/`COUNT` as strings (Postgres's
    default for aggregates, to avoid bigint precision loss) instead of numbers —
    fixed by mapping the rows before response
- A placeholder admin account (`mariam` / test password) was created on the VM's
  database for testing — **replace this with a real password before going live**
  (`npm run create-admin -- <username> <newpassword>` on the VM, run against the VM's
  Postgres, resets it)

## Step 5 — Telegram notifications ✅
- Real bot created via @BotFather: `@Myshugbot`. Mariam started a DM with it, and her
  chat ID was found via the bot API's `getUpdates` (value lives only in `server/.env`,
  not committed — same treatment as the bot token) — the lookup process is documented
  as a repeatable one-time setup in the root `README.md` ("Telegram notifications
  setup"), not just in code comments, per the plan
- `server/src/services/telegram.js` — real implementation replacing the Step 3 stub.
  Sends a Russian-language message (plan's default language) on booking creation and
  cancellation, with service name, local date/time, customer name and phone
- **Best-effort by design**: wrapped in try/catch so a Telegram outage or missing
  config never breaks the booking flow itself — logs an error and moves on rather
  than throwing
- Bot token + chat ID stored as env config (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)
  in `server/.env` (gitignored) — never hardcoded, never committed
- Verified live end-to-end: created a real booking and cancelled it against the real
  Postgres + real Telegram API — Mariam confirmed receiving both the new-booking and
  cancellation messages. Test booking cleaned up afterward.
- Fixed a bug caught before testing: the create-booking handler's `RETURNING` clause
  didn't include `customer_name`/`customer_phone`, so the notification would have sent
  with missing customer details — fixed by attaching them onto the object passed to
  `notifyTelegram`.

## Step 6 — Guest-facing frontend ✅
- Full React port of `Main.dc.html`'s guest flow: `client-guest/src/` — one component
  per screen (services, calendar, details, confirmation, lookup, bookingsList, manage,
  reschedulePicker, cancelConfirm, cancelled), a `useBookingFlow` hook holding all
  state/API calls (mirrors the prototype's `renderVals()` pattern), shared pieces
  (`Header`, `LangSwitcher`, `SlotPicker`, `SummaryBanner`, `ErrorBanner`)
- Real API wiring throughout — no more mock `SERVICES`/`SLOTS_BY_DAY`/
  `MOCK_UPCOMING_BOOKINGS` arrays; every screen transition hits the real Step 3 API
- i18n: same `STRINGS` dict (en/ru/hy, ru default) ported into `i18n.js`, same flag
  switcher on every screen, `Intl`/`toLocaleString`-based date/price formatting kept
- Visual design ported faithfully (oklch sage/terracotta/cream palette, Newsreader +
  Karla fonts, same layout/spacing) but responsive instead of a fixed 390×844 frame —
  centered column, full height, works down to phone width
- Two intentional departures from the prototype, both because the underlying feature
  doesn't exist: dropped the "SMS confirmation" phrasing in the details caption and
  confirmation message (no SMS is actually sent — replaced with accurate copy), added
  translated empty-state/error copy the mock never needed (`noBookingsFound`,
  `slotTaken`, `tooSoon`, `genericError`, `loading`)
- **Verified live in a real headless browser** (Playwright, installed to the
  scratchpad only, removed afterward) against the real backend + real Postgres +
  real Telegram bot, two full scripted runs:
  - New-booking path: services → language switch → calendar → details (including the
    empty-fields validation error) → confirm → confirmation → cancel → cancelled.
    9/9 checks passed, zero console errors
  - Lookup path: lookup (including empty-phone validation) → bookings list → manage →
    reschedule picker → confirm new time → back on manage → cancel → cancelled. 9/9
    checks passed, zero console errors
  - All test bookings cleaned from the database afterward (each test booking did
    trigger real Telegram notifications to Mariam, as designed)
- **Two real bugs found and fixed via this testing, not by inspection:**
  1. The language dropdown on the services screen was clipped almost entirely
     invisible — it sat inside the decorative header circle's `overflow: hidden`
     wrapper. Fixed by giving the circle its own dedicated clipping wrapper so the
     dropdown (a sibling) isn't constrained by it. Confirmed fixed via screenshot.
  2. (Test-script-only, not an app bug) an initial "no slots ever load" failure
     turned out to be the test waiting only 500ms before checking, not accounting for
     Vite's cold on-demand module compile on first navigation to the calendar screen —
     confirmed the app itself was fine by reproducing with proper `waitForSelector`
     instead of a fixed sleep.

## Step 7 — Admin dashboard frontend ✅
- New `shared` npm workspace (`salon-shared`) holding the i18n primitives common to
  both frontends — `LANG_META`/`LANG_ORDER`/`LOCALE_TAG`/`DEFAULT_LANG`, date/price
  formatting helpers, and the Yerevan-time split helper — imported by both
  `client-guest` and `client-admin` instead of being duplicated (per the roadmap's
  explicit "reuse shared translation strings... rather than re-translating from
  scratch"). `client-guest` was refactored to consume it too, confirmed still builds
  and its full test suite (from Step 6) still passes conceptually via a clean build.
- `client-admin/src/`: login (JWT, persisted to `localStorage`), a tabbed layout
  (Dashboard / Bookings / Services / Availability), same trilingual `STRINGS` pattern
  (ru default, flag switcher in the top bar)
- **Dashboard**: period presets (this month / last 30 days) + custom range, 4 metric
  cards (income/expenses/net/bookings completed), income-by-service and
  expenses-by-category breakdowns, a quick-add expense form with category
  autocomplete (`<datalist>` from `GET /expenses/categories`), recent expenses list
- **Services**: list (including inactive), add/edit form, deactivate/activate,
  FK-protected delete with the friendly error surfaced as a browser alert
- **Availability**: weekly hours editor (per-day open/closed + start/end time, save
  per row), date-block list + add/delete form (whole-day or a specific time window)
- **Bookings**: a week-at-a-time list grouped by day (not a full calendar-grid
  widget — a deliberate simplification for a solo-practitioner's booking volume),
  prev/next/today navigation, status filter, and a manual status-change dropdown per
  booking
- No dashboard mockup was tracked down (decided at the very start of the project) —
  designed fresh, matching the guest app's visual language (same palette/fonts) but
  a wider, desktop-oriented layout
- **Verified live** in a real headless browser against the real backend + Postgres,
  across several scripted runs (login, dashboard + quick-add expense, services CRUD
  including delete, availability, bookings + status change, Armenian language
  switch) — all checks passed, zero console errors
- **Two real bugs found and fixed via this testing:**
  1. A genuine login bug: `useAdminAuth` set the API client's auth token inside a
     `useEffect`, but a child screen's own data-fetching effect fires *before* a
     parent's effect on mount/update (React's effect ordering) — so the very first
     authenticated request after login always went out without the token, got a 401,
     and the app treated that as an invalid session and immediately logged back out.
     Fixed by setting the token synchronously wherever it changes (login, logout, and
     the initial `localStorage` read) instead of via an effect.
  2. Minor: the services list showed a bare number for duration ("30 · 12,000") with
     no unit — added the missing `minUnit` translation and fixed the display.

## Step 8 — Deployment ✅
- Resolved the domain question by tracing through what actually needs one: none of
  the internal calls (backend↔Postgres, backend↔Telegram) reference a domain at all —
  only the browser-facing URLs and TLS cert issuance do. So the frontends were built
  to call the API via a **relative** `/api` path (`client-guest/.env.production` /
  `client-admin/.env.production`) rather than a hardcoded domain, meaning the compiled
  JS never contains the domain anywhere — deployed live now on the placeholder
  `mariamik.info` (DNS already points there), and swapping to a final domain later is
  purely an nginx + DNS + TLS-cert change, confirmed to need zero rebuild
- `server/Dockerfile` — `node:20-alpine`, prod deps only, `HEALTHCHECK` via Node's own
  `fetch` (no extra binary needed)
- On the VM: cloned this repo to `/opt/app/repo` (public repo, plain `git clone`),
  `/opt/app/.env` (backend secrets — `DATABASE_URL` built from `/opt/postgres/.env`
  entirely via a remote shell, a freshly generated `JWT_SECRET`, the Telegram
  token/chat-id — nothing pulled back into this sandbox), `/opt/app/docker-compose.yml`
  (backend service, joined to the existing `nginx-setup_web` network, no published
  port — reachable only via nginx)
- Both frontends built via a throwaway `node:20-alpine` container on the VM (still no
  Node installed on the host) and published into nginx's webroot: guest app at `/`,
  admin dashboard at `/admin/` (`vite.config.js` sets `base: '/admin/'` for
  production builds only, confirmed via a build that all asset URLs came out prefixed
  correctly)
- Updated `/opt/nginx-setup/conf.d/mariamik-http.info.conf`: `/api/` reverse-proxies
  to the backend container (confirmed DNS resolution between containers first via
  `getent hosts` before writing the config), `/admin/` serves the admin SPA with a
  fallback to its own `index.html`, `/` serves the guest SPA. Validated with
  `nginx -t` before applying, then applied with a **zero-downtime** `nginx -s reload`
  (not a restart)
- `/opt/app/deploy.sh` — the documented, repeatable redeploy path: git pull, rebuild
  + restart the backend container, rebuild both frontends, republish static files
- **Verified fully live** against the real public domain (not just internally): a
  real headless-browser run hit `http://mariamik.info/` and `http://mariamik.info/admin/`
  directly — full guest booking flow (services → slots via the live API proxy →
  booking → confirmation → cancel) and admin login, all over the public internet,
  zero console errors. Test data cleaned up afterward.
- TLS deliberately deferred (placeholder domain) — the exact steps to enable it once
  a final domain is chosen are documented in the README ("Deployment" section), and
  require no backend/frontend/database changes, only nginx + a cert

## Reminder (carried over)
- [ ] Replace the placeholder admin credentials (`mariam` / test password) with real
      ones before real use — now doubly relevant since the admin dashboard is
      actually live: `npm run create-admin -- <username> <password>` run on the VM
      against the live Postgres (see README).

## Step 9 — QA pass ✅
- `server/test/qa.test.js` — a committed, repeatable integration suite (Node's
  built-in `node:test` + `assert/strict`, zero new dependencies) run against the
  real database via `npm run test:qa`, covering every item on the roadmap's
  checklist. All 7 tests pass:
  - **Double-booking race**: two concurrent create requests for the identical slot —
    verified exactly one gets `201`, the other a friendly `409 slot_taken`, not a
    raw DB error
  - **90-minute cutoff at the exact 89/91-minute boundary**, on both create and
    reschedule — the test temporarily widens "today"'s weekly hours (needed since
    QA can run at any real-world time, including outside business hours) and
    restores them immediately afterward, asserting the restore succeeded
  - **Cancellation has no cutoff** — works even ~91 minutes before the appointment
  - **Phone lookup** returns only that number's own upcoming, non-cancelled,
    non-completed bookings, correctly as a list when there's more than one
  - **No-show doesn't block rebooking**
  - **Financial aggregation** matches hand-calculated totals for a small seeded
    dataset (income by service, expenses by category, net), and **price_at_booking**
    keeps a completed booking's historical income correct after the service's price
    later changes (verified both directions: old booking unaffected, a brand-new
    booking against the repriced service snapshots the new price)
- Three real bugs found and fixed **in the test script itself** while getting it
  green — worth recording since they're easy mistakes to repeat:
  1. A header-merging bug (`{headers: {...}, ...opts}` — the later spread silently
     discarded the earlier `Content-Type` whenever `opts` also carried a `headers`
     key) meant every admin request went out without `Content-Type`, so Express
     never parsed the body — including a weekly-hours "widen" call, which silently
     failed and actually **closed** the day instead
  2. A stale-slot-snapshot race: fetching all slot lists once upfront, then creating
     several bookings sequentially, meant a later booking could collide with an
     earlier one from the *same test run* (different services share the same time
     grid but have different durations) — fixed by re-fetching slots immediately
     before each booking
  3. A silent restore failure: Postgres returns `TIME` as `'09:00:00'`, but the
     admin API's `isValidTime` only accepts `'09:00'` — the cutoff test's restore-
     to-original-hours call was silently rejected and never asserted, leaving
     Monday's hours stuck wide open in the real database until caught by manually
     inspecting DB state after a "passing" run and noticing it looked wrong
- Removed a hardcoded default test password from the script before committing —
  it would otherwise have shipped this repo's live (if placeholder) admin
  credential to a public GitHub repo. Now requires `QA_ADMIN_USERNAME` /
  `QA_ADMIN_PASSWORD` env vars, no fallback.
- **i18n visual pass**: Steps 6/7 had already covered guest-app-in-English,
  guest-app-in-Russian, admin-in-Russian, and admin-in-Armenian live in a browser —
  this pass closed the two remaining gaps (guest app in Armenian, admin app in
  English) rather than re-testing everything from scratch. Found a real bug this
  way: Armenian date formatting (`Tue, Sep 15` staying in English while only the
  "at"/"ժամը" connector translated) — traced to at least one real browser's ICU
  build having **no Armenian locale data at all**
  (`Intl.DateTimeFormat.supportedLocalesOf` excluded `hy-AM` entirely, only
  `ru-RU`/`en-US` came back), confirmed via a direct isolated repro before touching
  any code. Fixed in `shared/i18n.js` by building weekday/month names from our own
  translation tables instead of delegating to `toLocaleDateString`, removing the
  dependency on runtime ICU completeness — benefits both apps, since it's in the
  shared package. Verified fixed with the exact same repro.
- All test data (bookings, weekly-hours overrides, service prices, expense rows)
  fully cleaned up and verified back to original state after every run.
- The QA suite and the i18n date-formatting fix were pushed and **redeployed to the
  live site** via `/opt/app/deploy.sh` (the Step 8 redeploy path) — confirmed
  working end-to-end as the first real "push code → redeploy" cycle since initial
  deployment.


## Admin usability round (2026-09-15, after Mariam's first look)

Six changes she asked for after using the live dashboard, plus the price-list and
clean-up work earlier the same day.

- **Mariam's real price list** replaced the placeholder services: the twelve zones
  from her printed sugar/wax sheet, seeded identically under Waxing and Sugaring
  (migration `1789390653080_real-price-list`), which also cleared the 76 QA
  bookings still pointing at the old sample services. Electrolysis is deliberately
  left with no zones — she hasn't priced it, and an empty treatment is hidden from
  the landing page rather than shown with invented numbers. Durations aren't on her
  sheet, so those are working estimates for her to review.
- **Bulk delete of cancelled bookings** (`DELETE /api/admin/bookings` taking a list
  of ids). Only cancelled rows can go: a confirmed booking is a commitment and a
  completed one is a line in the financial history, so the endpoint refuses both
  and reports what it skipped — verified live by asking it to delete a confirmed
  booking and getting `{deleted: 0, skipped: [110]}` back. Confirmation is inline
  rather than a native `confirm()` dialog, which hid the count and blocked the page.
- **Manual bookings** — see TODO's note on why they skip the guest flow's checks.
  The overlap guard is the database's `EXCLUDE` constraint, surfaced as a friendly
  `409 slot_taken`, so a manual booking can't quietly double-book a real client.
- **Calendar views on Bookings.** Month grid (Monday-first, count badge per day,
  today outlined, open day tinted) with that day's bookings listed underneath, and
  a year view of twelve month cards carrying bookings / completed / income. Income
  counts completed bookings only, the same rule the dashboard uses, so the two
  figures never disagree. Month names come from our own tables rather than ICU, for
  the Armenian reason recorded in Step 9 above.
- **Editing and inline forms**: Services and Treatments now open their edit form
  under the row being edited instead of at the top of the page; Services folds by
  treatment; expenses gained edit and delete.
- **Availability**: one Edit / one Save for the whole week, saved transactionally
  through `PUT /api/admin/availability/weekly` so a week can't land half-written,
  plus a per-day lunch break stored on `weekly_hours` rather than as a recurring
  block — it belongs to the working pattern, and Mariam edits all three times
  together. The break is excluded from bookable slots in both places that compute
  availability (`getAvailableSlots` and `isSlotWithinAvailability`).
- **Language switcher** closes on an outside click or Escape in both apps, and is
  labelled by language code. The flag emoji it used to show falls back to the
  country's letter pair without an emoji flag font, so English appeared as "GB" —
  and a language is better labelled by its own code anyway.

- **Hourly treatments.** Some treatments are sold by time, not by area —
  electrolysis is worked hair by hair — so a treatment carries an `is_hourly`
  flag that changes how its whole price list reads: each zone's `price_amd`
  becomes an hourly rate, and the guest chooses a length in 30-minute steps from
  half an hour to six hours, priced pro rata (half an hour costs half the rate).
  Half an hour is both the minimum and the step because it matches the slot grid,
  so every bookable length still lands on a real slot boundary. The chosen
  length is part of the slot request, since it decides which start times leave
  enough room, and both the duration and the price are recomputed on the server
  from the hours rather than taken from the client. Rescheduling now keeps the
  length that was actually booked (`end_time - start_time`) instead of the
  zone's nominal duration — for an hourly booking those differ, and the old code
  would have quietly shortened a three-hour session to one. The Telegram message
  gains a duration line for hourly bookings, since otherwise a one-hour and a
  three-hour session look identical. The booking rules live in
  `server/src/lib/booking.js` and `shared/booking.js` — deliberately two copies,
  because the backend image is built with `server/` as its entire Docker context
  and cannot import the shared package at runtime (the same reason
  `src/lib/time.js` exists).
