import { pool } from '../db.js';
import { bookingShape, isValidDuration } from '../lib/booking.js';

// A booking's zones come back nested, so every screen that lists bookings can
// show what the visit actually covers without a second round trip. The lateral
// join keeps one row per booking however many zones it has.
const ITEMS_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT json_agg(
             json_build_object(
               'service_id', i.service_id,
               'slug', s.slug,
               'name_en', s.name_en,
               'name_ru', s.name_ru,
               'name_hy', s.name_hy,
               'duration_minutes', i.duration_minutes,
               'price_at_booking', i.price_at_booking
             ) ORDER BY i.sort_order, i.id
           ) AS items
    FROM booking_items i
    JOIN services s ON s.id = i.service_id
    WHERE i.booking_id = b.id
  ) it ON true`;

const BOOKING_FIELDS = `b.id, b.start_time, b.end_time, b.customer_name, b.customer_phone,
       b.status, b.price_at_booking, COALESCE(it.items, '[]'::json) AS items`;

// `where` is trusted SQL written here in the routes, never anything from a
// request; values always arrive as parameters.
export function bookingsQuery({ where = '', orderBy = 'b.start_time ASC', extraFields = '' } = {}) {
  return `
    SELECT ${BOOKING_FIELDS}${extraFields ? `, ${extraFields}` : ''}
    FROM bookings b
    ${ITEMS_LATERAL}
    ${where ? `WHERE ${where}` : ''}
    ORDER BY ${orderBy}`;
}

export async function getBookingWithItems(id) {
  const { rows } = await pool.query(bookingsQuery({ where: 'b.id = $1' }), [id]);
  return rows[0] || null;
}

// Turns what a client asked for into what will actually be stored: the zones in
// the order they were chosen, each with its own duration and price, plus the
// totals the booking itself carries. Everything is priced from the database
// rather than from the request, so a client can't name its own price.
//
// `requireActive` is the difference between a guest booking (only zones on sale)
// and one Mariam enters herself (anything in the price list, including a zone
// she has since deactivated).
export async function resolveItems(rawItems, { requireActive = true } = {}) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { error: 'missing_items' };
  }
  if (rawItems.length > 12) {
    return { error: 'too_many_items' };
  }

  const ids = rawItems.map((item) => Number(item?.serviceId));
  if (ids.some((id) => !Number.isInteger(id))) {
    return { error: 'invalid_service_id' };
  }
  if (new Set(ids).size !== ids.length) {
    return { error: 'duplicate_service' };
  }

  const { rows } = await pool.query(
    `SELECT s.id, s.duration_minutes, s.price_amd, s.is_active, c.is_hourly
     FROM services s
     JOIN service_categories c ON c.id = s.category_id
     WHERE s.id = ANY($1::int[])`,
    [ids]
  );
  const byId = new Map(rows.map((row) => [row.id, row]));

  const items = [];
  let totalMinutes = 0;
  let totalPrice = 0;

  for (const [index, raw] of rawItems.entries()) {
    const service = byId.get(Number(raw.serviceId));
    if (!service || (requireActive && !service.is_active)) {
      return { error: 'service_not_found' };
    }

    // Only an hourly zone takes a length from the client; a fixed one is as
    // long as it is, whatever the request says.
    let requested = service.duration_minutes;
    if (service.is_hourly) {
      requested = raw.durationMinutes === undefined ? 30 : Number(raw.durationMinutes);
      if (!isValidDuration(requested)) {
        return { error: 'invalid_duration' };
      }
    }

    const { durationMinutes, price } = bookingShape(service, requested);
    items.push({
      service_id: service.id,
      duration_minutes: durationMinutes,
      price_at_booking: price,
      sort_order: index + 1,
    });
    totalMinutes += durationMinutes;
    totalPrice += price;
  }

  return { items, totalMinutes, totalPrice };
}

// The booking and its zones go in together: a booking with no zones would be a
// row nothing can describe, and the overlap constraint may still reject the
// whole thing.
export async function insertBookingWithItems(
  client,
  { startTime, endTime, customerName, customerPhone, status, totalPrice, items }
) {
  const { rows } = await client.query(
    `INSERT INTO bookings (start_time, end_time, customer_name, customer_phone, status, price_at_booking)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'confirmed'), $6)
     RETURNING id`,
    [startTime, endTime, customerName, customerPhone, status ?? null, totalPrice]
  );
  const bookingId = rows[0].id;
  await replaceItems(client, bookingId, items);
  return bookingId;
}

export async function replaceItems(client, bookingId, items) {
  await client.query('DELETE FROM booking_items WHERE booking_id = $1', [bookingId]);
  for (const item of items) {
    await client.query(
      `INSERT INTO booking_items (booking_id, service_id, duration_minutes, price_at_booking, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [bookingId, item.service_id, item.duration_minutes, item.price_at_booking, item.sort_order]
    );
  }
}

// What to call a booking in one line — the zone for a single-zone visit, and
// the first zone plus a count for a longer one.
export function bookingLabel(booking, lang = 'ru') {
  const items = booking.items ?? [];
  if (items.length === 0) return '';
  const first = items[0][`name_${lang}`];
  return items.length === 1 ? first : `${first} +${items.length - 1}`;
}
