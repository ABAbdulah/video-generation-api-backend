import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (expected in .env.local)");
}

// Same strict-TLS pin as the runtime pool (see lib/db/index.ts for why).
// Duplicated rather than imported: drizzle-kit loads this config outside the
// app's module graph, and importing lib/db here would open a second pool.
const url = process.env.DATABASE_URL.replace(
  /([?&]sslmode=)(prefer|require|verify-ca)\b/i,
  "$1verify-full",
);

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
