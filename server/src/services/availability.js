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
    'SELECT is_open, start_time, end_time, lunch_start, lunch_end FROM weekly_hours WHERE day_of_week = $1',
    [dayOfWeek(date)]
  );
  const hours = hoursRows[0];
  if (!hours || !hours.is_open) return false;

  const dayStart = localToUtc(date, hours.start_time);
  const dayEnd = localToUtc(date, hours.end_time);
  if (startUtc < dayStart || endUtc > dayEnd) return false;

  // The lunch break closes the middle of the day exactly like a block does.
  if (hours.lunch_start) {
    const lunchStart = localToUtc(date, hours.lunch_start);
    const lunchEnd = localToUtc(date, hours.lunch_end);
    if (overlaps(startUtc, endUtc, lunchStart, lunchEnd)) return false;
  }

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

// `is_hourly` comes from the zone's treatment: it decides whether the row's
// price_amd is a flat price or an hourly rate, so every caller that prices or
// times a booking needs it alongside the service itself.
export async function getActiveService(serviceId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.slug, s.name_en, s.name_ru, s.name_hy, s.duration_minutes,
            s.price_amd, c.is_hourly
     FROM services s
     JOIN service_categories c ON c.id = s.category_id
     WHERE s.id = $1 AND s.is_active = true`,
    [serviceId]
  );
  return rows[0] || null;
}

// Computes open slots for `service` over the next DAYS_AHEAD days, from
// availability (weekly hours minus date-specific blocks) minus existing
// non-cancelled bookings minus the cutoff window. Always queried fresh
// (no caching) to keep the double-booking race window as small as possible.
//
// Each day also carries `unavailable`: the times on the same grid that can't be
// taken, and why. The picker shows those greyed out rather than dropping them,
// so a guest can see that 15:00 exists and is spoken for — a list that silently
// skips from 14:30 to 16:00 reads like a glitch.
export async function getAvailableSlots(service, { excludeBookingId, durationMinutes } = {}) {
  const slotLength = durationMinutes || service.duration_minutes;
  const startDate = todayDateStr();
  const endDate = addDaysToDateStr(startDate, DAYS_AHEAD - 1);
  const rangeStartUtc = localToUtc(startDate, '00:00');
  const rangeEndUtc = addMinutes(localToUtc(endDate, '00:00'), 24 * 60);
  const cutoffInstant = addMinutes(new Date(), CUTOFF_MINUTES);

  const { rows: weeklyHours } = await pool.query(
    'SELECT day_of_week, is_open, start_time, end_time, lunch_start, lunch_end FROM weekly_hours'
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
    const unavailable = [];

    if (hours && hours.is_open) {
      const dayBlocks = blocksByDate.get(date) || [];
      const fullyBlocked = dayBlocks.some((b) => b.start_time === null && b.end_time === null);

      if (!fullyBlocked) {
        const partialBlocks = dayBlocks
          .filter((b) => b.start_time !== null)
          .map((b) => [localToUtc(date, b.start_time), localToUtc(date, b.end_time)]);

        // The weekday's lunch break behaves as one more blocked window.
        if (hours.lunch_start) {
          partialBlocks.push([localToUtc(date, hours.lunch_start), localToUtc(date, hours.lunch_end)]);
        }

        const dayStart = localToUtc(date, hours.start_time);
        const dayEnd = localToUtc(date, hours.end_time);

        // Walks every start on the grid, not only the ones that fit: a start
        // that doesn't work is reported with its reason instead of vanishing.
        for (
          let slotStart = dayStart;
          slotStart < dayEnd;
          slotStart = addMinutes(slotStart, SLOT_INTERVAL_MINUTES)
        ) {
          const slotEnd = addMinutes(slotStart, slotLength);
          const time = utcToLocalTimeStr(slotStart);

          if (slotStart < cutoffInstant) {
            unavailable.push({ time, reason: 'past' });
          } else if (slotEnd > dayEnd) {
            // Would run past closing — true of every later start too, but the
            // guest still needs to see the times exist.
            unavailable.push({ time, reason: 'closing' });
          } else if (partialBlocks.some(([bs, be]) => overlaps(slotStart, slotEnd, bs, be))) {
            unavailable.push({ time, reason: 'blocked' });
          } else if (
            existingBookings.some((b) => overlaps(slotStart, slotEnd, b.start_time, b.end_time))
          ) {
            unavailable.push({ time, reason: 'booked' });
          } else {
            slots.push(time);
          }
        }
      }
    }

    days.push({ date, slots, unavailable });
  }

  return days;
}
