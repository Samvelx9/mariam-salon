import { Router, raw } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { cleanString, isValidDate, isValidTime } from '../lib/validate.js';
import { todayDateStr, addDaysToDateStr, localToUtc } from '../lib/time.js';
import { bookingShape, isValidHours } from '../lib/booking.js';
import {
  PROFILE_TEXT_COLUMNS,
  getProfileRow,
  shapeProfile,
  maxLengthFor,
  toCamel,
} from '../services/profile.js';

export const adminRouter = Router();

const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const EXCLUSION_VIOLATION = '23P01';
const BOOKING_STATUSES = ['confirmed', 'completed', 'cancelled', 'no_show'];
const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ---------------------------------------------------------------------------
// Auth (public)
// ---------------------------------------------------------------------------

adminRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const username = cleanString(req.body?.username, 100);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      return res.status(400).json({ error: 'missing_credentials' });
    }

    const { rows } = await pool.query(
      'SELECT username, password_hash FROM admin_user WHERE id = 1'
    );
    const admin = rows[0];

    const valid = admin ? await bcrypt.compare(password, admin.password_hash) : false;
    if (!admin || !valid || admin.username !== username) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const token = jwt.sign({ sub: 'admin', username }, process.env.JWT_SECRET, {
      expiresIn: '12h',
    });

    res.json({ token });
  })
);

adminRouter.use(requireAdminAuth);

// ---------------------------------------------------------------------------
// Salon profile (the guest landing page's content)
// ---------------------------------------------------------------------------

adminRouter.get(
  '/profile',
  asyncHandler(async (_req, res) => {
    const row = await getProfileRow();
    if (!row) {
      return res.status(404).json({ error: 'profile_not_found' });
    }
    res.json(shapeProfile(row));
  })
);

// Every field is optional and may legitimately be blank — this is free-form
// copy, not validated business data — so a field simply omitted from the body
// keeps its current value, and one sent empty is cleared.
adminRouter.put(
  '/profile',
  asyncHandler(async (req, res) => {
    const assignments = [];
    const values = [];

    for (const column of PROFILE_TEXT_COLUMNS) {
      const sent = req.body?.[toCamel(column)];
      if (sent === undefined) continue;
      values.push(cleanString(sent, maxLengthFor(column)));
      assignments.push(`${column} = $${values.length}`);
    }

    if (assignments.length === 0) {
      return res.status(400).json({ error: 'no_fields_to_update' });
    }

    assignments.push('updated_at = now()');
    await pool.query(`UPDATE salon_profile SET ${assignments.join(', ')} WHERE id = 1`, values);

    res.json(shapeProfile(await getProfileRow()));
  })
);

// The image arrives as a raw body with its own Content-Type rather than as
// multipart — one file, no other fields, so multipart would only add a
// dependency and a parsing step for nothing.
adminRouter.put(
  '/profile/photo',
  raw({ type: PHOTO_MIME_TYPES, limit: '4mb' }),
  asyncHandler(async (req, res) => {
    const mime = req.get('content-type');
    if (!Buffer.isBuffer(req.body) || req.body.length === 0 || !PHOTO_MIME_TYPES.includes(mime)) {
      return res.status(400).json({ error: 'invalid_image', accepts: PHOTO_MIME_TYPES });
    }

    await pool.query(
      `UPDATE salon_profile
       SET photo_mime = $1, photo_data = $2, photo_updated_at = now(), updated_at = now()
       WHERE id = 1`,
      [mime, req.body]
    );

    res.json(shapeProfile(await getProfileRow()));
  })
);

adminRouter.delete(
  '/profile/photo',
  asyncHandler(async (_req, res) => {
    await pool.query(
      `UPDATE salon_profile
       SET photo_mime = NULL, photo_data = NULL, photo_updated_at = NULL, updated_at = now()
       WHERE id = 1`
    );
    res.json(shapeProfile(await getProfileRow()));
  })
);

// ---------------------------------------------------------------------------
// Service categories
// ---------------------------------------------------------------------------

const CATEGORY_COLUMNS = `id, slug, name_en, name_ru, name_hy,
       description_en, description_ru, description_hy, sort_order, is_active, is_hourly`;

const SERVICE_COLUMNS = `id, category_id, slug, name_en, name_ru, name_hy,
       duration_minutes, price_amd, sort_order, is_active`;

// The same list plus the treatment's pricing mode, for the read-only listing.
const SERVICE_COLUMNS_WITH_MODE = `s.id, s.category_id, s.slug, s.name_en, s.name_ru, s.name_hy,
       s.duration_minutes, s.price_amd, s.sort_order, s.is_active, c.is_hourly`;

adminRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT ${CATEGORY_COLUMNS} FROM service_categories ORDER BY sort_order, id`
    );
    res.json(rows);
  })
);

adminRouter.post(
  '/categories',
  asyncHandler(async (req, res) => {
    const name_en = cleanString(req.body?.nameEn, 200);
    const name_ru = cleanString(req.body?.nameRu, 200);
    const name_hy = cleanString(req.body?.nameHy, 200);
    const slug = cleanString(req.body?.slug, 100) || slugify(name_en);

    if (!name_en || !name_ru || !name_hy || !slug) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    const sortOrder = Number(req.body?.sortOrder);
    try {
      const { rows } = await pool.query(
        `INSERT INTO service_categories
           (slug, name_en, name_ru, name_hy, description_en, description_ru, description_hy,
            sort_order, is_hourly)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${CATEGORY_COLUMNS}`,
        [
          slug,
          name_en,
          name_ru,
          name_hy,
          cleanString(req.body?.descriptionEn, 500),
          cleanString(req.body?.descriptionRu, 500),
          cleanString(req.body?.descriptionHy, 500),
          Number.isInteger(sortOrder) ? sortOrder : 0,
          Boolean(req.body?.isHourly),
        ]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) {
        return res.status(409).json({ error: 'slug_taken' });
      }
      throw err;
    }
  })
);

adminRouter.patch(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'invalid_category_id' });
    }

    const fields = [];
    const values = [];

    const nameKeys = { nameEn: 'name_en', nameRu: 'name_ru', nameHy: 'name_hy' };
    for (const [bodyKey, column] of Object.entries(nameKeys)) {
      if (req.body?.[bodyKey] === undefined) continue;
      const value = cleanString(req.body[bodyKey], 200);
      if (!value) return res.status(400).json({ error: `invalid_${bodyKey}` });
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    }

    const descriptionKeys = {
      descriptionEn: 'description_en',
      descriptionRu: 'description_ru',
      descriptionHy: 'description_hy',
    };
    for (const [bodyKey, column] of Object.entries(descriptionKeys)) {
      if (req.body?.[bodyKey] === undefined) continue;
      values.push(cleanString(req.body[bodyKey], 500));
      fields.push(`${column} = $${values.length}`);
    }

    if (req.body?.sortOrder !== undefined) {
      const sortOrder = Number(req.body.sortOrder);
      if (!Number.isInteger(sortOrder)) {
        return res.status(400).json({ error: 'invalid_sort_order' });
      }
      values.push(sortOrder);
      fields.push(`sort_order = $${values.length}`);
    }

    if (req.body?.isActive !== undefined) {
      values.push(Boolean(req.body.isActive));
      fields.push(`is_active = $${values.length}`);
    }

    if (req.body?.isHourly !== undefined) {
      values.push(Boolean(req.body.isHourly));
      fields.push(`is_hourly = $${values.length}`);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'no_fields_to_update' });
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE service_categories SET ${fields.join(', ')} WHERE id = $${values.length}
       RETURNING ${CATEGORY_COLUMNS}`,
      values
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'category_not_found' });
    }
    res.json(rows[0]);
  })
);

adminRouter.delete(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'invalid_category_id' });
    }

    try {
      const { rowCount } = await pool.query('DELETE FROM service_categories WHERE id = $1', [id]);
      if (rowCount === 0) {
        return res.status(404).json({ error: 'category_not_found' });
      }
      res.status(204).end();
    } catch (err) {
      if (err.code === FOREIGN_KEY_VIOLATION) {
        return res.status(409).json({
          error: 'category_has_services',
          hint: 'Move or delete this category\'s services first, or deactivate it instead.',
        });
      }
      throw err;
    }
  })
);

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

adminRouter.get(
  '/services',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT ${SERVICE_COLUMNS_WITH_MODE}
       FROM services s
       JOIN service_categories c ON c.id = s.category_id
       ORDER BY s.sort_order, s.id`
    );
    res.json(rows);
  })
);

adminRouter.post(
  '/services',
  asyncHandler(async (req, res) => {
    const name_en = cleanString(req.body?.nameEn, 200);
    const name_ru = cleanString(req.body?.nameRu, 200);
    const name_hy = cleanString(req.body?.nameHy, 200);
    const duration_minutes = Number(req.body?.durationMinutes);
    const price_amd = Number(req.body?.priceAmd);
    const category_id = Number(req.body?.categoryId);
    const sortOrder = Number(req.body?.sortOrder);
    const slug = cleanString(req.body?.slug, 100) || slugify(name_en);

    if (!name_en || !name_ru || !name_hy || !slug) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    if (!Number.isInteger(category_id)) {
      return res.status(400).json({ error: 'invalid_category' });
    }
    if (!Number.isInteger(duration_minutes) || duration_minutes <= 0) {
      return res.status(400).json({ error: 'invalid_duration' });
    }
    if (!Number.isInteger(price_amd) || price_amd < 0) {
      return res.status(400).json({ error: 'invalid_price' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO services
           (slug, category_id, name_en, name_ru, name_hy, duration_minutes, price_amd, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${SERVICE_COLUMNS}`,
        [
          slug,
          category_id,
          name_en,
          name_ru,
          name_hy,
          duration_minutes,
          price_amd,
          Number.isInteger(sortOrder) ? sortOrder : 0,
        ]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) {
        return res.status(409).json({ error: 'slug_taken' });
      }
      if (err.code === FOREIGN_KEY_VIOLATION) {
        return res.status(400).json({ error: 'invalid_category' });
      }
      throw err;
    }
  })
);

adminRouter.patch(
  '/services/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'invalid_service_id' });
    }

    const fields = [];
    const values = [];
    let paramIndex = 1;

    const fieldMap = {
      nameEn: 'name_en',
      nameRu: 'name_ru',
      nameHy: 'name_hy',
      categoryId: 'category_id',
      durationMinutes: 'duration_minutes',
      priceAmd: 'price_amd',
      sortOrder: 'sort_order',
      isActive: 'is_active',
    };

    for (const [bodyKey, column] of Object.entries(fieldMap)) {
      if (req.body?.[bodyKey] === undefined) continue;

      let value = req.body[bodyKey];
      if (column === 'name_en' || column === 'name_ru' || column === 'name_hy') {
        value = cleanString(value, 200);
        if (!value) return res.status(400).json({ error: `invalid_${bodyKey}` });
      } else if (column === 'duration_minutes') {
        value = Number(value);
        if (!Number.isInteger(value) || value <= 0) {
          return res.status(400).json({ error: 'invalid_duration' });
        }
      } else if (column === 'price_amd') {
        value = Number(value);
        if (!Number.isInteger(value) || value < 0) {
          return res.status(400).json({ error: 'invalid_price' });
        }
      } else if (column === 'category_id') {
        value = Number(value);
        if (!Number.isInteger(value)) {
          return res.status(400).json({ error: 'invalid_category' });
        }
      } else if (column === 'sort_order') {
        value = Number(value);
        if (!Number.isInteger(value)) {
          return res.status(400).json({ error: 'invalid_sort_order' });
        }
      } else if (column === 'is_active') {
        value = Boolean(value);
      }

      fields.push(`${column} = $${paramIndex}`);
      values.push(value);
      paramIndex += 1;
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'no_fields_to_update' });
    }

    values.push(id);
    let rows;
    try {
      ({ rows } = await pool.query(
        `UPDATE services SET ${fields.join(', ')} WHERE id = $${paramIndex}
         RETURNING ${SERVICE_COLUMNS}`,
        values
      ));
    } catch (err) {
      if (err.code === FOREIGN_KEY_VIOLATION) {
        return res.status(400).json({ error: 'invalid_category' });
      }
      throw err;
    }

    if (!rows[0]) {
      return res.status(404).json({ error: 'service_not_found' });
    }
    res.json(rows[0]);
  })
);

adminRouter.delete(
  '/services/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'invalid_service_id' });
    }

    try {
      const { rowCount } = await pool.query('DELETE FROM services WHERE id = $1', [id]);
      if (rowCount === 0) {
        return res.status(404).json({ error: 'service_not_found' });
      }
      res.status(204).end();
    } catch (err) {
      if (err.code === FOREIGN_KEY_VIOLATION) {
        return res.status(409).json({
          error: 'service_has_bookings',
          hint: 'Deactivate the service instead (PATCH isActive:false) to preserve booking history.',
        });
      }
      throw err;
    }
  })
);

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

const WEEKLY_COLUMNS = 'day_of_week, is_open, start_time, end_time, lunch_start, lunch_end';

// Shared by the single-day and whole-week endpoints: a day is either closed
// (times cleared) or open with a start before its end, optionally with a lunch
// break that has to sit inside those hours. Returns { error } or { values }.
function readWeeklyDay(body, dayOfWeek) {
  const isOpen = Boolean(body?.isOpen);
  if (!isOpen) return { values: [dayOfWeek, false, null, null, null, null] };

  const startTime = body?.startTime;
  const endTime = body?.endTime;
  if (!isValidTime(startTime) || !isValidTime(endTime) || startTime >= endTime) {
    return { error: 'invalid_hours' };
  }

  const hasLunch = Boolean(body?.hasLunch ?? (body?.lunchStart && body?.lunchEnd));
  if (!hasLunch) return { values: [dayOfWeek, true, startTime, endTime, null, null] };

  const lunchStart = body?.lunchStart;
  const lunchEnd = body?.lunchEnd;
  if (!isValidTime(lunchStart) || !isValidTime(lunchEnd) || lunchStart >= lunchEnd) {
    return { error: 'invalid_lunch' };
  }
  if (lunchStart < startTime || lunchEnd > endTime) {
    return { error: 'lunch_outside_hours' };
  }
  return { values: [dayOfWeek, true, startTime, endTime, lunchStart, lunchEnd] };
}

adminRouter.get(
  '/availability/weekly',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT ${WEEKLY_COLUMNS} FROM weekly_hours ORDER BY day_of_week`
    );
    res.json(rows);
  })
);

// The admin screen edits the whole week at once behind a single Save, so the
// seven rows go up together and land in one transaction — a week half-saved
// because the fourth row was invalid would be worse than no save at all.
adminRouter.put(
  '/availability/weekly',
  asyncHandler(async (req, res) => {
    const days = req.body?.days;
    if (!Array.isArray(days) || days.length === 0) {
      return res.status(400).json({ error: 'missing_days' });
    }

    const updates = [];
    const seen = new Set();
    for (const day of days) {
      const dayOfWeek = Number(day?.dayOfWeek);
      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || seen.has(dayOfWeek)) {
        return res.status(400).json({ error: 'invalid_day_of_week' });
      }
      seen.add(dayOfWeek);

      const parsed = readWeeklyDay(day, dayOfWeek);
      if (parsed.error) {
        return res.status(400).json({ error: parsed.error, dayOfWeek });
      }
      updates.push(parsed.values);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const values of updates) {
        const { rowCount } = await client.query(
          `UPDATE weekly_hours
           SET is_open = $2, start_time = $3, end_time = $4, lunch_start = $5, lunch_end = $6
           WHERE day_of_week = $1`,
          values
        );
        if (rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'day_not_found', dayOfWeek: values[0] });
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const { rows } = await pool.query(
      `SELECT ${WEEKLY_COLUMNS} FROM weekly_hours ORDER BY day_of_week`
    );
    res.json(rows);
  })
);

adminRouter.put(
  '/availability/weekly/:dayOfWeek',
  asyncHandler(async (req, res) => {
    const dayOfWeek = Number(req.params.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ error: 'invalid_day_of_week' });
    }

    const parsed = readWeeklyDay(req.body, dayOfWeek);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const { rows } = await pool.query(
      `UPDATE weekly_hours
       SET is_open = $2, start_time = $3, end_time = $4, lunch_start = $5, lunch_end = $6
       WHERE day_of_week = $1
       RETURNING ${WEEKLY_COLUMNS}`,
      parsed.values
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'day_not_found' });
    }
    res.json(rows[0]);
  })
);

adminRouter.get(
  '/availability/blocks',
  asyncHandler(async (req, res) => {
    const from = isValidDate(req.query.from) ? req.query.from : todayDateStr();
    const to = isValidDate(req.query.to) ? req.query.to : addDaysToDateStr(from, 365);

    const { rows } = await pool.query(
      `SELECT id, date, start_time, end_time, note FROM availability_blocks
       WHERE date BETWEEN $1 AND $2 ORDER BY date, start_time NULLS FIRST`,
      [from, to]
    );
    res.json(rows);
  })
);

adminRouter.post(
  '/availability/blocks',
  asyncHandler(async (req, res) => {
    const date = req.body?.date;
    const startTime = req.body?.startTime ?? null;
    const endTime = req.body?.endTime ?? null;
    const note = cleanString(req.body?.note, 300) || null;

    if (!isValidDate(date)) {
      return res.status(400).json({ error: 'invalid_date' });
    }
    if ((startTime === null) !== (endTime === null)) {
      return res.status(400).json({ error: 'provide_both_times_or_neither' });
    }
    if (startTime !== null && (!isValidTime(startTime) || !isValidTime(endTime) || startTime >= endTime)) {
      return res.status(400).json({ error: 'invalid_times' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO availability_blocks (date, start_time, end_time, note)
         VALUES ($1, $2, $3, $4)
         RETURNING id, date, start_time, end_time, note`,
        [date, startTime, endTime, note]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === CHECK_VIOLATION) {
        return res.status(400).json({ error: 'invalid_times' });
      }
      throw err;
    }
  })
);

adminRouter.delete(
  '/availability/blocks/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'invalid_block_id' });
    }

    const { rowCount } = await pool.query('DELETE FROM availability_blocks WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'block_not_found' });
    }
    res.status(204).end();
  })
);

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

adminRouter.get(
  '/bookings',
  asyncHandler(async (req, res) => {
    const from = isValidDate(req.query.from) ? req.query.from : addDaysToDateStr(todayDateStr(), -30);
    const to = isValidDate(req.query.to) ? req.query.to : addDaysToDateStr(todayDateStr(), 60);
    const status = req.query.status;

    if (status && !BOOKING_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'invalid_status' });
    }

    const rangeStart = localToUtc(from, '00:00');
    const rangeEnd = localToUtc(addDaysToDateStr(to, 1), '00:00');

    const params = [rangeStart, rangeEnd];
    let query = `
      SELECT b.id, b.service_id, b.start_time, b.end_time, b.customer_name, b.customer_phone,
             b.status, b.price_at_booking, s.name_en, s.name_ru, s.name_hy
      FROM bookings b
      JOIN services s ON s.id = b.service_id
      WHERE b.start_time >= $1 AND b.start_time < $2`;

    if (status) {
      params.push(status);
      query += ` AND b.status = $3`;
    }
    query += ' ORDER BY b.start_time ASC';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  })
);

// A booking Mariam takes herself — over the phone, or a walk-in she's writing
// down after the fact. Deliberately looser than the guest flow: no 90-minute
// cutoff and no opening-hours check, because she is allowed to squeeze someone
// in early, late, or on a day the salon is normally shut. The one rule that
// still holds is the overlap constraint — two clients can't share a slot — and
// that is enforced by the database, not here.
adminRouter.post(
  '/bookings',
  asyncHandler(async (req, res) => {
    const serviceId = Number(req.body?.serviceId);
    const date = req.body?.date;
    const time = req.body?.time;
    const customerName = cleanString(req.body?.customerName, 100);
    const customerPhone = cleanString(req.body?.customerPhone, 30);
    const status = req.body?.status ?? 'confirmed';

    if (!Number.isInteger(serviceId) || !isValidDate(date) || !isValidTime(time)) {
      return res.status(400).json({ error: 'invalid_request' });
    }
    if (!customerName || !customerPhone) {
      return res.status(400).json({ error: 'missing_customer_details' });
    }
    if (!BOOKING_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'invalid_status' });
    }

    const { rows: serviceRows } = await pool.query(
      `SELECT s.id, s.duration_minutes, s.price_amd, c.is_hourly
       FROM services s
       JOIN service_categories c ON c.id = s.category_id
       WHERE s.id = $1`,
      [serviceId]
    );
    const service = serviceRows[0];
    if (!service) {
      return res.status(404).json({ error: 'service_not_found' });
    }

    const hours = req.body?.hours === undefined ? 1 : Number(req.body.hours);
    if (service.is_hourly && !isValidHours(hours)) {
      return res.status(400).json({ error: 'invalid_hours' });
    }
    const { durationMinutes, price } = bookingShape(service, hours);

    const startTime = localToUtc(date, time);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60_000);

    try {
      const { rows } = await pool.query(
        `INSERT INTO bookings
           (service_id, start_time, end_time, customer_name, customer_phone, status, price_at_booking)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, service_id, start_time, end_time, customer_name, customer_phone,
                   status, price_at_booking`,
        [serviceId, startTime, endTime, customerName, customerPhone, status, price]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === EXCLUSION_VIOLATION) {
        return res.status(409).json({ error: 'slot_taken' });
      }
      throw err;
    }
  })
);

// Bulk delete, for clearing out cancelled bookings without picking them off one
// at a time. Only cancelled rows can go: a confirmed booking is a commitment and
// a completed one is a line in the financial history, so both are refused here —
// mark a booking cancelled first if it really needs deleting.
adminRouter.delete(
  '/bookings',
  asyncHandler(async (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'missing_ids' });
    }
    if (ids.length > 500) {
      return res.status(400).json({ error: 'too_many_ids' });
    }
    const numericIds = ids.map(Number);
    if (numericIds.some((id) => !Number.isInteger(id))) {
      return res.status(400).json({ error: 'invalid_booking_id' });
    }

    const { rows } = await pool.query(
      `DELETE FROM bookings WHERE id = ANY($1::int[]) AND status = 'cancelled'
       RETURNING id`,
      [numericIds]
    );

    // Anything the caller asked for that isn't in the result was either already
    // gone or isn't cancelled — reported back rather than silently ignored.
    const deleted = new Set(rows.map((r) => r.id));
    res.json({
      deleted: deleted.size,
      skipped: numericIds.filter((id) => !deleted.has(id)),
    });
  })
);

adminRouter.patch(
  '/bookings/:id/status',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const status = req.body?.status;

    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'invalid_booking_id' });
    }
    if (!BOOKING_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'invalid_status' });
    }

    const { rows } = await pool.query(
      `UPDATE bookings SET status = $2 WHERE id = $1
       RETURNING id, status, start_time, end_time`,
      [id, status]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'booking_not_found' });
    }
    res.json(rows[0]);
  })
);

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

adminRouter.get(
  '/expenses',
  asyncHandler(async (req, res) => {
    const from = isValidDate(req.query.from) ? req.query.from : addDaysToDateStr(todayDateStr(), -90);
    const to = isValidDate(req.query.to) ? req.query.to : todayDateStr();
    const category = req.query.category ? cleanString(req.query.category, 100) : null;

    const params = [from, to];
    let query = `SELECT id, category, description, amount_amd, date FROM expenses
                  WHERE date BETWEEN $1 AND $2`;
    if (category) {
      params.push(category);
      query += ` AND category = $3`;
    }
    query += ' ORDER BY date DESC, id DESC';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  })
);

adminRouter.get(
  '/expenses/categories',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT category, MAX(date) AS last_used FROM expenses
       GROUP BY category ORDER BY last_used DESC LIMIT 50`
    );
    res.json(rows.map((r) => r.category));
  })
);

adminRouter.post(
  '/expenses',
  asyncHandler(async (req, res) => {
    const category = cleanString(req.body?.category, 100);
    const description = cleanString(req.body?.description, 300) || null;
    const amount_amd = Number(req.body?.amountAmd);
    const date = req.body?.date;

    if (!category) {
      return res.status(400).json({ error: 'missing_category' });
    }
    if (!Number.isInteger(amount_amd) || amount_amd <= 0) {
      return res.status(400).json({ error: 'invalid_amount' });
    }
    if (!isValidDate(date)) {
      return res.status(400).json({ error: 'invalid_date' });
    }

    const { rows } = await pool.query(
      `INSERT INTO expenses (category, description, amount_amd, date)
       VALUES ($1, $2, $3, $4)
       RETURNING id, category, description, amount_amd, date`,
      [category, description, amount_amd, date]
    );
    res.status(201).json(rows[0]);
  })
);

// An expense is a note to self, not a record anyone else relies on, so a typo
// is corrected or the whole row dropped. Each field is optional; one left out
// keeps its current value.
adminRouter.patch(
  '/expenses/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'invalid_expense_id' });
    }

    const fields = [];
    const values = [];

    if (req.body?.category !== undefined) {
      const category = cleanString(req.body.category, 100);
      if (!category) return res.status(400).json({ error: 'missing_category' });
      values.push(category);
      fields.push(`category = $${values.length}`);
    }
    if (req.body?.description !== undefined) {
      values.push(cleanString(req.body.description, 300) || null);
      fields.push(`description = $${values.length}`);
    }
    if (req.body?.amountAmd !== undefined) {
      const amount = Number(req.body.amountAmd);
      if (!Number.isInteger(amount) || amount <= 0) {
        return res.status(400).json({ error: 'invalid_amount' });
      }
      values.push(amount);
      fields.push(`amount_amd = $${values.length}`);
    }
    if (req.body?.date !== undefined) {
      if (!isValidDate(req.body.date)) {
        return res.status(400).json({ error: 'invalid_date' });
      }
      values.push(req.body.date);
      fields.push(`date = $${values.length}`);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'no_fields_to_update' });
    }

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE expenses SET ${fields.join(', ')} WHERE id = $${values.length}
       RETURNING id, category, description, amount_amd, date`,
      values
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'expense_not_found' });
    }
    res.json(rows[0]);
  })
);

adminRouter.delete(
  '/expenses/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'invalid_expense_id' });
    }

    const { rowCount } = await pool.query('DELETE FROM expenses WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'expense_not_found' });
    }
    res.status(204).end();
  })
);

// ---------------------------------------------------------------------------
// Financials
// ---------------------------------------------------------------------------

adminRouter.get(
  '/financials',
  asyncHandler(async (req, res) => {
    const today = todayDateStr();
    const from = isValidDate(req.query.from) ? req.query.from : `${today.slice(0, 7)}-01`;
    const to = isValidDate(req.query.to) ? req.query.to : today;

    const { rows: incomeByService } = await pool.query(
      `SELECT s.id AS service_id, s.name_en, s.name_ru, s.name_hy,
              COALESCE(SUM(b.price_at_booking), 0) AS total, COUNT(b.id) AS count
       FROM bookings b
       JOIN services s ON s.id = b.service_id
       WHERE b.status = 'completed'
         AND (b.start_time AT TIME ZONE '+04:00')::date BETWEEN $1 AND $2
       GROUP BY s.id, s.name_en, s.name_ru, s.name_hy
       ORDER BY total DESC`,
      [from, to]
    );

    const { rows: expensesByCategory } = await pool.query(
      `SELECT category, COALESCE(SUM(amount_amd), 0) AS total, COUNT(*) AS count
       FROM expenses
       WHERE date BETWEEN $1 AND $2
       GROUP BY category
       ORDER BY total DESC`,
      [from, to]
    );

    const byService = incomeByService.map((row) => ({
      ...row,
      total: Number(row.total),
      count: Number(row.count),
    }));
    const byCategory = expensesByCategory.map((row) => ({
      ...row,
      total: Number(row.total),
      count: Number(row.count),
    }));

    const incomeTotal = byService.reduce((sum, row) => sum + row.total, 0);
    const expensesTotal = byCategory.reduce((sum, row) => sum + row.total, 0);
    const bookingsCompleted = byService.reduce((sum, row) => sum + row.count, 0);

    res.json({
      period: { from, to },
      income: { total: incomeTotal, byService },
      expenses: { total: expensesTotal, byCategory },
      net: incomeTotal - expensesTotal,
      bookingsCompleted,
    });
  })
);
