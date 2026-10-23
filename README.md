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

## Deploying to another provider (general checklist)

1. Provision a managed Node.js host and managed PostgreSQL database. Deploy this repository using `npm install` and `npm start`; run `npm run db:migrate` once with the production database environment.
2. Configure all required environment variables in the provider's secret settings: `DATABASE_URL`, `DATABASE_SSL=true` when the provider requires TLS, a unique `JWT_SECRET`, the `DEVICE_API_KEYS` JSON map, `PORT` if the host provides one, a production `CORS_ORIGINS` allowlist, and `TRUST_PROXY_HOPS=1` if the host puts a load balancer or reverse proxy in front of the API. Never publish `.env` or credentials.
3. Configure the host's custom domain or built-in domain with valid TLS. Confirm the public endpoint responds at `https://<your-host>/api/health` and reports the database connected.
4. Set the Wokwi ESP32 sketch's `API_URL` to `https://<your-host>/api/accidents`. Configure its matching device ID and development device secret through Wokwi secrets where available; remember simulated firmware secrets are inspectable.
5. Verify one signed report is stored, then log in through Postman and confirm it appears in `GET /api/accidents`.

For any other provider, choose one that supports Node.js, HTTPS, environment secrets, outbound PostgreSQL, and persistent logs. Do not treat an ephemeral free-tier service as an emergency response platform. The next section covers the Render setup that ships with this repository.

## Deploying on Render

`render.yaml` at the repository root is a [Render Blueprint](https://render.com/docs/blueprint-spec). It creates the API web service and a Render PostgreSQL database, wires `DATABASE_URL` from the database into the service over Render's private network, and generates `JWT_SECRET`.

1. Merge this branch to the default branch (`main`). Render deploys the repository's default branch unless the Blueprint sets `branch:`.
2. In the Render Dashboard choose **New → Blueprint**, select this repository, and apply it. That creates:
   - `smart-road-accident-api` — Node web service. Build `npm ci --omit=dev`; start `npm run db:migrate && npm start`; health check `GET /api/health`.
   - `road-safety-db` — PostgreSQL instance, reachable from the service at `DATABASE_URL`.
3. When Render prompts for `DEVICE_API_KEYS`, paste a JSON object of real per-device secrets, each at least 32 characters, for example `{"ROAD_DEVICE_001":"<random-32+-character-secret>"}`. Until it is set, the API boots but rejects every device report with `401`. Use the same value in the matching Wokwi firmware.
4. Confirm `https://<service-name>.onrender.com/api/health` answers `{"status":"ok","database":"connected"}`.
5. Create the first responder account once, against the production database. Worker accounts are not created by the Blueprint: run `WORKER_EMAIL=you@example.invalid WORKER_PASSWORD="<12+-character-password>" npm run worker:create` with the database's **external** connection string (Render Dashboard → the database → Connect) and `DATABASE_SSL=true` in that shell, or run the same command as a Render one-off job or from a service Shell where your plan provides one.
6. Point the Wokwi ESP32 sketch's `API_URL` at `https://<service-name>.onrender.com/api/accidents` and set the Postman collection's `baseUrl` to `https://<service-name>.onrender.com`.
7. Send one signed report, then log in as the worker and confirm it appears in `GET /api/accidents`.

### Render-specific configuration

- `TRUST_PROXY_HOPS=1` is set because every request arrives through Render's proxy. It makes the API read the client IP from `X-Forwarded-For`, which is what the login and incident rate limits key on. Without it all clients share one bucket — login would be limited to 10 attempts per 15 minutes for every worker together — and `express-rate-limit` logs a misconfiguration warning. Leave it `0` when the API is exposed directly.
- `DATABASE_SSL=false` matches Render's internal connection string. Connecting from outside Render requires TLS: set `DATABASE_SSL=true` and make the database's CA certificate readable by Node (for example through `NODE_EXTRA_CA_CERTS`) before doing so. This project never disables certificate verification.
- `CORS_ORIGINS` is only needed for browser clients; the Android app and the ESP32 send no `Origin`. Add exact origins, comma-separated. Anything else stays rejected with `403`.
- Firebase Cloud Messaging stays optional. Render services have an ephemeral filesystem, so a service-account JSON must live outside the repository — use a Render Secret File and point `GOOGLE_APPLICATION_CREDENTIALS` at its absolute path — together with `FCM_TOKEN_ENCRYPTION_KEY`. Without them the API logs that FCM is disabled and storage, login and incident operations keep working.

### Free tier and paid upgrade path

The Blueprint uses Render's free plans, the cheapest way to run this prototype, with two limits worth knowing:

- A **Free PostgreSQL database expires 30 days after creation**, and its data is deleted after the grace period. Upgrade the database to a paid plan (for example `basic-256mb`) to keep it.
- A **Free web service spins down after 15 minutes without traffic**; the next request wakes it in about a minute.

On a paid web plan, move the migration to Render's recommended place: set `preDeployCommand: npm run db:migrate` and `startCommand: npm start`, since pre-deploy commands are not available on free instance types.
