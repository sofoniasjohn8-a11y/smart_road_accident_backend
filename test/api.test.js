import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { config } from '../src/config.js';
import { requireRegistrationSecret } from '../src/middleware/registration-auth.js';
import { newIncidentBody, registrationBody } from '../src/validation/schemas.js';

test('accident ingestion rejects requests without device authentication', async () => {
  const response = await request(app).post('/api/accidents').send({
    deviceId: 'ROAD_DEVICE_001',
    eventType: 'SUSPECTED_ACCIDENT',
    latitude: 11.5942,
    longitude: 37.3908,
    status: 'PENDING',
    source: 'WOKWI_SIMULATION'
  });
  assert.equal(response.status, 401);
  assert.match(response.body.error, /device authentication/i);
});

test('worker incident and device endpoints reject missing bearer tokens', async () => {
  const cases = [
    request(app).get('/api/accidents'),
    request(app).get('/api/accidents/98637f94-b775-41d0-aeac-5b89bdacb645'),
    request(app).patch('/api/accidents/98637f94-b775-41d0-aeac-5b89bdacb645/status')
      .send({ status: 'ACKNOWLEDGED' }),
    request(app).post('/api/workers/me/devices').send({ token: 'a'.repeat(30) }),
    request(app).delete('/api/workers/me/devices').send({ token: 'a'.repeat(30) })
  ];
  const responses = await Promise.all(cases);
  for (const response of responses) {
    assert.equal(response.status, 401);
  }
});

test('incident validation rejects out-of-range coordinates and client status changes', () => {
  const baseReport = {
    deviceId: 'ROAD_DEVICE_001',
    eventType: 'SUSPECTED_ACCIDENT',
    latitude: 11.5942,
    longitude: 37.3908,
    source: 'WOKWI_SIMULATION'
  };
  assert.equal(newIncidentBody.safeParse(baseReport).success, true);
  assert.equal(
    newIncidentBody.safeParse({ ...baseReport, latitude: 91 }).success,
    false
  );
  assert.equal(
    newIncidentBody.safeParse({ ...baseReport, status: 'RESOLVED' }).success,
    false
  );
});

test('worker registration requires a valid email and a 12-character password', () => {
  assert.equal(
    registrationBody.safeParse({ email: 'Worker@example.com', password: 'a-secure-password' }).success,
    true
  );
  assert.equal(
    registrationBody.safeParse({ email: 'not-an-email', password: 'short' }).success,
    false
  );
});

test('worker registration does not proceed without registration authorization', async () => {
  const response = await request(app)
    .post('/api/auth/register')
    .set('X-Forwarded-For', '198.51.100.10')
    .send({
      email: 'worker@example.com',
      password: 'a-secure-password'
    });
  if (config.WORKER_REGISTRATION_SECRET) {
    assert.equal(response.status, 401);
    assert.match(response.body.error, /registration authorization is required/i);
  } else {
    assert.equal(response.status, 503);
    assert.match(response.body.error, /registration is not enabled/i);
  }
});

test('worker registration authorization accepts only the configured secret', () => {
  const originalSecret = config.WORKER_REGISTRATION_SECRET;
  const secret = 'test-registration-secret-that-is-long-enough';
  config.WORKER_REGISTRATION_SECRET = secret;
  try {
    const authenticate = (providedSecret) => {
      let error;
      requireRegistrationSecret(
        { get: () => providedSecret },
        null,
        (nextError) => { error = nextError; }
      );
      return error;
    };

    assert.equal(authenticate(secret), undefined);
    assert.equal(authenticate(`${secret}wrong`).status, 401);
  } finally {
    config.WORKER_REGISTRATION_SECRET = originalSecret;
  }
});
