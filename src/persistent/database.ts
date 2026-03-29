import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users } from './users.ts';
import { files } from './files.ts';
import { config } from './limits.ts';

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
};

// PostgreSQL connection configuration
const postgresHost = process.env.POSTGRES_HOST ?? 'postgres';
const postgresPort = parseInt(process.env.POSTGRES_PORT ?? '5432');
const postgresDatabase = process.env.POSTGRES_DB ?? 'concord';
const postgresUser = process.env.POSTGRES_USER ?? 'concord';
const postgresPassword = process.env.POSTGRES_PASSWORD ?? '';

// Create PostgreSQL connection pool
const client = postgres({
  host: postgresHost,
  port: postgresPort,
  database: postgresDatabase,
  user: postgresUser,
  password: postgresPassword,
  max: 20, // Connection pool size
  idle_timeout: 30,
  connect_timeout: 10,
});

// Create Drizzle instance with schema
export const db = drizzle(client, { schema: { users, files, config } });

/**
 * Initializes the PostgreSQL database connection.
 */
export async function initDatabase(): Promise<void> {
  try {
    // Test connection
    await client`SELECT 1`;
    console.log(`${colors.green}[database]${colors.reset} PostgreSQL connected!`);
  } catch (error) {
    console.error(`${colors.red}[database]${colors.reset} PostgreSQL connection failed:`, error);
    throw error;
  }
}

/**
 * Closes the PostgreSQL connection pool.
 */
export async function closeDatabase(): Promise<void> {
  await client.end();
  console.log(`${colors.cyan}[database]${colors.reset} PostgreSQL connection closed`);
}
