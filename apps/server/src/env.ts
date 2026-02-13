import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3023),
  DATABASE_URL: z.string().default('postgres://woodcutter:woodcutter@shared-postgres:5432/woodcutter'),
});

export const env = EnvSchema.parse(process.env);
