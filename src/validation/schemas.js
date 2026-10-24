import { z } from 'zod';

export const incidentIdParams = z.object({
  id: z.string().uuid()
});

export const newIncidentBody = z.object({
  deviceId: z.string().trim().min(1).max(100),
  eventType: z.string().trim().min(1).max(100),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  status: z.literal('PENDING').optional(),
  source: z.string().trim().min(1).max(100),
  notes: z.string().trim().max(2000).optional()
}).strict();

export const incidentListQuery = z.object({
  status: z.enum(['PENDING', 'ACKNOWLEDGED', 'RESOLVED']).optional()
}).strict();

export const statusUpdateBody = z.object({
  status: z.enum(['ACKNOWLEDGED', 'RESOLVED']),
  notes: z.string().trim().max(2000).optional()
}).strict();

export const loginBody = z.object({
  email: z.string().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(200)
}).strict();

export const registrationBody = z.object({
  email: z.string().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(200)
}).strict();

export const deviceTokenBody = z.object({
  token: z.string().trim().min(20).max(4096)
}).strict();
