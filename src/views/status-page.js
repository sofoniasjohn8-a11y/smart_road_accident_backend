/**
 * Plain-HTML status page for GET /.
 *
 * This project is an HTTP API with no web interface, but the sandbox preview needs
 * a real document at the root to render. The page is intentionally static: no
 * scripts, no external assets, no configuration. It is outside the /api namespace,
 * so it does not affect the documented API contract.
 */
export const statusPageHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Smart Road Accident Detection API</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0 auto;
        padding: 2.5rem 1.25rem;
        max-width: 46rem;
        font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
      p.lead { margin: 0 0 1.75rem; opacity: .8; }
      h2 { font-size: 1rem; margin: 2rem 0 .5rem; text-transform: uppercase; letter-spacing: .06em; opacity: .7; }
      table { border-collapse: collapse; width: 100%; }
      th, td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid rgba(128,128,128,.35); vertical-align: top; }
      th { font-weight: 600; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
      a { color: inherit; }
      .method { font-weight: 700; white-space: nowrap; }
      footer { margin-top: 2rem; font-size: .875rem; opacity: .7; }
    </style>
  </head>
  <body>
    <h1>Smart Road Accident Detection API</h1>
    <p class="lead">
      The backend is running. This is an HTTP API with no web interface, so the endpoints
      below are the app: use them with an HTTP client such as curl or Postman.
    </p>

    <h2>Health</h2>
    <table>
      <tbody>
        <tr><td class="method">GET</td><td><a href="/api/health"><code>/api/health</code></a></td><td>Process and PostgreSQL status. No authentication.</td></tr>
      </tbody>
    </table>

    <h2>Devices</h2>
    <table>
      <tbody>
        <tr><td class="method">POST</td><td><code>/api/accidents</code></td><td>Signed simulated device report; requires the device HMAC headers.</td></tr>
      </tbody>
    </table>

    <h2>Response workers</h2>
    <table>
      <tbody>
        <tr><td class="method">POST</td><td><code>/api/auth/login</code></td><td>Worker login, returns a bearer token.</td></tr>
        <tr><td class="method">GET</td><td><code>/api/accidents</code></td><td>List incidents, optionally filtered by status.</td></tr>
        <tr><td class="method">GET</td><td><code>/api/accidents/:id</code></td><td>One incident.</td></tr>
        <tr><td class="method">PATCH</td><td><code>/api/accidents/:id/status</code></td><td>Move an incident through PENDING &rarr; ACKNOWLEDGED &rarr; RESOLVED.</td></tr>
        <tr><td class="method">POST</td><td><code>/api/workers/me/devices</code></td><td>Register an Android push token.</td></tr>
        <tr><td class="method">DELETE</td><td><code>/api/workers/me/devices</code></td><td>Remove an Android push token.</td></tr>
      </tbody>
    </table>

    <footer>
      Prototype, not a certified emergency dispatch service. Request payloads, headers and
      response shapes are documented in <code>README.md</code>.
    </footer>
  </body>
</html>
`;
