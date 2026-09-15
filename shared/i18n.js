// Primitives shared between client-guest and client-admin: language
// metadata, locale tags, and the date/price formatting helpers that don't
// belong to either app's own UI copy. Each app keeps its own STRINGS dict
// for screen-specific text.

export const LANG_ORDER = ['hy', 'ru', 'en'];
export const LANG_META = {
  hy: { flag: '🇦🇲', name: 'Հայերեն' },
  ru: { flag: '🇷🇺', name: 'Русский' },
  en: { flag: '🇬🇧', name: 'English' },
};
export const LOCALE_TAG = { hy: 'hy-AM', ru: 'ru-RU', en: 'en-US' };
export const DEFAULT_LANG = 'ru';

export const WEEKDAY_SHORT = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  hy: ['Կիր', 'Երկ', 'Երք', 'Չրք', 'Հնգ', 'Ուրբ', 'Շաբ'],
};
export const WEEKDAY_FULL = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ru: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
  hy: ['Կիրակի', 'Երկուշաբթի', 'Երեքշաբթի', 'Չորեքշաբթի', 'Հինգշաբթի', 'Ուրբաթ', 'Շաբաթ'],
};
export const TODAY_TMRW = {
  en: { today: 'Today', tomorrow: 'Tmrw' },
  ru: { today: 'Сегодня', tomorrow: 'Завтра' },
  hy: { today: 'Այսօր', tomorrow: 'Վաղը' },
};
export const MONTH_SHORT = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ru: ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'],
  hy: ['հունվ.', 'փետր.', 'մարտ', 'ապր.', 'մայիս', 'հունիս', 'հուլիս', 'օգս.', 'սեպտ.', 'հոկտ.', 'նոյ.', 'դեկ.'],
};

export function formatPrice(amount, lang) {
  return amount.toLocaleString(LOCALE_TAG[lang]) + ' ֏';
}

// dateStr: 'YYYY-MM-DD'. Constructed from explicit parts (not `new Date(dateStr)`)
// so the viewer's browser timezone can't shift which calendar day this represents —
// the date is already a Yerevan-local calendar day computed by the server.
export function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Built from our own WEEKDAY_SHORT/MONTH_SHORT tables rather than
// `toLocaleDateString(LOCALE_TAG[lang], ...)` — some browser/runtime ICU
// builds (confirmed on at least one headless Chromium build used in testing)
// have no Armenian locale data at all and silently fall back to English
// weekday/month names for 'hy-AM', which would be a real, hard-to-notice
// correctness bug for Armenian-speaking users. Building the string ourselves
// removes that dependency entirely.
function formatDatePart(dateObj, lang) {
  const weekday = WEEKDAY_SHORT[lang][dateObj.getDay()];
  const month = MONTH_SHORT[lang][dateObj.getMonth()];
  const day = dateObj.getDate();
  if (lang === 'en') return `${weekday}, ${month} ${day}`;
  return `${weekday}, ${day} ${month}`; // ru/hy: day-before-month
}

export function formatDateAt(dateObj, time, lang) {
  const dateStr = formatDatePart(dateObj, lang);
  if (lang === 'ru') return dateStr + ', в ' + time;
  if (lang === 'hy') return dateStr + ', ժամը ' + time;
  return dateStr + ' at ' + time;
}

export function formatDate(dateObj, lang) {
  return formatDatePart(dateObj, lang);
}

export function dayLabel(dateObj, index, lang) {
  if (index === 0) return TODAY_TMRW[lang].today;
  if (index === 1) return TODAY_TMRW[lang].tomorrow;
  return WEEKDAY_SHORT[lang][dateObj.getDay()];
}
