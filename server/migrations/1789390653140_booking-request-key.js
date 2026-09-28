export const shorthands = undefined;

// The random id the guest page sends with a booking, so pressing confirm again
// after a lost answer returns the booking already made instead of being refused
// by it — see POST /api/bookings in server/src/routes/guest.js. Null for
// bookings Mariam enters herself and for everything made before this.
export const up = (pgm) => {
  pgm.addColumn('bookings', { request_key: { type: 'text', unique: true } });
};

export const down = (pgm) => {
  pgm.dropColumn('bookings', 'request_key');
};
