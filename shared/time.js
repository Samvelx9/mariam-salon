// Armenia (Asia/Yerevan) fixed UTC+4 offset, no DST since 2011 — see
// server/src/lib/time.js for the same reasoning. Booking timestamps from the
// API are UTC instants; this splits one into the Yerevan calendar date (as a
// browser-local-midnight Date, safe for toLocaleDateString regardless of the
// viewer's own timezone) and wall-clock time for display.
const TZ_OFFSET_MINUTES = 4 * 60;

export function splitYerevanDateTime(isoString) {
  const utc = new Date(isoString);
  const local = new Date(utc.getTime() + TZ_OFFSET_MINUTES * 60000);
  const dateObj = new Date(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  return { dateObj, time: `${hh}:${mm}` };
}
