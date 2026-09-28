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

  if (event.type === 'booking_cancelled') {
    return (
      `❌ Отмена записи\n` +
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

// One Bot API call. Returns the parsed result, or null (logged) on any failure —
// Telegram being down must never break whatever called it.
export async function callTelegram(method, body) {
  const config = telegramConfig();
  if (!config) return null;

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
      return null;
    }
    return (await res.json()).result ?? true;
  } catch (err) {
    console.error(`Telegram ${method} failed:`, err.message);
    return null;
  }
}

// Best-effort: a Telegram outage or bad config must never break the booking
// flow itself, so failures are logged, never thrown — which is also what lets
// the guest routes call this after answering, without awaiting it.
export async function notifyTelegram(event) {
  try {
    const config = telegramConfig();
    if (!config) return;

    const text = formatMessage(event);
    if (!text) return;

    await callTelegram('sendMessage', { chat_id: config.chatId, text });
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

// Points Telegram at this server's webhook. Only button presses are asked for —
// messages typed to the bot aren't something the app acts on.
export async function registerWebhook(publicUrl) {
  const config = telegramConfig();
  if (!config) return;

  const url = `${publicUrl.replace(/\/$/, '')}/api/telegram/webhook`;
  const ok = await callTelegram('setWebhook', {
    url,
    secret_token: webhookSecret(config.token),
    allowed_updates: ['callback_query'],
  });
  if (ok) console.log(`Telegram webhook set to ${url}`);
}
