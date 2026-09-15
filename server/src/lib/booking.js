// Deliberately a copy of `shared/booking.js` rather than an import of it: the
// backend image is built with `server/` as its whole Docker context (see
// /opt/app/docker-compose.yml), so nothing outside this directory exists at
// runtime. `src/lib/time.js` duplicates the shared time helpers for the same
// reason. Keep the two in step — the rules below are what the guest app shows
// and what this server charges, so they have to agree.

export const MAX_BOOKING_HOURS = 6;

export function isValidHours(hours) {
  return Number.isInteger(hours) && hours >= 1 && hours <= MAX_BOOKING_HOURS;
}

// The two numbers a booking is actually made of. For an hourly treatment they
// come from the chosen hours; otherwise the zone's own fixed duration and price
// stand, and `hours` is ignored.
export function bookingShape(service, hours) {
  if (!service.is_hourly) {
    return { durationMinutes: service.duration_minutes, price: service.price_amd };
  }
  return { durationMinutes: hours * 60, price: service.price_amd * hours };
}
