import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('8h'),
  DEVICE_API_KEYS: z.string().default('{}'),
  DEVICE_SIGNATURE_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
  CORS_ORIGINS: z.string().default(''),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional().default(''),
  FCM_TOKEN_ENCRYPTION_KEY: z.string().optional().default('')
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

let deviceApiKeys;
try {
  deviceApiKeys = JSON.parse(parsed.data.DEVICE_API_KEYS);
  if (
    typeof deviceApiKeys !== 'object' ||
    deviceApiKeys === null ||
    Array.isArray(deviceApiKeys) ||
    Object.entries(deviceApiKeys).some(
      ([deviceId, secret]) => !deviceId || typeof secret !== 'string' || secret.length < 32
    )
  ) {
    throw new Error('Expected a JSON object of device IDs to secrets of at least 32 characters.');
  }
} catch (error) {
  console.error('Invalid DEVICE_API_KEYS:', error.message);
  process.exit(1);
}

const allowedOrigins = parsed.data.CORS_ORIGINS
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = {
  ...parsed.data,
  deviceApiKeys,
  allowedOrigins,
  isProduction: parsed.data.NODE_ENV === 'production'
};
