import type { Config } from 'drizzle-kit';

export default {
  schema: ['./src/persistent/*.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.POSTGRES_HOST ?? 'postgres',
    port: parseInt(process.env.POSTGRES_PORT ?? '5432'),
    database: process.env.POSTGRES_DB ?? 'concord',
    user: process.env.POSTGRES_USER ?? 'concord',
    password: process.env.POSTGRES_PASSWORD ?? '',
  },
} satisfies Config;
