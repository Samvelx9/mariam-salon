export const shorthands = undefined;

// What a client is allergic to, written down by Mariam on a booking. A client
// is told apart by phone number (there is no clients table), so their
// allergies are whatever their latest booking that mentions any says; the
// booking form suggests that on their next visit. Never shown to guests.
export const up = (pgm) => {
  pgm.addColumns('bookings', { allergies: { type: 'text' } });
};

export const down = (pgm) => {
  pgm.dropColumns('bookings', ['allergies']);
};
