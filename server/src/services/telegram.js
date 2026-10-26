import { createHash } from 'node:crypto';
import { formatYerevanDateTime } from '../lib/formatMessageTime.js';
import { formatDuration } from '../lib/booking.js';

function formatMessage(event) {
  const { booking } = event;
  const items = booking.items ?? [];
  // A visit can cover several zones, so they're listed one per line rather than
  // squeezed into the "Услуга:" line.
  const serviceName =
    items.length > 1
      ? '\n  · ' + items.map((i) => i.name_ru).join('\n  · ')
      : items[0]?.name_ru ?? booking.name_ru ?? '';
  const when = formatYerevanDateTime(new Date(booking.start_time));
  // How long the visit runs matters whenever it isn't implied by the zone —
  // an hourly session is whatever length the client chose, and several zones
  // together take as long as they take.
  const minutes =
    event.durationMinutes ??
    Math.round((new Date(booking.end_time) - new Date(booking.start_time)) / 60000);
  const duration = minutes ? `Длительность: ${formatDuration(minutes, 'ч', 'мин')}\n` : '';

  if (event.type === 'booking_created') {
    return (
      `🆕 Новая запись\n` +
      `Услуга: ${serviceName}\n` +
      `Дата: ${when}\n` +
      duration +
      `Клиент: ${booking.customer_name}\n` +
      `Телефон: ${booking.customer_phone}`
    );
  }

  // A guest moving their own visit is the one change Mariam doesn't make
  // herself, so both the old and the new time matter — she may already have
  // written the original one down.
  if (event.type === 'booking_rescheduled') {
    const before = formatYerevanDateTime(new Date(event.previousStartTime));
    return (
      `🔄 Перенос записи\n` +
      `Услуга: ${serviceName}\n` +
      `Было: ${before}\n` +
      `Стало: ${when}\n` +
      duration +
      `Клиент: ${booking.customer_name}\n` +
      `Телефон: ${booking.customer_phone}`
    );
  }

  // Sent once a visit's booked time has run out, with buttons for Mariam to say
  // how it went — see services/completionPrompts.js and routes/telegram.js.
  if (event.type === 'booking_ended') {
    return (
      `⏰ Процедура завершилась?\n` +
      `Услуга: ${serviceName}\n` +
      `Дата: ${when}\n` +
      duration +
      `Клиент: ${booking.customer_name}\n` +
      `Телефон: ${booking.customer_phone}`
    );
  }

  // The guest tapped "I'll come" on one of their reminders.
  if (event.type === 'guest_confirmed') {
    return (
      `👍 Клиент подтвердил визит\n` +
      `Услуга: ${serviceName}\n` +
      `Дата: ${when}\n` +
      `Клиент: ${booking.customer_name}\n` +
      `Телефон: ${booking.customer_phone}`
    );
  }

  if (event.type === 'booking_cancelled') {
    return (
      `❌ Отмена записи${event.viaTelegram ? ' (клиент отменил в Telegram)' : ''}\n` +
      `Услуга: ${serviceName}\n` +
      `Дата: ${when}\n` +
      duration +
      `Клиент: ${booking.customer_name}\n` +
      `Телефон: ${booking.customer_phone}`
    );
  }

  return null;
}

export function telegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  return token && chatId ? { token, chatId } : null;
}

// Telegram sends this back in a header on every webhook call, which is how the
// webhook tells a real update from anyone else posting to the URL. Derived from
// the bot token so there is no second secret to keep in `.env`.
export function webhookSecret(token) {
  return createHash('sha256').update(`webhook:${token}`).digest('hex');
}

const TELEGRAM_TIMEOUT_MS = 10_000;

// One Bot API call. Never throws — Telegram being down must never break
// whatever called it. `ok` is false on any failure, and `status` is Telegram's
// HTTP status when it answered at all: a 403 is a guest who has blocked the bot,
// which is worth telling apart from an outage.
export async function callTelegramDetailed(method, body) {
  const config = telegramConfig();
  if (!config) return { ok: false, status: null, result: null };

  try {
    const res = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // A Telegram that hangs rather than failing would otherwise hold whatever
      // is waiting on this — the minute check, a button's reply — indefinitely.
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`Telegram ${method} failed:`, res.status, await res.text());
      return { ok: false, status: res.status, result: null };
    }
    return { ok: true, status: res.status, result: (await res.json()).result ?? true };
  } catch (err) {
    console.error(`Telegram ${method} failed:`, err.message);
    return { ok: false, status: null, result: null };
  }
}

// The same call for anyone who only cares about the result: it, or null.
export async function callTelegram(method, body) {
  const { ok, result } = await callTelegramDetailed(method, body);
  return ok ? result : null;
}

// The bot's @username, which the guest's "Get reminders in Telegram" link needs.
// Asked of Telegram once and kept; a failed lookup is retried next time.
let botUsername = null;
export async function getBotUsername() {
  if (botUsername) return botUsername;
  const me = await callTelegram('getMe', {});
  botUsername = me?.username ?? null;
  return botUsername;
}

// Best-effort: a Telegram outage or bad config must never break the booking
// flow itself, so failures are logged, never thrown — which is also what lets
// the guest routes call this after answering, without awaiting it.
//
// A message that didn't get through because of the network or Telegram itself
// (no answer, a 5xx, a 429) is tried again a few times over ~12 minutes rather
// than lost — once, a new booking's message vanished on a single "fetch
// failed". A 4xx other than 429 won't fix itself, so it isn't retried.
const RETRY_DELAYS_MS = [5_000, 30_000, 2 * 60_000, 10 * 60_000];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function notifyTelegram(event) {
  try {
    const config = telegramConfig();
    if (!config) return;

    const text = formatMessage(event);
    if (!text) return;

    for (let attempt = 0; ; attempt += 1) {
      const { ok, status } = await callTelegramDetailed('sendMessage', { chat_id: config.chatId, text });
      if (ok) return;
      const retryable = status === null || status === 429 || status >= 500;
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) {
        console.error(`Telegram notification (${event.type}) not delivered after ${attempt + 1} attempt(s)`);
        return;
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  } catch (err) {
    console.error('Telegram notification failed:', err.message);
  }
}

// The buttons' callback data is "<answer>:<booking id>"; routes/telegram.js
// reads it back.
export const COMPLETION_ANSWERS = { done: 'completed', noshow: 'no_show' };

// Returns whether the question actually went out, so the caller can try again
// later if it didn't.
export async function askIfCompleted(booking) {
  const config = telegramConfig();
  if (!config) return false;

  const result = await callTelegram('sendMessage', {
    chat_id: config.chatId,
    text: formatMessage({ type: 'booking_ended', booking }),
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Завершено', callback_data: `done:${booking.id}` },
        { text: '🚫 Неявка', callback_data: `noshow:${booking.id}` },
      ]],
    },
  });
  return Boolean(result);
}

// Points Telegram at this server's webhook: button presses, and messages — a
// guest pressing Start on their reminders link arrives as a "/start <token>"
// message.
export async function registerWebhook(publicUrl) {
  const config = telegramConfig();
  if (!config) return;

  const url = `${publicUrl.replace(/\/$/, '')}/api/telegram/webhook`;
  const ok = await callTelegram('setWebhook', {
    url,
    secret_token: webhookSecret(config.token),
    allowed_updates: ['callback_query', 'message'],
  });
  if (ok) console.log(`Telegram webhook set to ${url}`);
}
