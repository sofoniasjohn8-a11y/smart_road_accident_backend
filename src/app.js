import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import apiRouter from './routes/api.js';
import { statusPageHtml } from './views/status-page.js';
import { faviconSvg } from './views/favicon.js';

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
// Human-readable landing page; sits outside the /api namespace used by the API contract.
app.get('/', (_request, response) => {
  response.type('html').send(statusPageHtml);
});
// Served for the status page's icon link; /favicon.ico covers browsers that probe it directly.
app.get(['/favicon.svg', '/favicon.ico'], (_request, response) => {
  response.type('image/svg+xml').send(faviconSvg);
});
app.use(notFound);
app.use(errorHandler);
