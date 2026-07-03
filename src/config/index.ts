import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SESSION_PATH: z.string().default('./session'),
  LOG_PATH: z.string().default('./logs'),
  // Filters out groups. Empty array means allowed groups filtering is disabled.
  ALLOWED_GROUPS: z
    .string()
    .optional()
    .default('')
    .transform((val) => (val ? val.split(/[;|]/).map((s) => s.trim()) : [])),
  // Database configuration (PostgreSQL)
  DB_HOST: z.string().default('localhost'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_NAME: z.string().default('whatsapp_db'),
  DB_PORT: z
    .string()
    .optional()
    .default('5432')
    .transform((val) => parseInt(val, 10)),
});

// Safely parse process.env
const parseConfig = () => {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error('❌ Invalid environment configuration:');
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }

  return result.data;
};

export const config = parseConfig();
export type Config = z.infer<typeof configSchema>;
