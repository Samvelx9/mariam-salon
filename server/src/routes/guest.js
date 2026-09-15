import { Router } from 'express';
import { pool } from '../db.js';
import {
  getActiveService,
  getAvailableSlots,
  isSlotWithinAvailability,
  CUTOFF_MINUTES,
} from '../services/availability.js';
import { localToUtc, addMinutes } from '../lib/time.js';
import { bookingShape, isValidDuration, MIN_BOOKING_MINUTES } from '../lib/booking.js';
import { notifyTelegram } from '../services/telegram.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { cleanString, isValidDate, isValidTime } from '../lib/validate.js';
import { getProfileRow, shapeProfile } from '../services/profile.js';

export const guestRouter = Router();

const EXCLUSION_VIOLATION = '23P01';

async function getBookingWithService(id) {
  const { rows } = await pool.query(
    `SELECT b.id, b.service_id, b.start_time, b.end_time, b.customer_name,
            b.customer_phone, b.status, b.price_at_booking,
            s.duration_minutes, s.name_en, s.name_ru, s.name_hy
     FROM bookings b
     JOIN services s ON s.id = b.service_id
     WHERE b.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// GET /api/profile — everything the landing page says about Mariam
guestRouter.get('/profile', asyncHandler(async (_req, res) => {
  const row = await getProfileRow();
  if (!row) {
    return res.status(404).json({ error: 'profile_not_found' });
  }
  res.json(shapeProfile(row));
}));

// GET /api/profile/photo — Mariam's photo, served straight from the database.
// The landing page requests it with the ?v=<photoVersion> from /api/profile,
// so a long cache lifetime is safe: a new upload changes the URL.
guestRouter.get('/profile/photo', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT photo_mime, photo_data, photo_updated_at FROM salon_profile WHERE id = 1'
  );
  const row = rows[0];
  if (!row || !row.photo_data) {
    return res.status(404).json({ error: 'photo_not_found' });
  }

  const etag = `W/"photo-${new Date(row.photo_updated_at).getTime()}"`;
  res.set('Content-Type', row.photo_mime);
  res.set('Cache-Control', 'public, max-age=86400');
  res.set('ETag', etag);
  res.send(row.photo_data);
}));

// GET /api/categories — the treatments on the landing page, each with the
// price list (zones) the guest sees after picking one.
guestRouter.get('/categories', asyncHandler(async (_req, res) => {
  const { rows: categories } = await pool.query(
    `SELECT id, slug, name_en, name_ru, name_hy,
            description_en, description_ru, description_hy, is_hourly
     FROM service_categories WHERE is_active = true
     ORDER BY sort_order, id`
  );

  const { rows: services } = await pool.query(
    `SELECT s.id, s.category_id, s.slug, s.name_en, s.name_ru, s.name_hy,
            s.duration_minutes, s.price_amd, c.is_hourly
     FROM services s
     JOIN service_categories c ON c.id = s.category_id
     WHERE s.is_active = true ORDER BY s.sort_order, s.id`
  );

  const byCategory = new Map(categories.map((c) => [c.id, []]));
  for (const service of services) {
    byCategory.get(service.category_id)?.push(service);
  }

  res.json(categories.map((c) => ({ ...c, services: byCategory.get(c.id) })));
}));

// GET /api/hours — weekly opening hours, shown next to the salon address
guestRouter.get('/hours', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT day_of_week, is_open, start_time, end_time, lunch_start, lunch_end
     FROM weekly_hours ORDER BY day_of_week`
  );
  res.json(rows);
}));

// GET /api/services — active services for the guest picker
guestRouter.get('/services', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.category_id, s.slug, s.name_en, s.name_ru, s.name_hy,
            s.duration_minutes, s.price_amd, c.is_hourly
     FROM services s
     JOIN service_categories c ON c.id = s.category_id
     WHERE s.is_active = true ORDER BY s.sort_order, s.id`
  );
  res.json(rows);
}));

// GET /api/services/:id/slots — open slots for the next 7 days.
// ?excludeBookingId=<id> lets the reschedule picker treat that booking's
// current slot as free rather than "taken by itself".
guestRouter.get('/services/:id/slots', asyncHandler(async (req, res) => {
  const serviceId = Number(req.params.id);
  if (!Number.isInteger(serviceId)) {
    return res.status(400).json({ error: 'invalid_service_id' });
  }

  const service = await getActiveService(serviceId);
  if (!service) {
    return res.status(404).json({ error: 'service_not_found' });
  }

  const excludeBookingId = req.query.excludeBookingId
    ? Number(req.query.excludeBookingId)
    : undefined;

  // For an hourly zone the guest's chosen length decides which starts leave
  // enough room; for a fixed one the query is ignored.
  let durationMinutes;
  if (service.is_hourly) {
    durationMinutes =
      req.query.durationMinutes === undefined
        ? MIN_BOOKING_MINUTES
        : Number(req.query.durationMinutes);
    if (!isValidDuration(durationMinutes)) {
      return res.status(400).json({ error: 'invalid_duration' });
    }
  }

  const days = await getAvailableSlots(service, { excludeBookingId, durationMinutes });
  res.json({ serviceId, days, durationMinutes: durationMinutes ?? service.duration_minutes });
}));

// POST /api/bookings — create a booking for an open slot
guestRouter.post('/bookings', asyncHandler(async (req, res) => {
  const serviceId = Number(req.body?.serviceId);
  const date = req.body?.date;
  const time = req.body?.time;
  const customerName = cleanString(req.body?.customerName, 100);
  const customerPhone = cleanString(req.body?.customerPhone, 30);

  if (!Number.isInteger(serviceId) || !isValidDate(date) || !isValidTime(time)) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  if (!customerName || !customerPhone) {
    return res.status(400).json({ error: 'missing_customer_details' });
  }

  const service = await getActiveService(serviceId);
  if (!service) {
    return res.status(404).json({ error: 'service_not_found' });
  }

  const requestedMinutes =
    req.body?.durationMinutes === undefined
      ? MIN_BOOKING_MINUTES
      : Number(req.body.durationMinutes);
  if (service.is_hourly && !isValidDuration(requestedMinutes)) {
    return res.status(400).json({ error: 'invalid_duration' });
  }
  const { durationMinutes, price } = bookingShape(service, requestedMinutes);

  const startTime = localToUtc(date, time);
  const endTime = addMinutes(startTime, durationMinutes);

  if (startTime < addMinutes(new Date(), CUTOFF_MINUTES)) {
    return res.status(400).json({ error: 'too_soon', cutoffMinutes: CUTOFF_MINUTES });
  }

  if (!(await isSlotWithinAvailability(date, startTime, endTime))) {
    return res.status(409).json({ error: 'slot_taken' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO bookings (service_id, start_time, end_time, customer_name, customer_phone, price_at_booking)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, start_time, end_time, status`,
      [serviceId, startTime, endTime, customerName, customerPhone, price]
    );

    const booking = rows[0];
    await notifyTelegram({
      type: 'booking_created',
      booking: { ...booking, customer_name: customerName, customer_phone: customerPhone },
      service,
      durationMinutes,
    });

    res.status(201).json({
      id: booking.id,
      serviceId,
      startTime: booking.start_time,
      endTime: booking.end_time,
      status: booking.status,
      customerName,
      customerPhone,
      priceAtBooking: price,
    });
  } catch (err) {
    if (err.code === EXCLUSION_VIOLATION) {
      return res.status(409).json({ error: 'slot_taken' });
    }
    throw err;
  }
}));

// POST /api/bookings/lookup — all upcoming bookings for a phone number
guestRouter.post('/bookings/lookup', asyncHandler(async (req, res) => {
  const phone = cleanString(req.body?.phone, 30);
  if (!phone) {
    return res.status(400).json({ error: 'missing_phone' });
  }

  const { rows } = await pool.query(
    `SELECT b.id, b.service_id, b.start_time, b.end_time, b.status, b.price_at_booking,
            b.customer_name, s.name_en, s.name_ru, s.name_hy
     FROM bookings b
     JOIN services s ON s.id = b.service_id
     WHERE b.customer_phone = $1
       AND b.status NOT IN ('cancelled', 'completed')
       AND b.start_time > now()
     ORDER BY b.start_time ASC`,
    [phone]
  );

  res.json(rows);
}));

// POST /api/bookings/:id/cancel — no cutoff, always allowed
guestRouter.post('/bookings/:id/cancel', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'invalid_booking_id' });
  }

  const booking = await getBookingWithService(id);
  if (!booking) {
    return res.status(404).json({ error: 'booking_not_found' });
  }
  if (booking.status === 'cancelled') {
    return res.status(409).json({ error: 'already_cancelled' });
  }

  await pool.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [id]);
  await notifyTelegram({ type: 'booking_cancelled', booking });

  res.json({ id, status: 'cancelled' });
}));

// POST /api/bookings/:id/reschedule — same cutoff + slot rules as a new booking
guestRouter.post('/bookings/:id/reschedule', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const date = req.body?.date;
  const time = req.body?.time;

  if (!Number.isInteger(id) || !isValidDate(date) || !isValidTime(time)) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  const booking = await getBookingWithService(id);
  if (!booking) {
    return res.status(404).json({ error: 'booking_not_found' });
  }
  if (booking.status !== 'confirmed') {
    return res.status(409).json({ error: 'not_reschedulable', status: booking.status });
  }

  const startTime = localToUtc(date, time);
  const bookedMinutes = Math.round(
    (new Date(booking.end_time) - new Date(booking.start_time)) / 60000
  );
  const endTime = addMinutes(startTime, bookedMinutes);

  if (startTime < addMinutes(new Date(), CUTOFF_MINUTES)) {
    return res.status(400).json({ error: 'too_soon', cutoffMinutes: CUTOFF_MINUTES });
  }

  if (!(await isSlotWithinAvailability(date, startTime, endTime))) {
    return res.status(409).json({ error: 'slot_taken' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE bookings SET start_time = $2, end_time = $3 WHERE id = $1
       RETURNING id, start_time, end_time, status`,
      [id, startTime, endTime]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === EXCLUSION_VIOLATION) {
      return res.status(409).json({ error: 'slot_taken' });
    }
    throw err;
  }
}));
