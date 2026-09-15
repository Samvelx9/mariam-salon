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

## Guest landing page

The guest app opens on a landing page, not on a price list. It shows Mariam's photo,
her intro, her contacts, the salon address and opening hours, and the treatments she
offers — **waxing, sugaring and electrolysis**. Picking a treatment opens the price
list of zones inside it, and picking a zone starts the existing booking flow
(time → details → confirmation).

Two layers of content sit behind that page, both editable in the admin dashboard:

- **Landing page** tab (`salon_profile`, a single row) — displayed name, tagline, the
  "about" text, phone / WhatsApp / Telegram / Instagram / email, the salon address, a
  map link, and the photo. Every text field exists in Armenian, Russian and English;
  contacts and the map link are language-independent. Any field left blank simply
  hides its section on the landing page, so a half-filled profile still looks finished.
- **Treatments** tab (`service_categories`) — the treatments themselves. Each service
  belongs to exactly one treatment and acts as a *zone* within it (bikini, full leg,
  upper lip…), so a treatment's services are its price list. A treatment with no
  services is hidden from the landing page rather than shown as a dead end.

The photo is stored in Postgres (`salon_profile.photo_data`, at most 4 MB, JPEG/PNG/
WebP) rather than on disk — the API container has no persistent volume, and it's one
small image. It is served by `GET /api/profile/photo`, which the landing page requests
with the `photoVersion` returned by `GET /api/profile` so the response can be cached
for a day and still update the moment Mariam uploads a new one.

Public endpoints added for this: `GET /api/profile`, `GET /api/profile/photo`,
`GET /api/categories` (treatments with their zones nested) and `GET /api/hours`.
Admin endpoints: `GET/PUT /api/admin/profile`, `PUT/DELETE /api/admin/profile/photo`
and `GET/POST/PATCH/DELETE /api/admin/categories`.

## Telegram notifications setup

Mariam gets a Telegram message on every new booking and every cancellation. This is a
one-time setup on her side:

1. **Create the bot.** In Telegram, open a chat with **@BotFather**, send `/newbot`,
   and follow the prompts — a display name (shown as the sender, e.g. "Mariam's
   Studio Bookings") and a username ending in `bot` (must be globally unique, e.g.
   `mariam_studio_bookings_bot`). BotFather replies with a **bot token** — a string
   like `123456789:AAFewFWEFWEFwefwefwefw`.
2. **Start a chat with the bot.** Search for the bot's username and send it any
   message (or press Start). This step is required — a Telegram bot can't message a
   user who hasn't messaged it first.
3. **Find the chat ID.** With the bot token, call:
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
   The most recent message from step 2 appears in the response; its `message.chat.id`
   is the chat ID to notify (a plain private chat, so this is the same as the user's
   numeric Telegram ID).
4. **Set both values as environment config** — never hardcoded — in `server/.env`
   (see `server/.env.example`):
   ```
   TELEGRAM_BOT_TOKEN=<the token from step 1>
   TELEGRAM_CHAT_ID=<the chat id from step 3>
   ```

If either variable is unset, notifications are silently skipped (the booking flow
itself is never blocked by a Telegram failure or missing config).

## Deployment

Everything runs on one Oracle Cloud VM (`oracle-server`, Ubuntu 24.04), entirely via
Docker — no Node.js or npm installed on the host, only Docker/Compose. Three
independent Compose projects run there:

| Path | What | Notes |
|---|---|---|
| `/opt/postgres` | PostgreSQL 16 | bound to `127.0.0.1:5432` only, not public |
| `/opt/nginx-setup` | nginx reverse proxy + static files | public ports 80/443 |
| `/opt/app` | the backend API (Docker image built from `server/`) | internal only, no published port |

All three share one Docker network (`nginx-setup_web`) so containers can reach each
other by name (`postgres`, `backend`) without any of it being publicly exposed.

**Routing** (single domain, path-based — see below for why): nginx serves the guest
app's static build at `/`, the admin dashboard's static build at `/admin/`, and
reverse-proxies `/api/` to the backend container. Both frontends are built with
`VITE_API_URL=/api` (a **relative** path — see `client-guest/.env.production` /
`client-admin/.env.production`), so the compiled JS never hardcodes a domain.
**This means changing the production domain later needs only an nginx config change
+ new DNS + a new TLS cert — no frontend rebuild, since nothing in the built code
references the domain.**

The current live domain, `mariamik.info`, is a **placeholder** — DNS already points
it at the VM, so it's live and fully functional, but it is not necessarily the final
domain. TLS hasn't been enabled yet for the same reason (see below).

### Redeploying after a code change

Push to `main` on GitHub, then on the VM:

```bash
ssh oracle-server 'bash /opt/app/deploy.sh'
```

This pulls the latest commit into `/opt/app/repo`, rebuilds and restarts the backend
container, rebuilds both frontends (via a throwaway `node:20-alpine` container — the
host itself has no Node installed), and publishes the new static builds into nginx's
webroot. The script is idempotent and safe to re-run.

If only a database migration needs to run (no code/container change), see
`DONE.md`'s Step 2 notes for the pattern (a throwaway container running
`node-pg-migrate` against the `postgres` service, sourcing credentials from
`/opt/postgres/.env` entirely on the VM).

### Secrets

Nothing sensitive lives in this repo. On the VM:
- `/opt/postgres/.env` — Postgres superuser-ish app credentials (mode 600)
- `/opt/app/.env` — backend runtime config: `DATABASE_URL` (built from the above),
  `JWT_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (mode 600)

To rotate any of these, edit the relevant `.env` on the VM and restart the affected
container (`docker compose restart` in `/opt/postgres` or `/opt/app`).

### Enabling TLS once the final domain is chosen

1. Point the domain's DNS `A`/`AAAA` records at the VM's public IP.
2. Get a cert (Let's Encrypt via `certbot`, standalone mode — briefly stops nginx to
   bind port 80, so pick a quiet moment) and drop `fullchain.pem`/`privkey.pem` into
   `/opt/nginx-setup/ssl/` as `<domain>.crt` / `<domain>.key`.
3. Update `server_name` in `/opt/nginx-setup/conf.d/mariamik-http.info.conf` to the
   new domain, add the HTTPS `server` block (a template already exists commented out
   in that file) and an HTTP→HTTPS redirect.
4. `docker exec nginx nginx -t` to validate, then `nginx -s reload` (zero downtime).

No backend, frontend, or database changes are needed for this — confirmed when this
was scoped in Step 8, since none of the internal service-to-service calls (backend
↔ Postgres, backend ↔ Telegram) reference the domain at all, and the frontends only
ever call a relative `/api` path.

### Initial VM setup (already done — kept here for disaster recovery)

See `DONE.md` for the full history. In short: Docker/Compose were pre-installed;
Postgres was provisioned via Compose with `btree_gist` enabled (Step 1); the admin
account was created via `server/scripts/create-admin.js` (Step 4, **replace the
placeholder credentials before real use**); this repo was cloned to `/opt/app/repo`,
`/opt/app/.env` and `/opt/app/docker-compose.yml` were created, the backend image was
built, and nginx's config was updated to add the `/api/` and `/admin/` routes (Step 8).
