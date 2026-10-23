import { pool } from '../db/pool.js';
import { HttpError } from '../lib/http-error.js';
import { notifyWorkers } from '../services/notifications.js';

export async function health(_request, response) {
  try {
    await pool.query('SELECT 1');
    return response.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('Health check database query failed:', error);
    return response.status(503).json({ status: 'error', database: 'unavailable' });
  }
}

export async function createIncident(request, response) {
  const incidentInput = request.validatedBody;
  if (incidentInput.deviceId !== request.authenticatedDeviceId) {
    throw new HttpError(400, 'deviceId must match the authenticated device.');
  }
  const { rows } = await pool.query(
    `INSERT INTO incidents
      (device_id, event_type, latitude, longitude, status, source, notes)
     VALUES ($1, $2, $3, $4, 'PENDING', $5, $6)
     RETURNING id, device_id, event_type, latitude, longitude, status, source,
               created_at, notes, updated_at`,
    [
      incidentInput.deviceId,
      incidentInput.eventType,
      incidentInput.latitude,
      incidentInput.longitude,
      incidentInput.source,
      incidentInput.notes ?? null
    ]
  );
  const incident = rows[0];
  const notification = await notifyWorkers(incident);
  return response.status(201).json({ incident, notification });
}

export async function listIncidents(request, response) {
  const { status } = request.validatedQuery;
  const query = status
    ? pool.query(
        `SELECT id, device_id, event_type, latitude, longitude, status, source,
                created_at, notes, updated_at
         FROM incidents WHERE status = $1 ORDER BY created_at DESC`,
        [status]
      )
    : pool.query(
        `SELECT id, device_id, event_type, latitude, longitude, status, source,
                created_at, notes, updated_at
         FROM incidents ORDER BY created_at DESC`
      );
  const { rows } = await query;
  return response.json({ incidents: rows });
}

export async function getIncident(request, response) {
  const { id } = request.validatedParams;
  const { rows } = await pool.query(
    `SELECT id, device_id, event_type, latitude, longitude, status, source,
            created_at, notes, updated_at
     FROM incidents WHERE id = $1`,
    [id]
  );
  if (!rows[0]) throw new HttpError(404, 'Incident not found.');
  return response.json({ incident: rows[0] });
}

export async function updateIncidentStatus(request, response) {
  const { id } = request.validatedParams;
  const { status, notes } = request.validatedBody;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT id, status FROM incidents WHERE id = $1 FOR UPDATE',
      [id]
    );
    const current = result.rows[0];
    if (!current) throw new HttpError(404, 'Incident not found.');

    const allowedNextStatus = {
      PENDING: 'ACKNOWLEDGED',
      ACKNOWLEDGED: 'RESOLVED'
    }[current.status];
    if (status !== allowedNextStatus) {
      throw new HttpError(409, `Cannot change incident from ${current.status} to ${status}.`);
    }

    const { rows } = await client.query(
      `UPDATE incidents
       SET status = $1,
           notes = COALESCE($2, notes),
           acknowledged_by = CASE WHEN $1 = 'ACKNOWLEDGED' THEN $3 ELSE acknowledged_by END,
           resolved_by = CASE WHEN $1 = 'RESOLVED' THEN $3 ELSE resolved_by END,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, device_id, event_type, latitude, longitude, status, source,
                 created_at, notes, updated_at, acknowledged_by, resolved_by`,
      [status, notes ?? null, request.worker.id, id]
    );
    await client.query('COMMIT');
    return response.json({ incident: rows[0] });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to roll back incident status transaction:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}
