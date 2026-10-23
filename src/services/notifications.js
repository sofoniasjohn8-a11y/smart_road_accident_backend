import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { decryptToken } from '../lib/token-encryption.js';

let firebaseMessaging = null;
let notificationReady = false;

if (!config.GOOGLE_APPLICATION_CREDENTIALS) {
  console.info('FCM notifications are disabled: GOOGLE_APPLICATION_CREDENTIALS is not configured.');
} else if (Buffer.from(config.FCM_TOKEN_ENCRYPTION_KEY, 'base64').length !== 32) {
  console.warn('FCM notifications are disabled: FCM_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.');
} else {
  try {
    if (getApps().length === 0) {
      initializeApp({ credential: applicationDefault() });
    }
    firebaseMessaging = getMessaging();
    notificationReady = true;
    console.info('Firebase Cloud Messaging is configured.');
  } catch (error) {
    console.error('Firebase initialization failed; notifications are disabled:', error.message);
  }
}

export async function notifyWorkers(incident) {
  if (!notificationReady) return { status: 'disabled' };

  try {
    const { rows } = await pool.query(
      `SELECT device_tokens.id, device_tokens.token_encrypted
       FROM worker_device_tokens AS device_tokens
       JOIN workers ON workers.id = device_tokens.worker_id
       WHERE workers.active = TRUE`
    );
    if (rows.length === 0) return { status: 'no_registered_devices', successCount: 0, failureCount: 0 };

    const tokens = rows.map(({ id, token_encrypted }) => ({
      id,
      token: decryptToken(token_encrypted)
    }));
    let successCount = 0;
    let failureCount = 0;
    for (let index = 0; index < tokens.length; index += 500) {
      const batch = tokens.slice(index, index + 500);
      const result = await firebaseMessaging.sendEachForMulticast({
        tokens: batch.map(({ token }) => token),
        notification: {
          title: 'Suspected road accident',
          body: `${incident.event_type} reported by ${incident.device_id}`
        },
        data: {
          incidentId: incident.id,
          eventType: incident.event_type
        }
      });
      successCount += result.successCount;
      failureCount += result.failureCount;

      const invalidIds = result.responses.flatMap((response, responseIndex) =>
        response.success
          ? []
          : ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']
              .includes(response.error?.code)
            ? [batch[responseIndex].id]
            : []
      );
      if (invalidIds.length > 0) {
        await pool.query('DELETE FROM worker_device_tokens WHERE id = ANY($1::uuid[])', [invalidIds]);
      }
    }
    return { status: failureCount === 0 ? 'sent' : 'partial', successCount, failureCount };
  } catch (error) {
    console.error(`FCM delivery failed for incident ${incident.id}:`, error);
    return { status: 'failed' };
  }
}
