# Salon booking app — plan summary

A custom booking web app for Mariam's waxing/sugaring salon: one admin user (Mariam), and customers book as anonymous guests — no accounts.

## Decided so far

### Roles
- **Admin (Mariam)** — logs in, manages services, availability, bookings, and finances
- **Guest (customer)** — no login. Picks a service, picks an open slot, submits name + phone

### Guest-facing flow
1. View list of services (name, duration, price)
2. Pick an open slot from a live calendar (only real availability shown)
3. Fill in name + phone
4. Get instant confirmation

### Admin-facing flow
1. Log in
2. Manage working hours and block off dates
3. Manage services (add/edit/delete, set price + duration)
4. View/edit/cancel bookings on a calendar
5. View financials (see below)

### Data model
- **services** — name, duration, price, active flag
- **availability** — weekly working hours + date-specific blocks
- **bookings** — service, start/end time, customer name, customer phone, status (confirmed / completed / cancelled / no_show), `price_at_booking` (snapshot of price at time of booking, so historical income stays accurate if prices change later)
- **expenses** — category, description, amount, date
- **admin user** — single row, login credentials

### Double-booking prevention
- Primary safeguard: a Postgres `EXCLUDE` constraint (via `btree_gist`) on the booking time range, so overlapping bookings are physically rejected at the database level regardless of app-layer bugs or race conditions
- App layer: catch the constraint violation and show the guest a friendly "that slot was just taken" message, then refresh available slots
- Slot list is fetched fresh (not cached) to reduce how often the race happens at all

### Notifications
- Telegram bot sends Mariam a message on every new booking and every cancellation (simpler to set up than SMS or WhatsApp Business API)

### Tech stack (kept simple, using tools already familiar)
- Backend: Node.js/Express or Python/FastAPI
- Database: PostgreSQL
- Frontend: plain React or lightweight server-rendered pages
- Hosting: an existing Oracle Cloud VM
- Notifications: Telegram Bot API

### Financial aggregations
- **Income**: sum of `price_at_booking` for completed bookings, filterable by period, broken down by service
- **Expenses**: manual entries (category, description, amount, date), filterable by period, broken down by category
- **Net**: income − expenses for the selected period
- **Expense categories**: free text, with autocomplete suggestions from previously used categories/product names so Mariam doesn't have to retype them each time
- **Currency**: AMD
- Dashboard mockup done: metric cards (income, expenses, net, bookings completed), income-by-service and expenses-by-category breakdowns, recent expenses list with quick-add

### Admin login
- Username/password

### Localization
- Both the guest-facing app and the admin dashboard are trilingual: **Armenian, Russian, English** — default language is **Russian** in both
- A flag button, always visible on every screen, shows the currently selected language; tapping it opens a small picker to switch (🇦🇲 / 🇷🇺 / 🇬🇧) — same mechanism in both apps
- Covers all copy, service names, weekday/date formatting, and number formatting — not just labels

### No-show handling
- All booking status changes (including marking a no-show) are done manually by the admin
- A no-show does not affect the customer's ability to make future bookings

### Booking edit / reschedule flow
- No private link. Guest self-service is done through fixed **Cancel** / **Reschedule** buttons — no URL to save, share, or lose
- Right after booking, those buttons appear directly on the confirmation screen
- To manage a booking later (e.g. the day before the appointment), the guest opens a "Manage your booking" entry point and looks it up by the phone number it was booked under — no account, no link
- The lookup returns *all* upcoming bookings on that phone number as a list; the guest picks the one they mean before seeing its Cancel/Reschedule buttons
- Cancelling asks for a confirmation step first ("This can't be undone")
- Reschedule reuses the same live slot picker as a new booking, scoped to that one booking
- **Cutoff windows**:
  - New bookings: a slot must be at least 90 minutes out to be booked
  - Reschedule: a new slot must be at least 90 minutes out (same rule, same slot picker)
  - Cancel: no cutoff — a guest can cancel at any time, right up to the appointment

## Still to review / decide

- **Full API endpoint list**: not yet designed
- **Guest booking screen UI**: mocked up as a clickable prototype (services → live slot picker → details → confirmation, plus a phone-lookup manage flow that lists all upcoming bookings on that number)
- **Repeat client tracking**: no customer accounts planned, but worth deciding if basic client history (by phone number) is wanted later
