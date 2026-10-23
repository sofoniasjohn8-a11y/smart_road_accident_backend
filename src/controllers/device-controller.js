import { pool } from '../db/pool.js';
import { encryptToken, hashToken } from '../lib/token-encryption.js';

export async function registerDeviceToken(request, response) {
  const encrypted = encryptToken(request.validatedBody.token);
  const tokenHash = hashToken(request.validatedBody.token);
  await pool.query(
    `INSERT INTO worker_device_tokens (worker_id, token_encrypted, token_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (token_hash)
     DO UPDATE SET worker_id = EXCLUDED.worker_id, updated_at = NOW()`,
    [request.worker.id, encrypted, tokenHash]
  );
  return response.status(201).json({ message: 'Device token registered.' });
}

export async function unregisterDeviceToken(request, response) {
  await pool.query(
    'DELETE FROM worker_device_tokens WHERE worker_id = $1 AND token_hash = $2',
    [request.worker.id, hashToken(request.validatedBody.token)]
  );
  return response.status(204).end();
}
