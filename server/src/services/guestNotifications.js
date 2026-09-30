import { randomBytes } from 'node:crypto';
import { pool } from '../db.js';
import { nowInYerevan } from '../lib/time.js';
import { buildIcs } from '../lib/ics.js';
import { getBookingForGuest } from './bookings.js';
import { getProfileRow } from './profile.js';
import {
  callTelegram,
  callTelegramDetailed,
  getBotUsername,
  notifyTelegram,
  telegramConfig,
} from './telegram.js';

// Everything the guest hears about their own visit. Mariam's messages live in
// services/telegram.js and are always Russian; these are in whichever language
// the guest booked in.
//
// A guest opts in from the confirmation screen: "Get reminders in Telegram"
// opens Mariam's bot on `t.me/<bot>?start=<guest_token>`, and pressing Start
// there sends the bot "/start <guest_token>", which links that chat to the
// booking (routes/telegram.js → linkGuestChat). From then on the guest gets:
//
// - a reminder the evening before (from 18:00) and one 2 hours before, each
//   with "I'll be there" / "Cancel visit" buttons;
// - a message whenever the visit is moved or cancelled, by them or by Mariam.
//
// Reminders are never sent between 21:00 and 09:00. Messages that answer
// something that just happened do go out then, but silently.

export const GUEST_LANGS = ['hy', 'ru', 'en'];
const FALLBACK_LANG = 'ru';

const TEXT = {
  en: {
    brand: "Mariam's Studio",
    linked: "Done! I'll remind you here the evening before your visit and 2 hours before it.",
    linkExpired: 'This link is for a visit that has already passed or been cancelled.',
    help: (site) =>
      `Hi! To get reminders here, book a visit at ${site} and tap “Get reminders in Telegram” on the last screen.`,
    notInbox: "I only send visit reminders and can't pass messages on to Mariam.",
    contactMariam: 'To reach her:',
    dayReminder: '🔔 Reminder: your visit is tomorrow.',
    soonReminder: (time) => `🔔 See you soon — your visit is today at ${time}.`,
    askCome: 'Will you make it?',
    comeBtn: "✅ I'll be there",
    cancelBtn: '❌ Cancel visit',
    cancelAsk: 'Cancel this visit?',
    cancelYes: 'Yes, cancel it',
    cancelNo: 'No, keep it',
    confirmedNote: '✅ Thanks — see you then!',
    cancelledNote: '❌ Your visit is cancelled.',
    unchangeable: 'ℹ️ This visit can no longer be changed here.',
    moved: '🔄 Your visit has been moved.',
    was: 'Was:',
    cancelled: (when) => `❌ Your visit on ${when} has been cancelled.`,
    bookAgain: (site) => `To book again: ${site}`,
    manage: (url) => `To reschedule or cancel: ${url}`,
    rescheduleBtn: '🔄 Reschedule',
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    date: (weekday, day, month, time) => `${weekday}, ${day} ${month}, ${time}`,
  },
  ru: {
    brand: 'Студия Мариам',
    linked: 'Готово! Я напомню вам здесь о визите накануне вечером и за 2 часа до начала.',
    linkExpired: 'Эта ссылка относится к визиту, который уже прошёл или отменён.',
    help: (site) =>
      `Здравствуйте! Чтобы получать напоминания здесь, запишитесь на ${site} и нажмите «Напоминания в Telegram» на последнем экране.`,
    notInbox: 'Я только присылаю напоминания о визитах и не могу передать сообщение Мариам.',
    contactMariam: 'Связаться с ней:',
    dayReminder: '🔔 Напоминание: ваш визит завтра.',
    soonReminder: (time) => `🔔 До скорой встречи — ваш визит сегодня в ${time}.`,
    askCome: 'Вы придёте?',
    comeBtn: '✅ Приду',
    cancelBtn: '❌ Отменить визит',
    cancelAsk: 'Отменить этот визит?',
    cancelYes: 'Да, отменить',
    cancelNo: 'Нет, оставить',
    confirmedNote: '✅ Спасибо — до встречи!',
    cancelledNote: '❌ Визит отменён.',
    unchangeable: 'ℹ️ Этот визит здесь уже нельзя изменить.',
    moved: '🔄 Ваш визит перенесён.',
    was: 'Было:',
    cancelled: (when) => `❌ Ваш визит (${when}) отменён.`,
    bookAgain: (site) => `Записаться снова: ${site}`,
    manage: (url) => `Перенести или отменить: ${url}`,
    rescheduleBtn: '🔄 Перенести',
    months: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    weekdays: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
    date: (weekday, day, month, time) => `${weekday}, ${day} ${month}, ${time}`,
  },
  hy: {
    brand: 'Մարիամի ստուդիա',
    linked: 'Պատրաստ է։ Այստեղ կհիշեցնեմ այցի մասին նախորդ երեկոյան և սկսվելուց 2 ժամ առաջ։',
    linkExpired: 'Այս հղումը վերաբերում է այցի, որն արդեն անցել է կամ չեղարկվել է։',
    help: (site) =>
      `Բարև։ Այստեղ հիշեցումներ ստանալու համար գրանցվեք ${site} կայքում և վերջին էկրանին սեղմեք «Հիշեցումներ Telegram-ում»։`,
    notInbox: 'Ես միայն այցերի հիշեցումներ եմ ուղարկում և չեմ կարող հաղորդագրություն փոխանցել Մարիամին։',
    contactMariam: 'Կապվելու համար՝',
    dayReminder: '🔔 Հիշեցում՝ ձեր այցը վաղն է։',
    soonReminder: (time) => `🔔 Շուտով կհանդիպենք՝ ձեր այցն այսօր է, ժամը ${time}-ին։`,
    askCome: 'Կգա՞ք։',
    comeBtn: '✅ Կգամ',
    cancelBtn: '❌ Չեղարկել այցը',
    cancelAsk: 'Չեղարկե՞լ այս այցը։',
    cancelYes: 'Այո, չեղարկել',
    cancelNo: 'Ոչ, թողնել',
    confirmedNote: '✅ Շնորհակալություն, կհանդիպենք։',
    cancelledNote: '❌ Այցը չեղարկված է։',
    unchangeable: 'ℹ️ Այս այցն այստեղ այլևս հնարավոր չէ փոխել։',
    moved: '🔄 Ձեր այցը տեղափոխվել է։',
    was: 'Նախկինում՝',
    cancelled: (when) => `❌ Ձեր այցը (${when}) չեղարկված է։`,
    bookAgain: (site) => `Կրկին գրանցվելու համար՝ ${site}`,
    manage: (url) => `Տեղափոխելու կամ չեղարկելու համար՝ ${url}`,
    rescheduleBtn: '🔄 Տեղափոխել',
    months: ['հունվարի', 'փետրվարի', 'մարտի', 'ապրիլի', 'մայիսի', 'հունիսի', 'հուլիսի', 'օգոստոսի', 'սեպտեմբերի', 'հոկտեմբերի', 'նոյեմբերի', 'դեկտեմբերի'],
    weekdays: ['կիրակի', 'երկուշաբթի', 'երեքշաբթի', 'չորեքշաբթի', 'հինգշաբթի', 'ուրբաթ', 'շաբաթ'],
    date: (weekday, day, month, time) => `${weekday}, ${month} ${day}, ${time}`,
  },
};

const langOf = (booking) => (GUEST_LANGS.includes(booking?.guest_lang) ? booking.guest_lang : FALLBACK_LANG);

// Telegram tells us the language the guest's app is set to, which is the best
// guess there is before we know which booking they mean.
function langFromTelegram(code) {
  const c = String(code ?? '').toLowerCase();
  if (c.startsWith('hy')) return 'hy';
  if (c.startsWith('en')) return 'en';
  return FALLBACK_LANG;
}

// Guest links and the calendar file only make sense where Telegram can reach
// this server and the site has a public address — the deployed backend.
function siteUrl() {
  return (process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
}

export function guestTelegramEnabled() {
  return Boolean(telegramConfig() && siteUrl());
}

export function newGuestToken() {
  // 32 url-safe characters: unguessable, and within what Telegram accepts as a
  // Start parameter (A–Z, a–z, 0–9, _ and -, up to 64).
  return randomBytes(24).toString('base64url');
}

export const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

// Opens the site straight on this booking's manage screen — see
// `?manage=` in client-guest/src/useBookingFlow.js — rather than on the landing
// page, where the guest would have to find it again by phone number.
export function manageUrlFor(booking) {
  const site = siteUrl();
  return booking?.guest_token ? `${site}/?manage=${booking.guest_token}` : site;
}

export async function telegramLinkFor(token) {
  if (!token || !guestTelegramEnabled()) return null;
  const username = await getBotUsername();
  return username ? `https://t.me/${username}?start=${token}` : null;
}

// Armenia keeps UTC+4 all year — see lib/time.js.
const TZ_OFFSET_MS = 4 * 60 * 60 * 1000;

function localParts(instant) {
  const local = new Date(new Date(instant).getTime() + TZ_OFFSET_MS);
  return {
    day: local.getUTCDate(),
    month: local.getUTCMonth(),
    weekday: local.getUTCDay(),
    time: local.toISOString().slice(11, 16),
  };
}

function formatWhen(instant, lang) {
  const T = TEXT[lang];
  const p = localParts(instant);
  return T.date(T.weekdays[p.weekday], p.day, T.months[p.month], p.time);
}

function zoneNames(booking, lang) {
  return (booking.items ?? []).map((i) => i[`name_${lang}`] || i.name_ru).filter(Boolean);
}

function addressFor(profile, lang) {
  if (!profile) return '';
  return profile[`address_${lang}`] || profile.address_ru || profile.address_hy || profile.address_en || '';
}

// The block every message about a visit carries: when, what, where. Any line
// with nothing to show is left out, so a profile Mariam hasn't filled in yet
// doesn't leave a bare "📍".
function visitDetails(booking, lang, profile) {
  const lines = [`📅 ${formatWhen(booking.start_time, lang)}`];
  const zones = zoneNames(booking, lang);
  if (zones.length) lines.push(`💆 ${zones.join(', ')}`);
  const address = addressFor(profile, lang);
  if (address) lines.push(`📍 ${address}`);
  if (profile?.map_url) lines.push(`🗺 ${profile.map_url}`);
  return lines.join('\n');
}

// Coming and cancelling are answered right here in the chat; moving the visit
// needs the slot picker, so that one is a link to the booking on the site.
function reminderKeyboard(booking, lang) {
  const T = TEXT[lang];
  return {
    inline_keyboard: [
      [
        { text: T.comeBtn, callback_data: `g:ok:${booking.id}` },
        { text: T.cancelBtn, callback_data: `g:cx:${booking.id}` },
      ],
      [{ text: T.rescheduleBtn, url: manageUrlFor(booking) }],
    ],
  };
}

function cancelConfirmKeyboard(bookingId, lang) {
  const T = TEXT[lang];
  return {
    inline_keyboard: [[
      { text: T.cancelYes, callback_data: `g:cxy:${bookingId}` },
      { text: T.cancelNo, callback_data: `g:cxn:${bookingId}` },
    ]],
  };
}

function isQuietHours() {
  const hour = nowInYerevan().getUTCHours();
  return hour >= 21 || hour < 9;
}

// One message to a guest. Returns whether it went out. A 403 means the guest
// has blocked the bot, so that booking's chat is forgotten rather than tried
// again every minute until the visit.
async function sendToGuest(booking, text, extra = {}) {
  const { ok, status } = await callTelegramDetailed('sendMessage', {
    chat_id: booking.guest_chat_id,
    text,
    disable_web_page_preview: true,
    ...(isQuietHours() ? { disable_notification: true } : {}),
    ...extra,
  });
  if (!ok && status === 403) {
    await pool.query('UPDATE bookings SET guest_chat_id = NULL WHERE id = $1', [booking.id]);
  }
  return ok;
}

const isActionable = (booking) =>
  booking.status === 'confirmed' && new Date(booking.start_time) > new Date();

// ---------------------------------------------------------------------------
// Messages typed to the bot
// ---------------------------------------------------------------------------

async function reply(chatId, text) {
  await callTelegram('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
}

// "/start <token>" — the guest pressed Start on their reminders link. Pressing
// it again (or on a second phone) just links again; the link time is kept for
// the same chat so a repeat doesn't count as a late opt-in and skip a reminder.
export async function handleGuestMessage(message) {
  const chatId = message.chat?.id;
  if (!chatId || message.chat.type !== 'private') return;
  const text = String(message.text ?? '').trim();
  const fallbackLang = langFromTelegram(message.from?.language_code);

  const [command, token] = text.split(/\s+/);
  if (command !== '/start') {
    // Guests do write to the bot as if it were Mariam ("running 10 min late"),
    // and nothing reads this chat — so say so, and where she can be reached.
    const T = TEXT[fallbackLang];
    const profile = await getProfileRow();
    const contacts = [profile?.phone, profile?.telegram].filter(Boolean);
    return reply(chatId, contacts.length ? `${T.notInbox}\n${T.contactMariam} ${contacts.join(', ')}` : T.notInbox);
  }

  if (!token || !GUEST_TOKEN_PATTERN.test(token)) {
    return reply(chatId, TEXT[fallbackLang].help(siteUrl()));
  }

  const booking = await getBookingForGuest({ token });
  if (!booking || !isActionable(booking)) {
    const lang = booking ? langOf(booking) : fallbackLang;
    return reply(chatId, `${TEXT[lang].linkExpired}\n\n${TEXT[lang].bookAgain(siteUrl())}`);
  }

  await pool.query(
    `UPDATE bookings
        SET guest_linked_at = CASE WHEN guest_chat_id = $2 THEN guest_linked_at ELSE now() END,
            guest_chat_id = $2
      WHERE id = $1`,
    [booking.id, chatId]
  );

  const lang = langOf(booking);
  const T = TEXT[lang];
  const profile = await getProfileRow();
  await reply(chatId, `${T.linked}\n\n${visitDetails(booking, lang, profile)}\n\n${T.manage(manageUrlFor(booking))}`);
}

// ---------------------------------------------------------------------------
// Buttons on the guest's reminders
// ---------------------------------------------------------------------------

// Callback data is "g:<action>:<booking id>". Only the chat the booking is
// linked to can act on it, so a forwarded message's buttons do nothing for
// anyone else. Cancelling takes two taps — the second asks "are you sure?" —
// because the button sits right next to "I'll be there".
export async function handleGuestCallback(query) {
  const message = query.message;
  const [, action, rawId] = String(query.data ?? '').split(':');
  const id = Number(rawId);
  const booking = Number.isInteger(id) ? await getBookingForGuest({ id }) : null;

  if (!booking || String(booking.guest_chat_id) !== String(message.chat.id)) {
    await callTelegram('answerCallbackQuery', { callback_query_id: query.id });
    return;
  }

  const lang = langOf(booking);
  const T = TEXT[lang];
  const where = { chat_id: message.chat.id, message_id: message.message_id };
  // Editing the text without a reply_markup is also what removes the buttons.
  const finish = (note) =>
    callTelegram('editMessageText', { ...where, text: `${message.text ?? ''}\n\n${note}` });

  if (action === 'cxn') {
    await callTelegram('answerCallbackQuery', { callback_query_id: query.id });
    await callTelegram('editMessageReplyMarkup', { ...where, reply_markup: reminderKeyboard(booking, lang) });
    return;
  }

  if (!isActionable(booking)) {
    await callTelegram('answerCallbackQuery', { callback_query_id: query.id });
    await finish(T.unchangeable);
    return;
  }

  if (action === 'ok') {
    await callTelegram('answerCallbackQuery', { callback_query_id: query.id, text: T.confirmedNote });
    // Mariam hears about the first "I'll be there" for a given time, not every
    // tap on every reminder.
    const { rows } = await pool.query(
      `UPDATE bookings SET guest_confirmed_at = now()
        WHERE id = $1 AND guest_confirmed_at IS NULL RETURNING id`,
      [id]
    );
    await finish(T.confirmedNote);
    if (rows[0]) notifyTelegram({ type: 'guest_confirmed', booking });
    return;
  }

  if (action === 'cx') {
    await callTelegram('answerCallbackQuery', { callback_query_id: query.id, text: T.cancelAsk });
    await callTelegram('editMessageReplyMarkup', { ...where, reply_markup: cancelConfirmKeyboard(id, lang) });
    return;
  }

  if (action === 'cxy') {
    // Same rule as cancelling on the site, plus: only a visit still ahead.
    const { rows } = await pool.query(
      `UPDATE bookings SET status = 'cancelled'
        WHERE id = $1 AND status = 'confirmed' AND start_time > now() RETURNING id`,
      [id]
    );
    await callTelegram('answerCallbackQuery', { callback_query_id: query.id });
    await finish(rows[0] ? T.cancelledNote : T.unchangeable);
    if (rows[0]) notifyTelegram({ type: 'booking_cancelled', booking, viaTelegram: true });
    return;
  }

  await callTelegram('answerCallbackQuery', { callback_query_id: query.id });
}

// ---------------------------------------------------------------------------
// Telling the guest about a change
// ---------------------------------------------------------------------------

// `moved` (with the previous start time) or `cancelled`, by the guest on the
// site or by Mariam in the admin panel. Best-effort and never awaited by the
// routes, like Mariam's own notifications: a failure is logged, never thrown.
export async function notifyGuest({ type, bookingId, previousStartTime }) {
  try {
    if (!guestTelegramEnabled()) return;
    const booking = await getBookingForGuest({ id: bookingId });
    if (!booking?.guest_chat_id) return;

    const lang = langOf(booking);
    const T = TEXT[lang];
    const profile = await getProfileRow();

    if (type === 'moved') {
      // "I'll be there" was said about the old time.
      await pool.query('UPDATE bookings SET guest_confirmed_at = NULL WHERE id = $1', [bookingId]);
      const before = formatWhen(previousStartTime, lang);
      await sendToGuest(
        booking,
        `${T.moved}\n${T.was} ${before}\n\n${visitDetails(booking, lang, profile)}\n\n${T.manage(manageUrlFor(booking))}`
      );
    } else if (type === 'cancelled') {
      await sendToGuest(
        booking,
        `${T.cancelled(formatWhen(booking.start_time, lang))}\n\n${T.bookAgain(siteUrl())}`
      );
    }
  } catch (err) {
    console.error('Guest notification failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

// 18:00 Yerevan time on the day before the visit, as a UTC instant: shift the
// start into local wall-clock time, take that day's midnight, step back six
// hours, and shift back (4 + 6 = 10 hours in all).
const DAY_DUE = `((date_trunc('day', (b.start_time AT TIME ZONE 'UTC') + interval '4 hours')
                  - interval '10 hours') AT TIME ZONE 'UTC')`;

// Each reminder records the start time it was sent for, so a visit moved after
// its reminder went out is reminded again at the new time — the same idea as
// `completion_asked_at`. A guest who only linked Telegram after a reminder was
// due isn't sent it late: they've just seen their booking. The evening-before
// one only goes out that evening (it says "tomorrow"; quiet hours end it at
// 21:00 in practice) and is skipped for a visit less than 3 hours off, which
// the 2-hour one covers; the 2-hour one stops 30 minutes before the start.
const REMINDERS = {
  day: {
    column: 'day_reminder_for',
    due: `now() >= ${DAY_DUE}
          AND now() < ${DAY_DUE} + interval '6 hours'
          AND b.start_time > now() + interval '3 hours'
          AND b.guest_linked_at < ${DAY_DUE}`,
    text: (T) => T.dayReminder,
  },
  soon: {
    column: 'soon_reminder_for',
    due: `now() >= b.start_time - interval '2 hours'
          AND now() < b.start_time - interval '30 minutes'
          AND b.guest_linked_at < b.start_time - interval '2 hours'`,
    text: (T, booking) => T.soonReminder(localParts(booking.start_time).time),
  },
};

async function claimDue({ column, due }) {
  const { rows } = await pool.query(
    `UPDATE bookings SET ${column} = start_time
      WHERE id IN (
        SELECT b.id FROM bookings b
         WHERE b.status = 'confirmed'
           AND b.guest_chat_id IS NOT NULL
           AND b.${column} IS DISTINCT FROM b.start_time
           AND ${due}
         ORDER BY b.start_time
         LIMIT 20
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id`
  );
  return rows.map((r) => r.id);
}

// Exported for scripted checks; startGuestReminders is what runs it.
export async function sendReminders() {
  if (isQuietHours()) return;
  const profile = await getProfileRow();

  for (const reminder of Object.values(REMINDERS)) {
    for (const id of await claimDue(reminder)) {
      const booking = await getBookingForGuest({ id });
      if (!booking?.guest_chat_id) continue;
      const lang = langOf(booking);
      const T = TEXT[lang];
      const sent = await sendToGuest(
        booking,
        `${reminder.text(T, booking)}\n\n${visitDetails(booking, lang, profile)}\n\n${T.askCome}`,
        { reply_markup: reminderKeyboard(booking, lang) }
      );
      if (!sent) {
        // Handed back to the next check, which gives up by itself once the
        // reminder's window has passed.
        await pool.query(`UPDATE bookings SET ${reminder.column} = NULL WHERE id = $1`, [id]);
      }
    }
  }
}

const CHECK_EVERY_MS = 60_000;

// Reads the database each minute rather than keeping timers, so a restart or a
// deploy only delays a reminder, never loses one.
export function startGuestReminders() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sendReminders();
    } catch (err) {
      console.error('Guest reminder check failed:', err.message);
    } finally {
      running = false;
    }
  };
  setInterval(tick, CHECK_EVERY_MS);
  tick();
}

// ---------------------------------------------------------------------------
// Calendar file
// ---------------------------------------------------------------------------

export async function calendarFileFor(booking) {
  const lang = langOf(booking);
  const T = TEXT[lang];
  const profile = await getProfileRow();
  const zones = zoneNames(booking, lang);
  const site = siteUrl();
  const description = [zones.join('\n'), profile?.phone, site && T.manage(manageUrlFor(booking))]
    .filter(Boolean)
    .join('\n\n');

  return buildIcs({
    // Stable per booking, so adding it again after a reschedule updates the
    // event rather than adding a second one (where the calendar app honours it).
    uid: `booking-${booking.id}@mariambeauty.skin`,
    start: booking.start_time,
    end: booking.end_time,
    summary: zones.length ? `${T.brand} — ${zones.join(', ')}` : T.brand,
    description,
    location: addressFor(profile, lang),
    url: site || undefined,
    alarms: [{ trigger: '-P1D' }, { trigger: '-PT2H' }],
  });
}
