import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

/**
 * Pin strict TLS verification.
 *
 * `pg` today treats sslmode=prefer|require|verify-ca as aliases for verify-full,
 * and warns on every connection that pg v9 / pg-connection-string v3 will switch
 * them to libpq semantics — which have weaker guarantees. Neon presents a
 * publicly trusted certificate, so verify-full already works; making it explicit
 * means a future dependency bump cannot silently downgrade our TLS verification.
 *
 * Surgical string edit rather than a URL round-trip on purpose: re-serialising
 * the connection string risks re-encoding the password.
 */
function pinStrictSsl(url: string): string {
  return url.replace(/([?&]sslmode=)(prefer|require|verify-ca)\b/i, "$1verify-full");
}

// Reuse the pool across HMR reloads in dev so we don't leak connections.
const globalForDb = globalThis as unknown as { __pgPool?: Pool };

const pool =
  globalForDb.__pgPool ??
  new Pool({
    connectionString: pinStrictSsl(process.env.DATABASE_URL),
    max: 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pgPool = pool;
}

export const db = drizzle(pool, { schema });

export type Db = typeof db;
/** The transaction handle passed to db.transaction(async (tx) => ...) */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
