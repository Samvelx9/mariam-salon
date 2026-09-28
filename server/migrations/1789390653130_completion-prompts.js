export const shorthands = undefined;

// When Mariam was last asked on Telegram whether a visit happened — see
// server/src/services/completionPrompts.js. Visits that had already ended when
// this shipped are marked as asked, so switching the feature on doesn't send
// her a question about every past booking still sitting at `confirmed`.
export const up = (pgm) => {
  pgm.addColumn('bookings', { completion_asked_at: { type: 'timestamptz' } });
  pgm.sql(`UPDATE bookings SET completion_asked_at = now() WHERE end_time <= now()`);
};

export const down = (pgm) => {
  pgm.dropColumn('bookings', 'completion_asked_at');
};
