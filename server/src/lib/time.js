// Armenia (Asia/Yerevan) has used a fixed UTC+4 offset with no DST since 2011,
// so working hours/date boundaries can be computed with a constant offset
// instead of pulling in a full timezone library.
const TZ_OFFSET_MINUTES = 4 * 60;

export function nowInYerevan() {
  return new Date(Date.now() + TZ_OFFSET_MINUTES * 60000);
}

export function todayDateStr() {
  return nowInYerevan().toISOString().slice(0, 10);
}

export function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Combine a local (Yerevan) date + "HH:MM" time into the UTC instant it represents.
export function localToUtc(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - TZ_OFFSET_MINUTES * 60000);
}

export function utcToLocalTimeStr(date) {
  const local = new Date(date.getTime() + TZ_OFFSET_MINUTES * 60000);
  return local.toISOString().slice(11, 16);
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}
