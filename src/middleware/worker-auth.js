import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { HttpError } from '../lib/http-error.js';

export async function requireWorker(request, _response, next) {
  const authorization = request.get('authorization') ?? '';
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Bearer authentication is required.'));
  }

  let claims;
  try {
    claims = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof claims.sub !== 'string' || claims.role !== 'worker') {
      throw new Error('Invalid token claims.');
    }
  } catch {
    return next(new HttpError(401, 'Access token is invalid or expired.'));
  }

  const { rows } = await pool.query(
    'SELECT id, email FROM workers WHERE id = $1 AND active = TRUE',
    [claims.sub]
  );
  if (!rows[0]) return next(new HttpError(401, 'Worker account is inactive or unavailable.'));
  request.worker = { id: rows[0].id, email: rows[0].email };
  return next();
}
