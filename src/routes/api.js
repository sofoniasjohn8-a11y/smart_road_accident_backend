import { Router } from 'express';
import { login, register } from '../controllers/auth-controller.js';
import {
  createIncident,
  getIncident,
  health,
  listIncidents,
  updateIncidentStatus
} from '../controllers/accident-controller.js';
import { registerDeviceToken, unregisterDeviceToken } from '../controllers/device-controller.js';
import { deviceAuthentication } from '../middleware/device-auth.js';
import { requireRegistrationSecret } from '../middleware/registration-auth.js';
import { requireWorker } from '../middleware/worker-auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
  deviceTokenBody,
  incidentListQuery,
  incidentIdParams,
  loginBody,
  newIncidentBody,
  registrationBody,
  statusUpdateBody
} from '../validation/schemas.js';
import { HttpError } from '../lib/http-error.js';

const router = Router();

router.get('/health', async (_request, response) => {
  await health(_request, response);
});

router.post(
  '/accidents',
  deviceAuthentication,
  validateBody(newIncidentBody),
  createIncident
);

router.get('/accidents', requireWorker, validateQuery(incidentListQuery), listIncidents);

router.get(
  '/accidents/:id',
  requireWorker,
  validateParams(incidentIdParams),
  getIncident
);

router.patch(
  '/accidents/:id/status',
  requireWorker,
  validateParams(incidentIdParams),
  validateBody(statusUpdateBody),
  updateIncidentStatus
);

router.post('/auth/login', validateBody(loginBody), login);
router.post(
  '/auth/register',
  requireRegistrationSecret,
  validateBody(registrationBody),
  register
);

router.post('/workers/me/devices', requireWorker, validateBody(deviceTokenBody), registerDeviceToken);
router.delete('/workers/me/devices', requireWorker, validateBody(deviceTokenBody), unregisterDeviceToken);

router.use((_request, _response, next) => next(new HttpError(404, 'Route not found.')));

export default router;
