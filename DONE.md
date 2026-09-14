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
