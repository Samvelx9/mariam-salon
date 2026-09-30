import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { guestRouter } from './routes/guest.js';
import { adminRouter } from './routes/admin.js';
import { telegramRouter } from './routes/telegram.js';
import { registerWebhook, telegramConfig } from './services/telegram.js';
import { startCompletionPrompts } from './services/completionPrompts.js';
import { startGuestReminders } from './services/guestNotifications.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'unreachable', message: err.message });
  }
});

app.use('/api/telegram', telegramRouter);
app.use('/api', guestRouter);
app.use('/api/admin', adminRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);

  // The "did the visit happen?" questions and the guests' reminders need
  // Telegram to be able to reach this server with the answers, so they only run
  // where PUBLIC_URL says it can — the deployed backend, not a dev machine that
  // happens to have the bot token in its .env.
  const publicUrl = process.env.PUBLIC_URL;
  if (publicUrl && telegramConfig()) {
    registerWebhook(publicUrl);
    startCompletionPrompts();
    startGuestReminders();
  }
});
