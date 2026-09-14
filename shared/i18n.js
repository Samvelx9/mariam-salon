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
export const TODAY_TMRW = {
  en: { today: 'Today', tomorrow: 'Tmrw' },
  ru: { today: 'Сегодня', tomorrow: 'Завтра' },
  hy: { today: 'Այսօր', tomorrow: 'Վաղը' },
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

export function formatDateAt(dateObj, time, lang) {
  const dateStr = dateObj.toLocaleDateString(LOCALE_TAG[lang], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  if (lang === 'ru') return dateStr + ', в ' + time;
  if (lang === 'hy') return dateStr + ', ժամը ' + time;
  return dateStr + ' at ' + time;
}

export function formatDate(dateObj, lang) {
  return dateObj.toLocaleDateString(LOCALE_TAG[lang], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function dayLabel(dateObj, index, lang) {
  if (index === 0) return TODAY_TMRW[lang].today;
  if (index === 1) return TODAY_TMRW[lang].tomorrow;
  return WEEKDAY_SHORT[lang][dateObj.getDay()];
}
