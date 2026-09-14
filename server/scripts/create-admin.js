// Provisions (or resets) the single admin_user row. There is no signup
// endpoint on purpose — this app has exactly one admin.
//
// Usage: npm run create-admin -- <username> <password>

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const [username, password] = process.argv.slice(2);

if (!username || !password) {
  console.error('Usage: npm run create-admin -- <username> <password>');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 12);

await pool.query(
  `INSERT INTO admin_user (id, username, password_hash)
   VALUES (1, $1, $2)
   ON CONFLICT (id) DO UPDATE SET username = $1, password_hash = $2`,
  [username, passwordHash]
);

console.log(`Admin user "${username}" saved.`);
await pool.end();
