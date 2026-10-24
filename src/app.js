import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import apiRouter from './routes/api.js';
import { statusPageHtml } from './views/status-page.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json({
  limit: '16kb',
  verify(request, _response, buffer) {
    request.rawBody = Buffer.from(buffer);
  }
}));
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}));
app.use('/api/accidents', rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}));
app.use('/api', apiRouter);
// Inline favicon so browsers visiting the status page don't log a 404.
app.get('/favicon.ico', (_request, response) => {
  response.type('image/svg+xml').send(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<circle cx="16" cy="16" r="15" fill="#c62828"/>' +
    '<path d="M16 7a4 4 0 0 0-4 4v5h-1v8h10v-8h-1v-5a4 4 0 0 0-4-4zm0 2a2 2 0 0 1 2 2v5h-4v-5a2 2 0 0 1 2-2z" fill="#fff"/></svg>'
  );
});
// Human-readable landing page; sits outside the /api namespace used by the API contract.
app.get('/', (_request, response) => {
  response.type('html').send(statusPageHtml);
});
app.use(notFound);
app.use(errorHandler);

export default app;
