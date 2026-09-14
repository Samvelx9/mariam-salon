# Mariam's Salon Booking

See `salon-booking-app-plan.md` for the full spec and `build-roadmap-prompts.md` for the
step-by-step build plan.

## Structure

- `server/` — Node.js/Express API + PostgreSQL
- `client-guest/` — guest-facing booking app (React + Vite)
- `client-admin/` — admin dashboard (React + Vite)

## Local development

Requires Node.js 20+ and a running PostgreSQL instance.

```bash
npm install

# copy env template and fill in DATABASE_URL etc.
cp server/.env.example server/.env

npm run dev:server   # http://localhost:4000
npm run dev:guest    # http://localhost:5173
npm run dev:admin    # http://localhost:5174
```

`GET /api/health` reports server status and whether the database is reachable.
