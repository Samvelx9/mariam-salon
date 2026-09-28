import { pool } from '../db.js';
import { getBookingWithItems } from './bookings.js';
import { askIfCompleted } from './telegram.js';

const CHECK_EVERY_MS = 60_000;

// Once a confirmed visit's booked time has run out, Mariam is asked on Telegram
// whether it happened; her answer comes back through routes/telegram.js.
//
// The check reads the database rather than keeping a timer per booking, so a
// restart or a deploy only delays a question, never loses one.
//
// `completion_asked_at` records when she was asked. A booking is due when it
// has ended and she hasn't been asked since it ended — so a visit moved to a
// later time after she was asked is asked about again at its new end. Only the
// last day is considered, so a visit she writes in after the fact as
// `confirmed` gets one question, and a Telegram outage doesn't turn into a
// backlog of old ones.
async function claimDueBookings() {
  const { rows } = await pool.query(
    `UPDATE bookings SET completion_asked_at = now()
      WHERE id IN (
        SELECT id FROM bookings
         WHERE status = 'confirmed'
           AND end_time <= now()
           AND end_time > now() - interval '1 day'
           AND (completion_asked_at IS NULL OR completion_asked_at < end_time)
         ORDER BY end_time
         LIMIT 20
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id`
  );
  return rows.map((r) => r.id);
}

async function checkOnce() {
  const ids = await claimDueBookings();
  for (const id of ids) {
    const booking = await getBookingWithItems(id);
    if (!booking) continue;
    if (!(await askIfCompleted(booking))) {
      // Not sent, so it's handed back to the next check to try again.
      await pool.query('UPDATE bookings SET completion_asked_at = NULL WHERE id = $1', [id]);
    }
  }
}

export function startCompletionPrompts() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await checkOnce();
    } catch (err) {
      console.error('Completion prompt check failed:', err.message);
    } finally {
      running = false;
    }
  };
  setInterval(tick, CHECK_EVERY_MS);
  tick();
}
