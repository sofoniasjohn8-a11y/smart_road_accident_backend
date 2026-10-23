import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../src/db/pool.js';

const input = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(200)
});

try {
  const { email, password } = input.parse({
    email: process.env.WORKER_EMAIL,
    password: process.env.WORKER_PASSWORD
  });
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    'INSERT INTO workers (email, password_hash) VALUES ($1, $2)',
    [email, passwordHash]
  );
  console.log(`Created worker account: ${email}`);
} catch (error) {
  console.error('Could not create worker:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
