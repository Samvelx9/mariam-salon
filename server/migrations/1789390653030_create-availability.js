export const shorthands = undefined;

export const up = (pgm) => {
  // One row per weekday (0 = Sunday .. 6 = Saturday). is_open = false means closed
  // that day; start_time/end_time define the working window when open.
  pgm.createTable('weekly_hours', {
    day_of_week: { type: 'smallint', primaryKey: true },
    is_open: { type: 'boolean', notNull: true, default: true },
    start_time: { type: 'time', notNull: false },
    end_time: { type: 'time', notNull: false },
  });

  pgm.addConstraint('weekly_hours', 'weekly_hours_day_of_week_range', {
    check: 'day_of_week BETWEEN 0 AND 6',
  });
  pgm.addConstraint('weekly_hours', 'weekly_hours_time_order', {
    check: 'NOT is_open OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)',
  });

  pgm.sql(`
    INSERT INTO weekly_hours (day_of_week, is_open, start_time, end_time)
    VALUES
      (0, false, NULL, NULL),
      (1, true, '09:00', '18:00'),
      (2, true, '09:00', '18:00'),
      (3, true, '09:00', '18:00'),
      (4, true, '09:00', '18:00'),
      (5, true, '09:00', '18:00'),
      (6, true, '09:00', '15:00')
  `);

  // Date-specific overrides: a fully blocked day (start_time/end_time both NULL),
  // or a blocked window within a day (e.g. lunch break, one-off closure).
  pgm.createTable('availability_blocks', {
    id: 'id',
    date: { type: 'date', notNull: true },
    start_time: { type: 'time', notNull: false },
    end_time: { type: 'time', notNull: false },
    note: { type: 'text', notNull: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('availability_blocks', 'availability_blocks_time_order', {
    check: '(start_time IS NULL AND end_time IS NULL) OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)',
  });

  pgm.createIndex('availability_blocks', 'date');
};

export const down = (pgm) => {
  pgm.dropTable('availability_blocks');
  pgm.dropTable('weekly_hours');
};
