export const shorthands = undefined;

// What the guest side of notifications needs on each booking — see
// server/src/services/guestNotifications.js.
//
// - `guest_token`: a random secret handed only to the guest who made the
//   booking. It names the booking in the calendar-file URL and in the Telegram
//   link, so neither can be reached by guessing a booking id. Null for bookings
//   Mariam enters herself and for everything made before this.
// - `guest_lang`: the language the guest booked in, which their messages use.
// - `guest_chat_id` / `guest_linked_at`: the Telegram chat that pressed Start
//   on that link, and when.
// - `day_reminder_for` / `soon_reminder_for`: the start time each reminder was
//   sent for. A visit moved after a reminder went out no longer matches, so it
//   is reminded again for its new time.
// - `guest_confirmed_at`: when the guest tapped "I'll come" on a reminder.
export const up = (pgm) => {
  pgm.addColumns('bookings', {
    guest_token: { type: 'text', unique: true },
    guest_lang: { type: 'text' },
    guest_chat_id: { type: 'bigint' },
    guest_linked_at: { type: 'timestamptz' },
    day_reminder_for: { type: 'timestamptz' },
    soon_reminder_for: { type: 'timestamptz' },
    guest_confirmed_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('bookings', 'bookings_guest_lang', {
    check: "guest_lang IN ('hy', 'ru', 'en')",
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('bookings', 'bookings_guest_lang');
  pgm.dropColumns('bookings', [
    'guest_token',
    'guest_lang',
    'guest_chat_id',
    'guest_linked_at',
    'day_reminder_for',
    'soon_reminder_for',
    'guest_confirmed_at',
  ]);
};
