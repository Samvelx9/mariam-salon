import { pool } from '../db.js';
import {
  todayDateStr,
  addDaysToDateStr,
  dayOfWeek,
  localToUtc,
  utcToLocalTimeStr,
  addMinutes,
} from '../lib/time.js';

export const DAYS_AHEAD = 7;
export const SLOT_INTERVAL_MINUTES = 30;
export const CUTOFF_MINUTES = 90;

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// Checks a single candidate [startUtc, endUtc) against weekly hours and
// date-specific blocks — the same rules getAvailableSlots uses to build the
// slot list, but for one specific slot. Used to validate create/reschedule
// requests, since the EXCLUDE constraint only guards against double-booking,
// not against booking outside business hours or into a blocked window.
export async function isSlotWithinAvailability(date, startUtc, endUtc) {
  const { rows: hoursRows } = await pool.query(
    'SELECT is_open, start_time, end_time FROM weekly_hours WHERE day_of_week = $1',
    [dayOfWeek(date)]
  );
  const hours = hoursRows[0];
  if (!hours || !hours.is_open) return false;

  const dayStart = localToUtc(date, hours.start_time);
  const dayEnd = localToUtc(date, hours.end_time);
  if (startUtc < dayStart || endUtc > dayEnd) return false;

  const { rows: blocks } = await pool.query(
    'SELECT start_time, end_time FROM availability_blocks WHERE date = $1',
    [date]
  );
  for (const b of blocks) {
    if (b.start_time === null && b.end_time === null) return false;
    const blockStart = localToUtc(date, b.start_time);
    const blockEnd = localToUtc(date, b.end_time);
    if (overlaps(startUtc, endUtc, blockStart, blockEnd)) return false;
  }

  return true;
}

export async function getActiveService(serviceId) {
  const { rows } = await pool.query(
    `SELECT id, slug, name_en, name_ru, name_hy, duration_minutes, price_amd
     FROM services WHERE id = $1 AND is_active = true`,
    [serviceId]
  );
  return rows[0] || null;
}

// Computes open slots for `service` over the next DAYS_AHEAD days, from
// availability (weekly hours minus date-specific blocks) minus existing
// non-cancelled bookings minus the cutoff window. Always queried fresh
// (no caching) to keep the double-booking race window as small as possible.
export async function getAvailableSlots(service, { excludeBookingId } = {}) {
  const startDate = todayDateStr();
  const endDate = addDaysToDateStr(startDate, DAYS_AHEAD - 1);
  const rangeStartUtc = localToUtc(startDate, '00:00');
  const rangeEndUtc = addMinutes(localToUtc(endDate, '00:00'), 24 * 60);
  const cutoffInstant = addMinutes(new Date(), CUTOFF_MINUTES);

  const { rows: weeklyHours } = await pool.query(
    'SELECT day_of_week, is_open, start_time, end_time FROM weekly_hours'
  );
  const hoursByDow = new Map(weeklyHours.map((h) => [h.day_of_week, h]));

  const { rows: blocks } = await pool.query(
    'SELECT date, start_time, end_time FROM availability_blocks WHERE date BETWEEN $1 AND $2',
    [startDate, endDate]
  );
  const blocksByDate = new Map();
  for (const b of blocks) {
    const key = b.date;
    if (!blocksByDate.has(key)) blocksByDate.set(key, []);
    blocksByDate.get(key).push(b);
  }

  const bookingParams = [rangeStartUtc, rangeEndUtc];
  let bookingQuery = `SELECT start_time, end_time FROM bookings
     WHERE status <> 'cancelled' AND start_time < $2 AND end_time > $1`;
  if (excludeBookingId) {
    bookingParams.push(excludeBookingId);
    bookingQuery += ` AND id <> $3`;
  }
  const { rows: existingBookings } = await pool.query(bookingQuery, bookingParams);

  const days = [];
  for (let i = 0; i < DAYS_AHEAD; i += 1) {
    const date = addDaysToDateStr(startDate, i);
    const hours = hoursByDow.get(dayOfWeek(date));
    const slots = [];

    if (hours && hours.is_open) {
      const dayBlocks = blocksByDate.get(date) || [];
      const fullyBlocked = dayBlocks.some((b) => b.start_time === null && b.end_time === null);

      if (!fullyBlocked) {
        const partialBlocks = dayBlocks
          .filter((b) => b.start_time !== null)
          .map((b) => [localToUtc(date, b.start_time), localToUtc(date, b.end_time)]);

        const dayStart = localToUtc(date, hours.start_time);
        const dayEnd = localToUtc(date, hours.end_time);

        for (
          let slotStart = dayStart;
          addMinutes(slotStart, service.duration_minutes) <= dayEnd;
          slotStart = addMinutes(slotStart, SLOT_INTERVAL_MINUTES)
        ) {
          const slotEnd = addMinutes(slotStart, service.duration_minutes);

          if (slotStart < cutoffInstant) continue;
          if (partialBlocks.some(([bs, be]) => overlaps(slotStart, slotEnd, bs, be))) continue;
          if (
            existingBookings.some((b) => overlaps(slotStart, slotEnd, b.start_time, b.end_time))
          ) {
            continue;
          }

          slots.push(utcToLocalTimeStr(slotStart));
        }
      }
    }

    days.push({ date, slots });
  }

  return days;
}
