import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { app } from '../src/app.js';
import { signDeviceRequest } from '../src/middleware/device-auth.js';
import { config } from '../src/config.js';

const { Pool } = pg;
const connectionString = process.env.TEST_DATABASE_URL;
const integrationPool = connectionString ? new Pool({ connectionString }) : null;

before(async () => {
  if (!integrationPool) return;
  const schema = await readFile(new URL('../src/db/schema.sql', import.meta.url), 'utf8');
  await integrationPool.query(schema);
});

after(async () => {
  await integrationPool?.end();
});

test('Wokwi report is inserted into PostgreSQL', { skip: !integrationPool }, async () => {
  const deviceId = 'ROAD_DEVICE_001';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(18).toString('base64url');
  const body = {
    deviceId,
    eventType: 'SUSPECTED_ACCIDENT',
    latitude: 11.5942,
    longitude: 37.3908,
    status: 'PENDING',
    source: 'WOKWI_SIMULATION'
  };
  // Must stay a string: superagent re-serializes a Buffer body, which would send
  // different bytes than the ones the signature was computed over.
  const rawBody = JSON.stringify(body);
  const secret = config.deviceApiKeys[deviceId];
  assert.ok(secret && secret.length >= 32, 'Set TEST_DEVICE_SECRET (32+ chars).');

  const response = await request(app)
    .post('/api/accidents')
    .set('Content-Type', 'application/json')
    .set('X-Device-Id', deviceId)
    .set('X-Device-Timestamp', timestamp)
    .set('X-Device-Nonce', nonce)
    .set('X-Device-Signature', signDeviceRequest(secret, timestamp, nonce, rawBody))
    .send(rawBody);

  assert.equal(response.status, 201, JSON.stringify(response.body));
  const incidentId = response.body.incident.id;
  try {
    assert.equal(response.body.incident.device_id, deviceId);
    assert.equal(response.body.incident.status, 'PENDING');
    const stored = await integrationPool.query(
      'SELECT id, created_at FROM incidents WHERE id = $1',
      [incidentId]
    );
    assert.equal(stored.rowCount, 1);
    assert.ok(stored.rows[0].created_at);
  } finally {
    await integrationPool.query('DELETE FROM incidents WHERE id = $1', [incidentId]);
  }
});
