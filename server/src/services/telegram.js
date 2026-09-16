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

// Best-effort: a Telegram outage or bad config must never break the booking
// flow itself, so failures are logged, not thrown.
export async function notifyTelegram(event) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return;
  }

  const text = formatMessage(event);
  if (!text) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (!res.ok) {
      console.error('Telegram notification failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Telegram notification failed:', err.message);
  }
}
