# Mobile app API integration

Everything a mobile client needs to talk to this backend. It is a single HTTP API with two
independent authentication models:

- **Reporters** (the road device, or a phone acting as one) create incidents with an
  HMAC-signed request. No login, no session.
- **Responders** (the worker app) read and work incidents with a bearer token from
  `POST /api/auth/login`.

All responses are JSON, except the rate-limit error, which is plain text.

Every request/response example below was captured from a running instance of this repository.

## 1. Base URL

| Environment | Base URL |
| --- | --- |
| Render deployment | `https://<service-name>.onrender.com` |
| Base44 sandbox preview | `https://3000-<your-preview-host>` |
| Local docker compose | `http://localhost:3000` |

There is no API version prefix: endpoints are `/api/...`. JSON request bodies are limited to
**16 KB**; a larger body is rejected with `413`. Send `Content-Type: application/json`.

## 2. Authentication

### 2.1 Reporters — HMAC-signed requests

`POST /api/accidents` is the only signed endpoint. Each device ID has a unique secret of at
least 32 characters, configured in the backend's `DEVICE_API_KEYS` JSON map
(`{"ROAD_DEVICE_001":"<secret>"}`). The secret is never sent — it is only used as the HMAC key.

Send these four headers with every report:

| Header | Value |
| --- | --- |
| `X-Device-Id` | The device ID, for example `ROAD_DEVICE_001` |
| `X-Device-Timestamp` | Current Unix time in **seconds**, exactly 10 digits |
| `X-Device-Nonce` | Unique random value, 16–100 characters of `A-Z a-z 0-9 _ -` |
| `X-Device-Signature` | Lowercase hex HMAC-SHA256 (see below) |

The signature covers the **exact bytes** you send as the request body:

```
signature = hex( HMAC-SHA256( key = device secret,
                              message = timestamp + "." + nonce + "." + rawRequestBody ) )
```

Rules the backend enforces, with the verified error for each:

- **Serialise once.** Any reformatting between signing and sending (different key order,
  whitespace, re-encoding) changes the bytes and the signature fails → `401`.
- **Fresh timestamp.** The tolerance is 300 seconds by default
  (`DEVICE_SIGNATURE_TOLERANCE_SECONDS`). Use the device clock in UTC and keep it
  NTP-synced; a stale one → `401 {"error":"Device signature has expired."}`
- **New nonce per request.** A nonce is single-use while the server process is alive;
  reusing one → `401 {"error":"Device request nonce has already been used."}`
- **IDs must agree.** `deviceId` in the JSON body must equal `X-Device-Id` →
  otherwise `400 {"error":"deviceId must match the authenticated device."}`

Verified signing vector (development secret from `.env.base44-defaults`, never use it in
production):

```text
device secret : h9g2KOOgQFjEWScYgbjRD6q0oYHxZwhgB1bBDGF-6Xc
timestamp     : 1761000000
nonce         : demo0nonce1234567890
body          : {"deviceId":"ROAD_DEVICE_001","eventType":"SUSPECTED_ACCIDENT","latitude":11.5942,"longitude":37.3908,"source":"ANDROID_APP"}
signature     : f9775f9d5952763d6b11c5120b052d822c86fa8af08d0cf6bd2e98428c35e798
```

Reproduce this vector in your own crypto library before wiring up the network layer — if it
matches, your signing implementation is correct. Recompute it with the current timestamp and a
fresh nonce to make a live call.

Reference implementation (Node, same algorithm in any language):

```js
import { createHmac, randomUUID } from 'node:crypto';

const deviceId = 'ROAD_DEVICE_001';
const secret = process.env.DEVICE_SECRET;

const body = JSON.stringify({
  deviceId,
  eventType: 'SUSPECTED_ACCIDENT',
  latitude: 11.5942,
  longitude: 37.3908,
  source: 'ANDROID_APP'
});
const timestamp = String(Math.floor(Date.now() / 1000));
const nonce = randomUUID().replace(/-/g, '');

const signature = createHmac('sha256', secret)
  .update(`${timestamp}.${nonce}.`)
  .update(body)          // signs the exact same string that is sent
  .digest('hex');

await fetch(`${baseUrl}/api/accidents`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Device-Id': deviceId,
    'X-Device-Timestamp': timestamp,
    'X-Device-Nonce': nonce,
    'X-Device-Signature': signature
  },
  body
});
```

### 2.2 Responders — bearer token

Log in with `POST /api/auth/login` and send the returned token on every worker request:

```
Authorization: Bearer <accessToken>
```

- Tokens are HS256 JWTs valid for 8 hours (`JWT_EXPIRES_IN`). There is **no refresh token**:
  when a request answers `401 {"error":"Access token is invalid or expired."}`, log in again.
- A disabled worker account is rejected even with a valid token
  (`401 {"error":"Worker account is inactive or unavailable."}`).
- Store the token in the platform keystore (Android `EncryptedSharedPreferences` /
  Keystore-backed storage, iOS Keychain) — never in plain preferences.

## 3. Endpoint reference

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | none | Service and database status |
| `POST` | `/api/accidents` | device HMAC | Create an incident report |
| `POST` | `/api/auth/login` | none | Worker login |
| `GET` | `/api/accidents` | worker | List incidents (optional `?status=`) |
| `GET` | `/api/accidents/:id` | worker | One incident |
| `PATCH` | `/api/accidents/:id/status` | worker | Acknowledge / resolve an incident |
| `POST` | `/api/workers/me/devices` | worker | Register the phone's FCM push token |
| `DELETE` | `/api/workers/me/devices` | worker | Remove the phone's FCM push token |

### 3.1 `GET /api/health`

No authentication. Use it to check connectivity before reporting.

```json
{ "status": "ok", "database": "connected" }
```

Database unreachable → `503 {"status":"error","database":"unavailable"}`.

### 3.2 `POST /api/accidents`

Device HMAC headers required (section 2.1). Request body — `status` is optional and may only
be the literal `"PENDING"`; the server always stores `PENDING`. Unknown fields are rejected:

```json
{
  "deviceId": "ROAD_DEVICE_001",
  "eventType": "SUSPECTED_ACCIDENT",
  "latitude": 11.5942,
  "longitude": 37.3908,
  "source": "ANDROID_APP",
  "notes": "Optional, max 2000 characters"
}
```

Field rules: `deviceId`, `eventType`, `source` are non-empty strings up to 100 characters;
`latitude` −90…90; `longitude` −180…180; `notes` up to 2000 characters. Client-sent IDs and
timestamps are ignored — PostgreSQL generates both.

`201 Created`:

```json
{
  "incident": {
    "id": "f5f8daba-3d89-4ed7-8a05-539ce88f1248",
    "device_id": "ROAD_DEVICE_001",
    "event_type": "SUSPECTED_ACCIDENT",
    "latitude": 11.5942,
    "longitude": 37.3908,
    "status": "PENDING",
    "source": "ANDROID_APP",
    "created_at": "2026-10-23T17:13:55.134Z",
    "notes": null,
    "updated_at": "2026-10-23T17:13:55.134Z"
  },
  "notification": { "status": "disabled" }
}
```

`notification.status` reports what actually happened, never a promise of delivery:

| Value | Meaning |
| --- | --- |
| `disabled` | Firebase is not configured on the backend |
| `no_registered_devices` | Firebase is on, but no responder registered a push token |
| `sent` / `partial` | Delivered to all / some tokens (`successCount`, `failureCount`) |
| `failed` | Delivery attempt failed; the incident is still stored |

A `201` means the incident is committed. Treat the incident as reported and retry only if you
get a network error or a `5xx` — do **not** retry on `401` (fix the signature first).

Errors: `400` invalid body, `401` missing/invalid/expired/replayed signature, `413` body over
16 KB, `429` rate limited.

### 3.3 `POST /api/auth/login`

No authentication. `401` on bad credentials (deliberately identical for unknown and wrong
password).

```json
{ "email": "worker@example.invalid", "password": "your-worker-password" }
```

`200 OK`:

```json
{
  "accessToken": "<signed-JWT>",
  "tokenType": "Bearer",
  "expiresIn": "8h",
  "worker": { "id": "f4b509c8-53f5-4748-a429-9d224d084d4d", "email": "worker@example.invalid" }
}
```

### 3.4 `GET /api/accidents`

Worker token required. Optional `?status=PENDING|ACKNOWLEDGED|RESOLVED`; any other value is
`400`. Newest first, and there is **no pagination** — filter by status and keep the list small.

```json
{
  "incidents": [
    {
      "id": "32738506-7b0a-41d4-b349-cc6df9437705",
      "device_id": "ROAD_DEVICE_001",
      "event_type": "SUSPECTED_ACCIDENT",
      "latitude": 11.5942,
      "longitude": 37.3908,
      "status": "PENDING",
      "source": "ANDROID_APP",
      "created_at": "2026-10-23T17:13:55.147Z",
      "notes": null,
      "updated_at": "2026-10-23T17:13:55.147Z"
    }
  ]
}
```

### 3.5 `GET /api/accidents/:id`

Worker token required, `:id` must be a UUID (`400` otherwise, `404` when unknown). Returns
`{ "incident": { ... } }` with the same fields as above.

### 3.6 `PATCH /api/accidents/:id/status`

Worker token required. Only forward transitions are allowed: `PENDING → ACKNOWLEDGED` and
`ACKNOWLEDGED → RESOLVED`. Skipping a step or reopening is
`409 {"error":"Cannot change incident from PENDING to RESOLVED."}`

```json
{ "status": "ACKNOWLEDGED", "notes": "Responder is on the way." }
```

`200 OK` — status updates additionally return who acted:

```json
{
  "incident": {
    "id": "f5f8daba-3d89-4ed7-8a05-539ce88f1248",
    "device_id": "ROAD_DEVICE_001",
    "event_type": "SUSPECTED_ACCIDENT",
    "latitude": 11.5942,
    "longitude": 37.3908,
    "status": "ACKNOWLEDGED",
    "source": "ANDROID_APP",
    "created_at": "2026-10-23T17:13:55.134Z",
    "notes": "Responder is on the way.",
    "updated_at": "2026-10-23T17:13:55.812Z",
    "acknowledged_by": "f4b509c8-53f5-4748-a429-9d224d084d4d",
    "resolved_by": null
  }
}
```

`notes` is kept when the request omits it (an earlier note is not erased). Concurrent updates
are serialised with a PostgreSQL row lock, so two responders cannot both acknowledge: the
second gets `409`.

### 3.7 `POST /api/workers/me/devices` and `DELETE /api/workers/me/devices`

Worker token required. Send the FCM registration token the phone receives from
Firebase (`token` is 20–4096 characters). Re-registering the same token re-points it to the
current worker.

```json
{ "token": "<FCM-registration-token>" }
```

- `POST` → `201 {"message":"Device token registered."}`
- `DELETE` → `204` with an empty body (also when the token was not registered)

Both endpoints need `FCM_TOKEN_ENCRYPTION_KEY` on the backend, because tokens are encrypted
(AES-256-GCM) before storage. Without it `POST` answers
`503 {"error":"Device token registration is not configured."}`. A phone must therefore treat
push registration as best-effort and keep working without push: poll
`GET /api/accidents?status=PENDING` for the queue.

## 4. Errors, status codes and rate limits

Errors use `{"error": "<message>"}`; validation failures add a `details` object:

```json
{
  "error": "Query parameters are invalid.",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "status": ["Invalid enum value. Expected 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED', received 'BOGUS'"]
    }
  }
}
```

| Status | When | Suggested client behaviour |
| --- | --- | --- |
| `400` | Invalid body/params/query, unknown field, `deviceId` mismatch | Bug — do not retry |
| `401` | Bad/expired/replayed device signature, missing or expired token, bad credentials | Fix the signature or log in again |
| `403` | Browser request with a disallowed `Origin` | Only affects web clients, not native apps |
| `404` | Unknown incident or route | Refresh the list |
| `409` | Invalid status transition | Refresh the incident first |
| `413` | Body over 16 KB | Never — reports are small |
| `429` | Rate limited | Back off using `Retry-After` |
| `500` | Unhandled server error | Retry once with the same signature is unsafe — sign again |
| `503` | Database down, push not configured, replay-protection capacity full | Retry with backoff |

Rate limits are per client IP:

| Endpoint | Limit | Response when exceeded |
| --- | --- | --- |
| `POST /api/auth/login` | 10 attempts / 15 minutes | `429`, headers `RateLimit: limit=10, remaining=0, reset=900`, `Retry-After: 900`, body `Too many requests, please try again later.` (plain text, not JSON) |
| `/api/accidents` (all methods) | 120 requests / minute | `429` with the same header style |

The login limit above was reached and its response captured; the `/api/accidents` limit comes
from the same middleware configuration in `src/app.js` and was not reached during verification.

Behind a proxy or load balancer the backend must have `TRUST_PROXY_HOPS` set (the Render
blueprint sets it to `1`); otherwise all clients share one bucket. See `README.md`.

## 5. Mobile integration notes

- **Request bodies are camelCase, responses are snake_case.** `eventType` in, `event_type` out.
  Timestamps are ISO 8601 UTC with a `Z` suffix; format them for display only.
- **Serialise the report body exactly once** and reuse that string for both the signature and
  the request. This is the most common integration bug.
- **Offline queue:** store unsent reports locally. On each attempt generate a fresh timestamp,
  nonce and signature from the stored body — never replay a previously sent signature. A phone
  with a wrong clock cannot sign at all until it syncs time.
- **Never embed the device secret in published app code** if you can avoid it: it is
  extractable from the binary and lets anyone forge reports for that device ID. For a phone
  acting as a reporter, prefer issuing one credential per install from your own backend and
  rotating it, or send reports through your own endpoint that adds the device signature.
- **Push vs poll:** register the FCM token after login and unregister on logout, then handle
  `notification` payloads containing `incidentId` by fetching that incident. Without Firebase
  configured, poll `GET /api/accidents?status=PENDING` (respecting the 120/min limit).
- **The API has no delete endpoint** for incidents; the worker app resolves them instead.

## 6. End-to-end smoke test

Run from any machine that can reach the backend. `jq` is optional.

```bash
BASE=https://<service-name>.onrender.com
DEVICE_ID=ROAD_DEVICE_001
DEVICE_SECRET=<that device's secret>
WORKER_EMAIL=<worker account>
WORKER_PASSWORD=<its password>

# 1. the service and its database are alive
curl -s "$BASE/api/health"

# 2. sign and send a report (see the reference implementation in section 2.1)
#    -> 201 with incident.id
curl -s -X POST "$BASE/api/accidents" \
  -H 'Content-Type: application/json' \
  -H "X-Device-Id: $DEVICE_ID" \
  -H "X-Device-Timestamp: $TIMESTAMP" \
  -H "X-Device-Nonce: $NONCE" \
  -H "X-Device-Signature: $SIGNATURE" \
  -d "$BODY"

# 3. log in as the responder
TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$WORKER_EMAIL\",\"password\":\"$WORKER_PASSWORD\"}" | jq -r .accessToken)

# 4. the report is in the queue
curl -s "$BASE/api/accidents?status=PENDING" -H "Authorization: Bearer $TOKEN"

# 5. acknowledge it, then resolve it
curl -s -X PATCH "$BASE/api/accidents/$INCIDENT_ID/status" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"ACKNOWLEDGED","notes":"Responder is on the way."}'
```

Expected results: `200` for steps 1, 4 and 5; `201` for steps 2 and 3; the incident moves
`PENDING → ACKNOWLEDGED → RESOLVED` and any other transition answers `409`.

## 7. Prototype limits worth knowing

- Nonce/replay state lives in the API process memory: run a single instance, and expect a
  nonce to become reusable after a restart.
- There is no self-service enrollment, password reset, role hierarchy or pagination; worker
  accounts are created by an operator (`npm run worker:create`).
- Push delivery is best-effort and reports its own outcome; it never blocks storing an incident.
- This is not a certified emergency dispatch service.
