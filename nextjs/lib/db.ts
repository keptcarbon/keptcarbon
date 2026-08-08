import { Pool } from "pg";

/**
 * Singleton PostgreSQL connection pool.
 * Uses DATABASE_URL from the environment.
 */
const globalForPg = globalThis as unknown as { pgPool: Pool | undefined };

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

// Prevent creating multiple pools in development (hot reload)
if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}
