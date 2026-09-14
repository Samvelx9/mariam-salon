import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { guestRouter } from './routes/guest.js';
import { adminRouter } from './routes/admin.js';

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
});
