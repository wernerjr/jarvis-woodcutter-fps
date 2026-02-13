import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3023),
  DATABASE_URL: z.string().default('postgres://jarvis:jarvis@postgres:5432/jarvis'),
});

export const env = EnvSchema.parse(process.env);
