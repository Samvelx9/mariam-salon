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
