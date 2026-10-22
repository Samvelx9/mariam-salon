export const shorthands = undefined;

// When guests may book, set by Mariam on the Availability screen:
//
// - `min_notice_minutes`: how far ahead a guest must book. No slot closer than
//   this to now is offered, and a booking or reschedule into it is refused.
//   90 minutes was the fixed rule before, so it's the default. 0 means "any
//   time still ahead". Capped at two days.
// - `booking_window_days`: how many days ahead guests can book, counting
//   today. The slot picker shows this many days, and a booking or reschedule
//   beyond the last one is refused. 7 was the fixed window before. Always more
//   than the longest notice, so the two can't leave nothing bookable.
//
// Bookings Mariam enters herself ignore both, as they ignore opening hours.
export const up = (pgm) => {
  pgm.addColumns('salon_profile', {
    min_notice_minutes: { type: 'integer', notNull: true, default: 90 },
    booking_window_days: { type: 'integer', notNull: true, default: 7 },
  });
  pgm.addConstraint('salon_profile', 'salon_profile_min_notice_range', {
    check: 'min_notice_minutes BETWEEN 0 AND 2880',
  });
  pgm.addConstraint('salon_profile', 'salon_profile_booking_window_range', {
    check: 'booking_window_days BETWEEN 7 AND 90',
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('salon_profile', 'salon_profile_booking_window_range');
  pgm.dropConstraint('salon_profile', 'salon_profile_min_notice_range');
  pgm.dropColumns('salon_profile', ['min_notice_minutes', 'booking_window_days']);
};
