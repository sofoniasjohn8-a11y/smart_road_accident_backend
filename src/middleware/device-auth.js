import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../lib/http-error.js';

const usedNonces = new Map();
const MAX_NONCES = 20_000;

export function signDeviceRequest(secret, timestamp, nonce, rawBody) {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${nonce}.`)
    .update(rawBody)
    .digest('hex');
}

export function deviceAuthentication(request, _response, next) {
  const deviceId = request.get('x-device-id');
  const timestamp = request.get('x-device-timestamp');
  const nonce = request.get('x-device-nonce');
  const signature = request.get('x-device-signature');
  const secret = config.deviceApiKeys[deviceId];

  if (!secret || !timestamp || !nonce || !signature || !request.rawBody) {
    return next(new HttpError(401, 'Valid device authentication headers are required.'));
  }
  if (!/^\d{10}$/.test(timestamp) || !/^[A-Za-z0-9_-]{16,100}$/.test(nonce)) {
    return next(new HttpError(401, 'Device authentication headers are malformed.'));
  }

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > config.DEVICE_SIGNATURE_TOLERANCE_SECONDS) {
    return next(new HttpError(401, 'Device signature has expired.'));
  }
  if (usedNonces.has(`${deviceId}:${nonce}`)) {
    return next(new HttpError(401, 'Device request nonce has already been used.'));
  }

  const expected = Buffer.from(signDeviceRequest(secret, timestamp, nonce, request.rawBody), 'hex');
  const supplied = Buffer.from(signature, 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return next(new HttpError(401, 'Device signature is invalid.'));
  }

  if (usedNonces.size >= MAX_NONCES) {
    for (const [key, expiry] of usedNonces) {
      if (expiry < nowSeconds) usedNonces.delete(key);
    }
    if (usedNonces.size >= MAX_NONCES) {
      return next(new HttpError(503, 'Device replay-protection capacity is temporarily full.'));
    }
  }
  usedNonces.set(
    `${deviceId}:${nonce}`,
    timestampSeconds + config.DEVICE_SIGNATURE_TOLERANCE_SECONDS
  );
  request.authenticatedDeviceId = deviceId;
  return next();
}
