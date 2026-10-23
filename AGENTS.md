# Working on this repo in the Base44 sandbox

## What this app is

A backend-only HTTP API (Node.js 20+/Express 5 + PostgreSQL). There is no web UI:
port 3000 serves the JSON API itself. `GET /` returns a small static status page
(`src/views/status-page.js`, a link list of the endpoints) so the preview has a document to
render — everything under `/api` is the documented API. Use `GET /api/health` to see that it is
alive, and the endpoints in README.md to exercise it.

## Running it

```bash
docker compose -f docker-compose.base44.yml up -d --build   # postgres + migrate + api
docker compose -f docker-compose.base44.yml logs -f api
```

- The API is published on host port 3000; PostgreSQL is only reachable on the compose network.
- `node:22-alpine` runs the app straight from the bind-mounted repo with `node --watch`, so edits
  reload without a rebuild.
- Dependencies live in the `node_modules` named volume and are installed on container start with
  `npm ci` (lockfile-preserving). Editing `package.json`/`package-lock.json` needs only a restart,
  not an image rebuild.
- The one-shot `migrate` service applies `src/db/schema.sql` (idempotent) before the API starts.
  Re-apply it manually after schema edits: `docker compose -f docker-compose.base44.yml run --rm migrate`.

## Configuration

`.env.base44-defaults` (committed) holds local placeholders so the app boots with no credentials.
It is listed FIRST in each service's `env_file`, so real values delivered to `/run/base44/app.env`
always win. Required to boot: `DATABASE_URL`, `JWT_SECRET` (32+ chars) and `DEVICE_API_KEYS`
(a JSON object; every device secret must be at least 32 characters, or the process exits).

Firebase Cloud Messaging is optional. With `GOOGLE_APPLICATION_CREDENTIALS` unset the API logs
"FCM notifications are disabled" and keeps working; `POST /api/workers/me/devices` then answers
`503` by design. Enabling it needs a service-account JSON **file** placed in the sandbox plus
`FCM_TOKEN_ENCRYPTION_KEY` (32 bytes, base64) — an environment value alone is not enough.

## Tests

```bash
docker compose -f docker-compose.base44.yml exec -T api sh -c 'TEST_DATABASE_URL="$DATABASE_URL" node --test'
```

`TEST_DATABASE_URL` must point at the **same** database the app uses. The integration test posts
through the in-process app and reads the row back through that pool; given a different database it
fails the lookup and leaves the reported incident behind, because its `finally` cleanup deletes
from the other database. The suite takes ~30s even when everything passes.

## Sandbox notes

- `BASE44_PREVIEW_MODE` is passed through to the API service but no application code reads it,
  so there is no preview-only behaviour branch. It has no effect whether set to `1` or unset.
- `CORS_ORIGINS` is the app's own existing setting; the sandbox extends it with
  `https://3000-${BASE44_PUBLIC_HOST_SUFFIX}` (the preview origin) instead of hardcoding a host,
  so browser requests from the preview are accepted. Everything else stays rejected with `403`.
- No Firebase credentials are configured here, so notification delivery cannot be verified in
  this environment.

## Demo data

Worker accounts are created with `scripts/create-worker.js` (needs `WORKER_EMAIL` and
`WORKER_PASSWORD`); there is no self-service enrollment. Incidents are only created by signed
device reports, and the API has no delete endpoint — clean up test incidents directly in
PostgreSQL if you create any.
