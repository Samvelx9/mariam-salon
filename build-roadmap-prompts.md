# Build roadmap — step-by-step prompts

This file is the execution plan for turning `salon-booking-app-plan.md` (the spec) and
`Main.dc.html` / `canvas.json` (the guest-app UX prototype, also published at
https://claude.ai/code/artifact/b01bc210-f9e8-49d9-a6f2-30e9ae9b9d26) into the real
application.

**How to use this**: work through the steps in order, in a Claude Code session opened in
this repo. Paste each step's prompt as-is (it already has the context a fresh session
needs — the plan file, the prototype, and the decisions made so far). Check a step off
once its output is merged and working before moving to the next one, since later steps
assume earlier ones exist.

- [ ] Step 1 — Project scaffolding
- [ ] Step 2 — Database schema & migrations
- [ ] Step 3 — Guest-facing API
- [ ] Step 4 — Admin API
- [ ] Step 5 — Telegram notifications
- [ ] Step 6 — Guest-facing frontend (port from the prototype)
- [ ] Step 7 — Admin dashboard frontend
- [ ] Step 8 — Deployment
- [ ] Step 9 — QA pass

---

## Step 1 — Project scaffolding

**Goal:** a running skeleton with a backend, a Postgres connection, and two frontend
entry points (guest app, admin dashboard).

**Prompt:**
```
Read salon-booking-app-plan.md in this repo — it's the full spec for a salon booking
app. Scaffold the project as described in its "Tech stack" section: a Node.js/Express
(or Python/FastAPI — pick one and say why) backend, a PostgreSQL database, and a
frontend split into two apps: a guest-facing booking app and an admin dashboard (plain
React, or lightweight server-rendered pages — match the stack choice). Set up local dev
tooling (package manager, run scripts, .env handling), a Postgres connection with a
migration tool, and a basic health-check endpoint. Don't build any features yet — just
a clean, runnable skeleton.
```

## Step 2 — Database schema & migrations

**Goal:** the data model from the plan, with the double-booking safeguard enforced at
the database level.

**Prompt:**
```
Read the "Data model" and "Double-booking prevention" sections of
salon-booking-app-plan.md. Write Postgres migrations for:
- services (name, duration, price, active flag)
- availability (weekly working hours + date-specific blocks)
- bookings (service_id, start/end time, customer_name, customer_phone, status:
  confirmed | completed | cancelled | no_show, price_at_booking — a snapshot of the
  service price at booking time so historical income stays accurate if prices change
  later)
- expenses (category, description, amount, date)
- a single-row admin_user table (username, password hash)

Enable the btree_gist Postgres extension and add an EXCLUDE constraint on bookings'
time range (scoped to non-cancelled bookings) so overlapping bookings are physically
rejected at the database level, regardless of app-layer bugs or race conditions. Seed
the services table with these five services (prices in AMD):
Brazilian Wax (30 min, 12000), Full Leg Wax (45 min, 15000), Underarm Wax (15 min,
5000), Eyebrow Shaping (15 min, 4000), Sugaring — Bikini (30 min, 10000).
```

## Step 3 — Guest-facing API

**Goal:** every endpoint the guest app needs, matching the flow already prototyped.

**Prompt:**
```
Read salon-booking-app-plan.md (especially "Guest-facing flow", "Double-booking
prevention", "Booking edit / reschedule flow" with its cutoff windows) and look at
Main.dc.html in this repo, which is a clickable prototype of the guest flow — its
Component.renderVals() logic (SERVICES, SLOTS_BY_DAY, the 90-minute same-day filter,
the manage/lookup/reschedule/cancel state machine) is the reference behavior to
reproduce for real, against the database instead of mock arrays.

Build the guest-facing API:
- GET active services (name, duration, price)
- GET available slots for a service, across the next 7 days — computed from
  availability minus existing non-cancelled bookings minus a 90-minute-from-now cutoff
  for today
- POST create a booking — catch the EXCLUDE constraint violation and return a friendly
  409 ("that slot was just taken") rather than a generic error
- POST look up upcoming bookings by phone number (non-cancelled, non-completed, in the
  future) — returns a list, since a phone number can have more than one upcoming
  booking
- POST cancel a booking by id — no cutoff, always allowed
- POST reschedule a booking to a new slot — same 90-minute cutoff and same
  slot-availability check as creating a new booking

On every successful create/cancel, this API should trigger the Telegram notification
from Step 5 (stub it as a no-op for now if that step isn't built yet).
```

## Step 4 — Admin API

**Goal:** everything Mariam needs: auth, services, availability, bookings, financials.

**Prompt:**
```
Read the "Admin-facing flow", "Admin login", "No-show handling", and "Financial
aggregations" sections of salon-booking-app-plan.md. Build the admin API:
- Username/password login (the single admin_user row), session or JWT-based auth
  guarding everything below
- Services CRUD (add/edit/delete, set price + duration, active flag)
- Availability management: set weekly working hours, block off specific dates
- Bookings: list/view on a calendar, manually change status (completed / cancelled /
  no_show) — all status changes are manual, and marking a no-show must not affect that
  customer's ability to book again
- Expenses: create/list (category, description, amount, date), with an endpoint that
  returns previously-used category/product names for autocomplete
- Financial aggregation, filterable by period: income (sum of price_at_booking for
  completed bookings, broken down by service), expenses (broken down by category), and
  net (income − expenses). Currency is AMD throughout.
```

## Step 5 — Telegram notifications

**Goal:** Mariam gets pinged on every new booking and every cancellation.

**Prompt:**
```
Set up a Telegram bot (via the Telegram Bot API) that messages Mariam on every new
booking and every cancellation, as described in salon-booking-app-plan.md under
"Notifications". Wire it into the booking-create and booking-cancel/reschedule-cancel
paths from Step 3. Document (in a README, not in code comments) the one-time setup
steps needed on Mariam's side: creating the bot via @BotFather, getting the bot token,
and getting her chat ID so the backend knows where to send messages. Store the token
and chat ID as environment config, never hardcoded.
```

## Step 6 — Guest-facing frontend (port from the prototype)

**Goal:** the real guest app, matching the prototype's UX and copy, wired to the real API.

**Prompt:**
```
Main.dc.html in this repo (also live at
https://claude.ai/code/artifact/b01bc210-f9e8-49d9-a6f2-30e9ae9b9d26) is a clickable
prototype of the full guest-facing flow and is the source of truth for this step's UX,
visual design (soft botanical palette: sage/terracotta/cream, Newsreader + Karla
fonts), copy, and screen-by-screen logic. Its screens/state machine:
services → live slot picker → details form → confirmation (with fixed Reschedule /
Cancel booking buttons, no private link) → "Already booked?" phone lookup → list of
all upcoming bookings for that number → manage one booking (Reschedule / Cancel) →
reschedule picker (reuses the slot picker) → cancel confirmation → cancelled.

Build this as the real guest-facing frontend, replacing the prototype's mock
SERVICES/SLOTS_BY_DAY/MOCK_UPCOMING_BOOKINGS arrays with real calls to the Step 3 API.
Port the STRINGS dictionary (in Main.dc.html's <script data-dc-script>) into a real
i18n setup for Armenian, Russian, and English, Russian as the default, with the same
flag-button switcher (🇦🇲 / 🇷🇺 / 🇬🇧) present on every screen. Keep the same locale-aware
date/price formatting approach (Intl.DateTimeFormat / toLocaleString per language).
```

## Step 7 — Admin dashboard frontend

**Goal:** Mariam's dashboard, with the same localization pattern.

**Prompt:**
```
Build the admin dashboard frontend against the Step 4 API, covering: login, services
management, availability management (weekly hours + date blocks), a bookings calendar
with manual status changes, and the financial dashboard (metric cards for income /
expenses / net / bookings completed, income-by-service and expenses-by-category
breakdowns, a recent-expenses list with quick-add and category autocomplete — per the
"Financial aggregations" section of salon-booking-app-plan.md; a dashboard mockup for
this was made earlier, ask if it should be tracked down and matched pixel-for-pixel).

Apply the same localization pattern as the guest app (Step 6): Armenian, Russian,
English, Russian default, a flag-button switcher on every screen. Reuse shared
translation strings where the copy overlaps (e.g. service names, currency formatting)
rather than re-translating from scratch.
```

## Step 8 — Deployment

**Goal:** live on Mariam's existing infrastructure.

**Prompt:**
```
Deploy the backend, both frontends, and PostgreSQL to the existing Oracle Cloud VM
mentioned in salon-booking-app-plan.md's "Tech stack" section. Set up a process
manager (pm2 / systemd, matching the stack choice from Step 1), a reverse proxy with
TLS for the public guest app and the admin dashboard, and environment-based secrets
for the database, admin auth, and the Telegram bot token/chat ID from Step 5. Document
the deployment steps and how to redeploy after a code change.
```

## Step 9 — QA pass

**Goal:** confidence in the parts that are easy to get subtly wrong.

**Prompt:**
```
Write and run tests (or a manual test script if the stack makes that more practical)
covering:
- Two guests racing for the same slot — confirm the Postgres EXCLUDE constraint
  rejects the second one and the guest sees the friendly "that slot was just taken"
  message, not a raw error
- The 90-minute cutoff on new bookings and on reschedules, right at the boundary
  (89 vs. 91 minutes from now)
- Cancellation has no cutoff — works even minutes before the appointment
- Phone lookup returns only that number's own upcoming (non-cancelled, non-completed)
  bookings, and correctly shows a list when there's more than one
- A no-show booking doesn't block that phone number from booking again
- Language switching updates all copy, service names, and date/price formatting
  correctly in all three languages, on both the guest app and the admin dashboard
- Financial aggregation numbers (income by service, expenses by category, net) match
  hand-calculated totals for a small seeded dataset, and price_at_booking keeps old
  bookings' income correct after a service's price changes
```
