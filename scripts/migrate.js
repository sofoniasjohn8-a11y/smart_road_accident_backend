import { readFile } from 'node:fs/promises';
import { pool } from '../src/db/pool.js';

try {
  const schema = await readFile(new URL('../src/db/schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  console.log('Database schema is up to date.');
} catch (error) {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
