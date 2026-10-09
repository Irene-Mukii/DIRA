import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured in .env.local");
}

const globalForPg = globalThis as typeof globalThis & {
  diraPool?: Pool;
};

export const pool =
  globalForPg.diraPool ??
  new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.diraPool = pool;
}
