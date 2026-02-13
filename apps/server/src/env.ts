import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3023),

  // Prefer Infisical var (WOODCUTTER_DATABASE_URL). Fallback to DATABASE_URL.
  // Fail fast if missing/blank to avoid silently running without persistence.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required').default(
    process.env.WOODCUTTER_DATABASE_URL || process.env.DATABASE_URL || ''
  ),

  // Secret used to sign short-lived WS auth tokens returned by /api/auth/guest.
  // For production: set via Infisical.
  WOODCUTTER_WS_AUTH_SECRET: z
    .string()
    .min(8, 'WOODCUTTER_WS_AUTH_SECRET must be at least 8 chars')
    .default(process.env.WOODCUTTER_WS_AUTH_SECRET || process.env.WS_AUTH_SECRET || 'dev-insecure-secret'),
});

export const env = EnvSchema.parse(process.env);
