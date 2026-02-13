import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3023),
  // Prefer Infisical var (WOODCUTTER_DATABASE_URL). Fallback to DATABASE_URL.
  DATABASE_URL: z
    .string()
    .default(
      process.env.WOODCUTTER_DATABASE_URL ||
        process.env.DATABASE_URL ||
        'postgres://woodcutter:woodcutter@shared-postgres:5432/woodcutter'
    ),
});

export const env = EnvSchema.parse(process.env);
