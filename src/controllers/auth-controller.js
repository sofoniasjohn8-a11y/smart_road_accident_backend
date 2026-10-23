import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { HttpError } from '../lib/http-error.js';

export async function login(request, response) {
  const { email, password } = request.validatedBody;
  const { rows } = await pool.query(
    'SELECT id, email, password_hash, active FROM workers WHERE email = $1',
    [email]
  );
  const worker = rows[0];
  const matches = worker ? await bcrypt.compare(password, worker.password_hash) : false;
  if (!matches || !worker.active) {
    throw new HttpError(401, 'Email or password is incorrect.');
  }

  const accessToken = jwt.sign(
    { role: 'worker', email: worker.email },
    config.JWT_SECRET,
    { subject: worker.id, expiresIn: config.JWT_EXPIRES_IN, algorithm: 'HS256' }
  );
  return response.json({
    accessToken,
    tokenType: 'Bearer',
    expiresIn: config.JWT_EXPIRES_IN,
    worker: { id: worker.id, email: worker.email }
  });
}
