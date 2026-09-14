// Armenia (Asia/Yerevan) fixed UTC+4 offset — see server/src/lib/time.js for why
// a constant offset instead of a timezone library is fine here.
const TZ_OFFSET_MINUTES = 4 * 60;

export function formatYerevanDateTime(date) {
  const local = new Date(date.getTime() + TZ_OFFSET_MINUTES * 60000);
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = local.getUTCFullYear();
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const min = String(local.getUTCMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
}
