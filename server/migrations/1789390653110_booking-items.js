export const shorthands = undefined;

// A visit can cover several zones — underarms and full legs and an upper lip,
// booked as one appointment — so the zones move off the booking into their own
// rows. The booking keeps the things that are true of the visit as a whole: when
// it starts, when it ends, who it's for, and what the whole thing costs.
//
// Each item snapshots its own price and duration for the same reason
// `price_at_booking` always did: re-pricing a zone next month must not rewrite
// what a client paid last month.
export const up = (pgm) => {
  pgm.createTable('booking_items', {
    id: 'id',
    booking_id: {
      type: 'integer',
      notNull: true,
      references: 'bookings',
      onDelete: 'CASCADE',
    },
    service_id: {
      type: 'integer',
      notNull: true,
      references: 'services',
      onDelete: 'RESTRICT',
    },
    duration_minutes: { type: 'integer', notNull: true },
    price_at_booking: { type: 'integer', notNull: true },
    sort_order: { type: 'integer', notNull: true, default: 0 },
  });

  pgm.addConstraint('booking_items', 'booking_items_duration_positive', {
    check: 'duration_minutes > 0',
  });
  pgm.addConstraint('booking_items', 'booking_items_price_non_negative', {
    check: 'price_at_booking >= 0',
  });
  pgm.createIndex('booking_items', 'booking_id');
  pgm.createIndex('booking_items', 'service_id');

  // Every existing booking becomes a one-item booking. Its duration comes from
  // the booking itself rather than from the service, since an hourly booking's
  // length was the client's choice and the service's own figure would be wrong.
  pgm.sql(`
    INSERT INTO booking_items (booking_id, service_id, duration_minutes, price_at_booking, sort_order)
    SELECT b.id, b.service_id,
           GREATEST(1, (EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 60)::integer),
           b.price_at_booking,
           1
    FROM bookings b
  `);

  // The column would otherwise be a second, quietly diverging answer to "which
  // zones is this booking for".
  pgm.dropColumns('bookings', ['service_id']);
};

export const down = (pgm) => {
  pgm.addColumns('bookings', {
    service_id: { type: 'integer', references: 'services', onDelete: 'RESTRICT' },
  });
  // Only the first zone survives going back — the shape simply can't hold more.
  pgm.sql(`
    UPDATE bookings b SET service_id = (
      SELECT i.service_id FROM booking_items i
      WHERE i.booking_id = b.id ORDER BY i.sort_order, i.id LIMIT 1
    )
  `);
  pgm.sql('DELETE FROM bookings WHERE service_id IS NULL');
  pgm.alterColumn('bookings', 'service_id', { notNull: true });
  pgm.dropTable('booking_items');
};
