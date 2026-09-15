import { formatYerevanDateTime } from '../lib/formatMessageTime.js';
import { formatDuration } from '../lib/booking.js';

function formatMessage(event) {
  const { booking } = event;
  const serviceName = event.service?.name_ru ?? booking.name_ru;
  const when = formatYerevanDateTime(new Date(booking.start_time));
  // An hourly treatment is booked for a length the guest chose, so the message
  // has to say how long — otherwise Mariam can't tell a one-hour electrolysis
  // session from a three-hour one.
  const duration = event.service?.is_hourly && event.durationMinutes
    ? `Длительность: ${formatDuration(event.durationMinutes, 'ч', 'мин')}\n`
    : '';

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

  if (event.type === 'booking_cancelled') {
    return (
      `❌ Отмена записи\n` +
      `Услуга: ${serviceName}\n` +
      `Дата: ${when}\n` +
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
