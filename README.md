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
