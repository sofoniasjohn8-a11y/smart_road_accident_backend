import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from './http-error.js';

function encryptionKey() {
  const key = Buffer.from(config.FCM_TOKEN_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    throw new HttpError(503, 'Device token registration is not configured.');
  }
  return key;
}

export function encryptToken(token) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64')).join('.');
}

export function decryptToken(value) {
  const [ivValue, tagValue, ciphertextValue] = value.split('.');
  if (!ivValue || !tagValue || !ciphertextValue) {
    throw new Error('Stored device token has an invalid encrypted format.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivValue, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
