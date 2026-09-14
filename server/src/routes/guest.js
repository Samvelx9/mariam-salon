import { Router } from 'express';
import { pool } from '../db.js';
import {
  getActiveService,
  getAvailableSlots,
  isSlotWithinAvailability,
  CUTOFF_MINUTES,
} from '../services/availability.js';
import { localToUtc, addMinutes } from '../lib/time.js';
import { notifyTelegram } from '../services/telegram.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { cleanString, isValidDate, isValidTime } from '../lib/validate.js';

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

// GET /api/services — active services for the guest picker
guestRouter.get('/services', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, slug, name_en, name_ru, name_hy, duration_minutes, price_amd
     FROM services WHERE is_active = true ORDER BY id`
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

  const days = await getAvailableSlots(service, { excludeBookingId });
  res.json({ serviceId, days });
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

  const startTime = localToUtc(date, time);
  const endTime = addMinutes(startTime, service.duration_minutes);

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
      [serviceId, startTime, endTime, customerName, customerPhone, service.price_amd]
    );

    const booking = rows[0];
    await notifyTelegram({
      type: 'booking_created',
      booking: { ...booking, customer_name: customerName, customer_phone: customerPhone },
      service,
    });

    res.status(201).json({
      id: booking.id,
      serviceId,
      startTime: booking.start_time,
      endTime: booking.end_time,
      status: booking.status,
      customerName,
      customerPhone,
      priceAtBooking: service.price_amd,
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
  const endTime = addMinutes(startTime, booking.duration_minutes);

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
