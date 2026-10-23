import { HttpError } from '../lib/http-error.js';
import { config } from '../config.js';

export function notFound(_request, _response, next) {
  next(new HttpError(404, 'Route not found.'));
}

export function errorHandler(error, _request, response, _next) {
  if (error?.type === 'entity.too.large') {
    return response.status(413).json({ error: 'Request body exceeds the 16 KB limit.' });
  }
  if (error instanceof SyntaxError && error.status === 400) {
    return response.status(400).json({ error: 'Request body must contain valid JSON.' });
  }
  if (error.message === 'Not allowed by CORS') {
    return response.status(403).json({ error: 'Origin is not allowed.' });
  }

  const status = error instanceof HttpError ? error.status : 500;
  const payload = { error: status === 500 ? 'Internal server error.' : error.message };
  if (error instanceof HttpError && error.details) payload.details = error.details;
  if (status === 500) console.error('Unhandled request error:', error);
  return response.status(status).json(payload);
}
