# Smart Road Accident Detection Backend

Academic prototype backend using Node.js, Express, PostgreSQL, and optional Firebase Cloud Messaging (FCM). It accepts signed simulated device reports, stores them in PostgreSQL, and gives authenticated response workers an API to review and update incidents.

> This is not a certified emergency dispatch service. Coordinates from Wokwi are demo values, and notification delivery is best-effort. Do not use this prototype as the only means of reporting a real emergency.

## Implemented features

- PostgreSQL schema and migration script for incidents, workers, and encrypted worker FCM tokens.
- Health check, signed device report ingestion, worker login, incident list/detail/status endpoints.
- Worker-only authorization for incident reads, status changes, and Android token registration.
- Allowed status transitions: `PENDING` → `ACKNOWLEDGED` → `RESOLVED`.
- Latitude/longitude, field size, request size, body, query, and UUID validation.
- Helmet, explicit-origin CORS, rate limits, parameterized SQL, centralized errors, and status-change transactions.
- Optional Firebase push notifications after a successful incident insert.
- `node:test` tests and a PostgreSQL-backed Wokwi report integration test.

## Not implemented / prototype limitations

- No automatic account enrollment, password reset, refresh tokens, role hierarchy, incident pagination, dispatch escalation, or guaranteed notification retries.
- Device HMAC replay protection is held in process memory. Run a single API instance for the prototype; use shared storage (for example Redis) and a persistent nonce/idempotency strategy before running multiple instances.
- Secrets embedded in ESP32 firmware are extractable. HMAC plus TLS and rate limits discourage casual abuse, but this alone is not strong device identity. Use per-device revocable credentials and a provisioning/rotation process for a real deployment.
- There is no live GPS validation. Wokwi sample coordinates remain demonstration data.
- Database migrations are an initial idempotent schema, not a versioned migration framework.

## Folder structure

```text
.
├── .env.example
├── .gitignore
├── package.json
├── README.md
├── postman/
│   └── Smart-Road-Accident-API.postman_collection.json
├── scripts/
│   ├── create-worker.js
│   └── migrate.js
├── src/
│   ├── app.js
│   ├── config.js
│   ├── server.js
│   ├── controllers/
│   │   ├── accident-controller.js
│   │   ├── auth-controller.js
│   │   └── device-controller.js
│   ├── db/
│   │   ├── pool.js
│   │   └── schema.sql
│   ├── lib/
│   │   ├── http-error.js
│   │   └── token-encryption.js
│   ├── middleware/
│   │   ├── device-auth.js
│   │   ├── error-handler.js
│   │   ├── validate.js
│   │   └── worker-auth.js
│   ├── routes/
│   │   └── api.js
│   ├── services/
│   │   └── notifications.js
│   └── validation/
│       └── schemas.js
└── test/
    ├── accidents.integration.test.js
    └── api.test.js
```

## Requirements and local setup

Use Node.js 20+ and PostgreSQL 14+.

1. Create a PostgreSQL database. For a local `psql` installation:

   ```sql
   CREATE DATABASE road_safety;
   ```

   In PowerShell you can connect with `psql -U postgres -d postgres`, run the SQL, then exit with `\q`. Alternatively create the database using pgAdmin.

2. Copy `.env.example` to `.env` and replace placeholders. Do not commit `.env`:

   ```powershell
   Copy-Item .env.example .env
   ```

   Set `DATABASE_URL` to your local PostgreSQL connection string. Set `JWT_SECRET` to a randomly generated value of at least 32 characters. Set each device's unique secret in `DEVICE_API_KEYS` to a randomly generated value of at least 32 characters. For example, generate safe random values using:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

   Paste the output as a secret; do not use that output in source code or commit it. Ensure the JSON value in `DEVICE_API_KEYS` is valid JSON.

3. Install packages, create the tables, and (optionally) create a worker account:

   ```powershell
   npm install
   npm run db:migrate
   $env:WORKER_EMAIL = "worker@example.invalid"
   $env:WORKER_PASSWORD = "Use-a-private-password-of-12+-characters"
   npm run worker:create
   Remove-Item Env:WORKER_EMAIL
   Remove-Item Env:WORKER_PASSWORD
   ```

   Use an email/password you control; the example values above are not credentials. Passwords are hashed with bcrypt. Worker creation fails if the email already exists.

4. Start the backend:

   ```powershell
   npm run dev
   ```

   The server listens on `http://localhost:3000` unless `PORT` is changed. Confirm it can reach PostgreSQL with `GET http://localhost:3000/api/health`.

`DATABASE_SSL=true` enables verified TLS for PostgreSQL. Use it when required by your database provider; do not disable certificate verification in production. Production API traffic must use HTTPS.

## API overview

All paths are prefixed with `/api`. JSON request bodies are limited to 16 KB. Timestamps and IDs are generated by PostgreSQL and cannot be supplied by the device. Incident JSON uses PostgreSQL's snake_case field names.

### `GET /api/health`

Checks the process and PostgreSQL. No authentication.

Success (`200`):

```json
{ "status": "ok", "database": "connected" }
```

Database unavailable (`503`):

```json
{ "status": "error", "database": "unavailable" }
```

### `POST /api/accidents`

Accepts a new report only when signed with a registered device secret. The payload may include `status: "PENDING"` for compatibility, but the API always creates the incident in `PENDING`. Other client-supplied statuses are rejected.

Headers:

```text
Content-Type: application/json
X-Device-Id: ROAD_DEVICE_001
X-Device-Timestamp: <current Unix timestamp in seconds>
X-Device-Nonce: <unique URL-safe value, at least 16 characters>
X-Device-Signature: <lowercase hex HMAC-SHA256>
```

Signature input is `timestamp + "." + nonce + "." + exact_raw_request_body`, using the device-specific secret as the HMAC key. The timestamp tolerance is `DEVICE_SIGNATURE_TOLERANCE_SECONDS` (default 300 seconds). A nonce cannot be reused in the same server process. `deviceId` in the JSON must match `X-Device-Id`.

Request:

```json
{
  "deviceId": "ROAD_DEVICE_001",
  "eventType": "SUSPECTED_ACCIDENT",
  "latitude": 11.5942,
  "longitude": 37.3908,
  "status": "PENDING",
  "source": "WOKWI_SIMULATION"
}
```

Success (`201`; `notification` reports actual notification handling, not a promise of delivery):

```json
{
  "incident": {
    "id": "98637f94-b775-41d0-aeac-5b89bdacb645",
    "device_id": "ROAD_DEVICE_001",
    "event_type": "SUSPECTED_ACCIDENT",
    "latitude": 11.5942,
    "longitude": 37.3908,
    "status": "PENDING",
    "source": "WOKWI_SIMULATION",
    "created_at": "2026-10-23T06:25:38.000Z",
    "notes": null,
    "updated_at": "2026-10-23T06:25:38.000Z"
  },
  "notification": { "status": "disabled" }
}
```

Other notification status values: `sent`, `partial` (with success/failure counts), `no_registered_devices`, or `failed`. A notification problem does not undo the saved incident; `failed` is logged and returned explicitly. Invalid input is `400`; missing, expired, replayed, or invalid device authentication is `401`; oversized body is `413`; rate limiting is `429`.

### `POST /api/auth/login`

Worker login, limited to 10 attempts per 15 minutes per client IP. No authentication required.

Request:

```json
{ "email": "worker@example.invalid", "password": "your-worker-password" }
```

Success (`200`):

```json
{
  "accessToken": "<signed-JWT>",
  "tokenType": "Bearer",
  "expiresIn": "8h",
  "worker": { "id": "98637f94-b775-41d0-aeac-5b89bdacb645", "email": "worker@example.invalid" }
}
```

Invalid credentials return `401`. Store the access token securely in the Android app and send it as `Authorization: Bearer <accessToken>`.

### `GET /api/accidents?status=PENDING`

Requires a worker bearer token. `status` is optional and must be one of `PENDING`, `ACKNOWLEDGED`, `RESOLVED`. Results are newest first.

Success (`200`):

```json
{
  "incidents": [
    {
      "id": "98637f94-b775-41d0-aeac-5b89bdacb645",
      "device_id": "ROAD_DEVICE_001",
      "event_type": "SUSPECTED_ACCIDENT",
      "latitude": 11.5942,
      "longitude": 37.3908,
      "status": "PENDING",
      "source": "WOKWI_SIMULATION",
      "created_at": "2026-10-23T06:25:38.000Z",
      "notes": null,
      "updated_at": "2026-10-23T06:25:38.000Z"
    }
  ]
}
```

Missing/invalid worker auth returns `401`; an invalid status filter returns `400`.

### `GET /api/accidents/:id`

Requires a worker bearer token and a UUID incident ID.

Success (`200`):

```json
{
  "incident": {
    "id": "98637f94-b775-41d0-aeac-5b89bdacb645",
    "device_id": "ROAD_DEVICE_001",
    "event_type": "SUSPECTED_ACCIDENT",
    "latitude": 11.5942,
    "longitude": 37.3908,
    "status": "PENDING",
    "source": "WOKWI_SIMULATION",
    "created_at": "2026-10-23T06:25:38.000Z",
    "notes": null,
    "updated_at": "2026-10-23T06:25:38.000Z"
  }
}
```

Invalid UUID returns `400`; missing incident returns `404`.

### `PATCH /api/accidents/:id/status`

Requires a worker bearer token. Only `PENDING` → `ACKNOWLEDGED` and `ACKNOWLEDGED` → `RESOLVED` transitions are allowed. Concurrent changes are serialized with a PostgreSQL row lock. Optional notes are limited to 2,000 characters.

Request:

```json
{ "status": "ACKNOWLEDGED", "notes": "Responder is on the way." }
```

Success (`200`):

```json
{
  "incident": {
    "id": "98637f94-b775-41d0-aeac-5b89bdacb645",
    "device_id": "ROAD_DEVICE_001",
    "event_type": "SUSPECTED_ACCIDENT",
    "latitude": 11.5942,
    "longitude": 37.3908,
    "status": "ACKNOWLEDGED",
    "source": "WOKWI_SIMULATION",
    "created_at": "2026-10-23T06:25:38.000Z",
    "notes": "Responder is on the way.",
    "updated_at": "2026-10-23T06:27:00.000Z",
    "acknowledged_by": "98637f94-b775-41d0-aeac-5b89bdacb645",
    "resolved_by": null
  }
}
```

Invalid transition returns `409`; invalid status/body/UUID returns `400`; missing incident returns `404`.

### Worker Android device-token endpoints (additional)

These authenticated endpoints are used to manage notification destinations. Firebase tokens are encrypted using AES-256-GCM before storage, with a SHA-256 hash used for safe duplicate lookup/removal. Both Firebase credentials and `FCM_TOKEN_ENCRYPTION_KEY` belong only on the backend.

`POST /api/workers/me/devices` with `Authorization: Bearer <token>`:

```json
{ "token": "<FCM-registration-token>" }
```

Success (`201`): `{ "message": "Device token registered." }`

`DELETE /api/workers/me/devices` uses the same bearer header and JSON body. Success is `204` with an empty body.

## Device signing and abuse prevention

An exposed URL is not authentication. Each device ID must have a unique random secret in the backend's `DEVICE_API_KEYS` JSON map and that same secret in the prototype's Wokwi firmware. The device signs every exact JSON body with HMAC-SHA256 and sends the timestamp, one-time nonce, device ID, and signature headers described above. Do not send the secret as a header or in the JSON payload.

Use HTTPS for every deployed device request. The backend rejects old signatures, repeated nonces within that running process, oversized payloads, malformed values, and excessive request rates. Restrict/rotate per-device keys, monitor logs, and revoke compromised keys. A secret compiled into public firmware can be extracted, so device signing is only a prototype safeguard. For multiple backend instances, put nonce/replay state in a shared store instead of process memory.

In ESP32/Wokwi code, set `API_URL` to the deployed `https://.../api/accidents` endpoint, serialize the exact JSON body once, HMAC-sign that exact byte sequence, and set the four `X-Device-*` headers. Do not regenerate or reformat the body after signing. The Wokwi coordinates are simulation values, not live GPS.

## PostgreSQL-backed integration test

The unit test verifies unauthenticated device requests are rejected. The integration test inserts a Wokwi-style report through the signed HTTP API, queries PostgreSQL to verify its authoritative ID and creation timestamp, then removes that test row.

Set `DATABASE_URL` and `TEST_DATABASE_URL` to a disposable test database, and ensure `DEVICE_API_KEYS` includes a 32+ character secret for `ROAD_DEVICE_001`. Then run:

```powershell
npm run db:migrate
npm test
npm run test:integration
```

`npm test` skips the database integration test when `TEST_DATABASE_URL` is absent. `npm run test:integration` will fail with a clear assertion if the test database is configured but its device secret is not. Never run this test against production data.

## Postman

Import `postman/Smart-Road-Accident-API.postman_collection.json` into Postman. Set collection variables:

- `baseUrl`: `http://localhost:3000`
- `deviceId`: `ROAD_DEVICE_001`
- `deviceSecret`: that device's configured development secret
- `workerEmail`, `workerPassword`: credentials created with `npm run worker:create`
- `incidentId`: set from the incident response after creating a report
- `accessToken`: populated by the login request's test script
- `fcmToken`: optional Android FCM registration token

The collection pre-request script computes the device HMAC from the raw report JSON. It is for local testing only; never use an actual production device secret in a shared Postman workspace.

## Firebase setup

Without Firebase configured, incident storage, health, worker login, and worker incident operations still run; startup logs that FCM is disabled and new incident responses show `notification.status: "disabled"`.

To enable notifications:

1. Create a Firebase project and register the Android application in that project. Configure the Android Firebase client as required by the native app.
2. Create a service account with the minimum Firebase Cloud Messaging permissions and download its JSON key. Do not add it to this repository, the Android app, or ESP32 firmware.
3. Store the JSON file outside the repository on the backend host and set `GOOGLE_APPLICATION_CREDENTIALS` to its absolute path. On a managed host, use its secret-file or workload-identity mechanism instead of checking in the key.
4. Generate a random 32-byte key, base64-encode it, and set `FCM_TOKEN_ENCRYPTION_KEY`. Keep it in a secret manager and back it up safely: losing it means stored tokens cannot be decrypted.
5. Restart the backend, log in as an authorized worker, and call `POST /api/workers/me/devices` with the Android Firebase registration token. Unregister obsolete tokens with `DELETE`.

The Firebase Admin SDK is initialized only on the backend. Notifications are attempted after PostgreSQL has committed the new incident. Failures are logged, represented in the response, and do not falsely claim delivery or remove the stored incident. Invalid/expired registration tokens are deleted.

## Public HTTPS deployment

### Vercel Hobby and Neon Free

For a personal prototype without a Render card-verification step, deploy the Express app as a Vercel Function and use Neon Free for PostgreSQL. Vercel's Hobby plan is intended for personal projects; check its current terms and usage limits before using it for anything beyond that. Neon Free does not require a credit card, but has compute, storage, and transfer limits.

1. Create a free PostgreSQL project on [Neon](https://neon.com/) and copy its **pooled** connection string. Keep the URL private.
2. In Neon's SQL Editor, run the contents of `src/db/schema.sql` to create the schema.
3. Sign in to [Vercel](https://vercel.com/), import this GitHub repository, and deploy it as a Node.js project. `src/app.js` exports the Express app for Vercel's Express runtime. No separate Vercel config file is required.
4. In the Vercel project settings, add these environment variables for Production:
   - `DATABASE_URL`: the Neon pooled connection string.
   - `DATABASE_SSL`: `true`.
   - `JWT_SECRET`: a unique random value of at least 32 characters.
   - `DEVICE_API_KEYS`: a JSON object mapping device IDs to unique secrets of at least 32 characters each.
   - `NODE_ENV`: `production`.
   - `CORS_ORIGINS`: the exact HTTPS origin of any browser client, or leave it empty for native clients.
5. Redeploy after saving environment variables. Confirm `https://<your-project>.vercel.app/api/health` returns `{"status":"ok","database":"connected"}`.
6. Create a worker using the same Neon database from a trusted local machine with `DATABASE_SSL=true`, `WORKER_EMAIL`, and `WORKER_PASSWORD` set, then run `npm run worker:create`. Do not commit or share worker credentials.
7. Set the Wokwi ESP32 sketch's `API_URL` to `https://<your-project>.vercel.app/api/accidents` and configure the matching device ID and secret through Wokwi secrets where available. Verify a signed report and worker login using Postman.

The Render Blueprint in `render.yaml` is an alternative, but Render currently requires account card verification before Blueprint creation. Free hosting and database tiers can sleep, scale to zero, restart, and impose usage limits. The device replay cache is process-local and is not shared between serverless instances, so this prototype is not suitable for emergency response or other availability-critical use. Keep independent backups of any data you need.
