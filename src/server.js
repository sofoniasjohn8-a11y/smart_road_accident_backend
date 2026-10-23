import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';

const server = app.listen(config.PORT, () => {
  console.info(`Backend listening on port ${config.PORT} (${config.NODE_ENV}).`);
});

async function shutdown(signal) {
  console.info(`${signal} received; shutting down.`);
  server.close(async (error) => {
    if (error) {
      console.error('HTTP server shutdown failed:', error);
      process.exitCode = 1;
    }
    await pool.end();
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
