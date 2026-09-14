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
