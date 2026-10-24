import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../lib/http-error.js';

export function requireRegistrationSecret(request, _response, next) {
  const expectedSecret = config.WORKER_REGISTRATION_SECRET;
  if (!expectedSecret) {
    return next(new HttpError(503, 'Worker registration is not enabled.'));
  }

  const providedSecret = request.get('x-worker-registration-secret');
  if (typeof providedSecret !== 'string') {
    return next(new HttpError(401, 'Registration authorization is required.'));
  }

  const expected = Buffer.from(expectedSecret);
  const provided = Buffer.from(providedSecret);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return next(new HttpError(401, 'Registration authorization is required.'));
  }

  return next();
}
