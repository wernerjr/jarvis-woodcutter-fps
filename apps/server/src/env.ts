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
});

export const env = EnvSchema.parse(process.env);
