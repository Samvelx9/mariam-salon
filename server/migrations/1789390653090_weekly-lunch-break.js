export const shorthands = undefined;

// A daily lunch break, stored on the weekday rather than as a recurring
// availability_block: it belongs to the working pattern the same way the open
// and close times do, and Mariam edits all three together on one screen.
// Both columns null means no break that day.
export const up = (pgm) => {
  pgm.addColumns('weekly_hours', {
    lunch_start: { type: 'time', notNull: false },
    lunch_end: { type: 'time', notNull: false },
  });

  pgm.addConstraint('weekly_hours', 'weekly_hours_lunch_pair', {
    check: '(lunch_start IS NULL AND lunch_end IS NULL) OR (lunch_start IS NOT NULL AND lunch_end IS NOT NULL AND lunch_start < lunch_end)',
  });

  // A break outside the working window would silently do nothing, so it's
  // rejected rather than stored.
  pgm.addConstraint('weekly_hours', 'weekly_hours_lunch_within_day', {
    check: 'lunch_start IS NULL OR (is_open AND lunch_start >= start_time AND lunch_end <= end_time)',
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('weekly_hours', 'weekly_hours_lunch_within_day');
  pgm.dropConstraint('weekly_hours', 'weekly_hours_lunch_pair');
  pgm.dropColumns('weekly_hours', ['lunch_start', 'lunch_end']);
};
