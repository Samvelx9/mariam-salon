import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { pool } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  callTelegram,
  telegramConfig,
  webhookSecret,
  COMPLETION_ANSWERS,
} from '../services/telegram.js';
import { handleGuestCallback, handleGuestMessage } from '../services/guestNotifications.js';

export const telegramRouter = Router();

const STATUS_LABELS = {
  confirmed: 'подтверждена',
  completed: 'завершена',
  cancelled: 'отменена',
  no_show: 'неявка',
};

function hasValidSecret(req, token) {
  const expected = Buffer.from(webhookSecret(token));
  const given = Buffer.from(String(req.get('X-Telegram-Bot-Api-Secret-Token') ?? ''));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Everything Telegram sends the bot arrives here. Three kinds of update matter:
//
// - a button on one of a guest's reminders (callback data "g:…") — see
//   services/guestNotifications.js;
// - a message to the bot, which is how a guest's "/start <token>" opt-in
//   arrives — also guestNotifications.js. From Mariam's own chat only a
//   "/start <token>" counts (she may well try the link herself); anything
//   else she types would just get the "I can't pass this on" reply;
// - Mariam's answer to "⏰ Процедура завершилась?", below.
//
// Mariam's answer to "⏰ Процедура завершилась?": the status only moves while
// the booking is still `confirmed`: if she has already set it in the admin
// panel, or the visit was cancelled, a late tap doesn't overwrite that. Either
// way the buttons are replaced with what the booking now is, so the message
// can't be answered twice.
telegramRouter.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const config = telegramConfig();
    if (!config || !hasValidSecret(req, config.token)) {
      return res.sendStatus(401);
    }

    const incoming = req.body?.message;
    if (incoming) {
      const fromMariam = String(incoming.chat?.id) === String(config.chatId);
      if (!fromMariam || /^\/start\s+\S/.test(String(incoming.text ?? ''))) {
        await handleGuestMessage(incoming);
      }
      return res.sendStatus(200);
    }

    const query = req.body?.callback_query;
    const message = query?.message;
    if (query && message && String(query.data ?? '').startsWith('g:')) {
      await handleGuestCallback(query);
      return res.sendStatus(200);
    }
    // Only buttons pressed in Mariam's own chat count.
    if (!query || !message || String(message.chat?.id) !== String(config.chatId)) {
      return res.sendStatus(200);
    }

    const [answer, rawId] = String(query.data ?? '').split(':');
    const status = COMPLETION_ANSWERS[answer];
    const id = Number(rawId);
    if (!status || !Number.isInteger(id)) {
      await callTelegram('answerCallbackQuery', { callback_query_id: query.id });
      return res.sendStatus(200);
    }

    const { rows: updated } = await pool.query(
      `UPDATE bookings SET status = $2 WHERE id = $1 AND status = 'confirmed' RETURNING status`,
      [id, status]
    );
    let outcome;
    if (updated[0]) {
      outcome = status === 'completed' ? '✅ Отмечено: завершено' : '🚫 Отмечено: неявка';
    } else {
      const { rows } = await pool.query('SELECT status FROM bookings WHERE id = $1', [id]);
      outcome = rows[0]
        ? `ℹ️ Не изменено — запись уже ${STATUS_LABELS[rows[0].status] ?? rows[0].status}`
        : 'ℹ️ Запись удалена';
    }

    await callTelegram('answerCallbackQuery', { callback_query_id: query.id, text: outcome });
    // Editing the text without a reply_markup is also what removes the buttons.
    await callTelegram('editMessageText', {
      chat_id: message.chat.id,
      message_id: message.message_id,
      text: `${message.text ?? ''}\n\n${outcome}`,
    });

    res.sendStatus(200);
  })
);
