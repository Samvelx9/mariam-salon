export const shorthands = undefined;

// Some treatments are sold by the hour rather than by the zone — electrolysis
// is worked hair by hair, so the honest unit is time, not area. The flag lives
// on the treatment because it describes how that whole price list is read: for
// an hourly treatment a zone's price_amd is its hourly rate, and the guest
// chooses how many hours to book.
export const up = (pgm) => {
  pgm.addColumns('service_categories', {
    is_hourly: { type: 'boolean', notNull: true, default: false },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('service_categories', ['is_hourly']);
};
