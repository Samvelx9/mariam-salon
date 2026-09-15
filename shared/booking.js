// Used by both frontends. The backend keeps its own copy in
// `server/src/lib/booking.js` — its Docker image is built with `server/` as the
// entire build context, so it can't import this package at runtime. Change one,
// change the other.
//
// An hourly treatment (electrolysis, say) is priced by the hour rather than by
// the zone: the guest chooses how long to book, and pays the zone's rate for
// each hour. Whole hours only — a half-hour of electrolysis isn't a thing
// Mariam sells, and whole hours keep the arithmetic obvious for both sides.
export const MAX_BOOKING_HOURS = 6;
export const HOUR_CHOICES = Array.from({ length: MAX_BOOKING_HOURS }, (_, i) => i + 1);

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
