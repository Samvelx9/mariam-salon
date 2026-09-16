# Working agreements for this repo

## Ship every change end to end

Finishing a change here means **committed, pushed to GitHub, and deployed** — not
just working locally. Unless the user says otherwise in the same request, always
finish the cycle:

```bash
git add -A
git commit -m "..."                        # attribution lines per the session reminder
git push origin main                       # main is the deploy branch; do not branch
ssh oracle-server 'bash /opt/app/deploy.sh'
```

Then verify against the real site, not just locally:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://mariambeauty.skin/
curl -s -o /dev/null -w '%{http_code}\n' https://mariambeauty.skin/admin/
curl -s https://mariambeauty.skin/api/health
ssh oracle-server 'sudo git -C /opt/app/repo rev-parse HEAD'   # must equal the pushed commit
```

Do not stop at "it builds" or "it's committed" and hand the rest back. If a step is
genuinely blocked (missing credential, denied permission), say exactly which step and
why — don't silently skip it and report success.

### Push straight to `main`

`deploy.sh` does `git pull` on `main` in `/opt/app/repo`, so a feature branch never
reaches the server. Commit to `main`.

### Migrations are not part of `deploy.sh`

`deploy.sh` rebuilds the backend container and both frontends; it does **not** run
migrations. Run those separately, against the VM's Postgres through an SSH tunnel:

```bash
ssh -o ExitOnForwardFailure=yes -f -N -L 5433:127.0.0.1:5432 oracle-server
cd server && npm run migrate:up
```

Order matters. A migration that makes a column `NOT NULL` breaks the *old* running
code until the new backend is deployed, so migrate and deploy in the same sitting.

## Verify in a real browser

Both frontends have been checked live in Chrome at every step, and that's the bar:
load the page, walk the flow, read the console. Ignore hook-order errors that appear
immediately after a `[vite] hot updated` line — those are HMR artifacts. Re-load the
page and confirm the console is clean before calling it verified.

## Secrets

Never read `DEPLOYMENT-SECRETS.md`, `server/.env`, or any credential into a command,
a file, or the transcript. All of them are gitignored and must stay that way. If a
task seems to need one (logging into the live admin, running the QA suite), ask the
user to do that step themselves rather than routing the secret through a tool call.

The QA suite needs admin credentials as env vars, so the user runs it:

```bash
QA_ADMIN_USERNAME=... QA_ADMIN_PASSWORD=... npm run test:qa   # from server/
```

Unset `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` first so QA runs don't message
Mariam, and delete the two stray `expenses` rows each run leaves behind.

## Don't invent Mariam's content

Service names, prices, the about text, the address and the contacts are hers. Test
data is fine while working, but clear it before finishing — never leave invented
phone numbers, addresses or prices on a live site. Say plainly in the summary what
is still placeholder and where she fills it in.

## Content model

Guests land on a page about Mariam, pick a **treatment** (`service_categories`:
waxing, sugaring, electrolysis), then a **zone** within it (`services`, each belonging
to exactly one treatment), then a time. So a treatment's services *are* its price
list, and a service name should read as a zone ("Upper lip"), not repeat the
treatment ("Electrolysis — upper lip"). `salon_profile` is a single row holding
everything else the landing page shows. See README "Guest landing page".
