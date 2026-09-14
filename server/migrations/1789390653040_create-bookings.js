export const shorthands = undefined;

export const up = (pgm) => {
  pgm.createExtension('btree_gist', { ifNotExists: true });

  pgm.createType('booking_status', ['confirmed', 'completed', 'cancelled', 'no_show']);

  pgm.createTable('bookings', {
    id: 'id',
    service_id: {
      type: 'integer',
      notNull: true,
      references: 'services',
      onDelete: 'RESTRICT',
    },
    start_time: { type: 'timestamptz', notNull: true },
    end_time: { type: 'timestamptz', notNull: true },
    customer_name: { type: 'text', notNull: true },
    customer_phone: { type: 'text', notNull: true },
    status: { type: 'booking_status', notNull: true, default: 'confirmed' },
    // Snapshot of the service price at booking time, so historical income stays
    // correct if the service's price changes later.
    price_at_booking: { type: 'integer', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('bookings', 'bookings_time_order', {
    check: 'start_time < end_time',
  });

  // Only one non-cancelled booking may occupy a given moment in time — physically
  // rejected at the database level regardless of app-layer bugs or race conditions.
  pgm.addConstraint('bookings', 'bookings_no_overlap', {
    exclude:
      "USING gist (tstzrange(start_time, end_time, '[)') WITH &&) WHERE (status <> 'cancelled')",
  });

  pgm.createIndex('bookings', 'customer_phone');
  pgm.createIndex('bookings', 'start_time');
};

export const down = (pgm) => {
  pgm.dropTable('bookings');
  pgm.dropType('booking_status');
};
