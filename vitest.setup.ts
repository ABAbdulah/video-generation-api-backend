import { config } from "dotenv";

// Load env before any test imports lib/db (which reads DATABASE_URL at import).
config({ path: ".env.local" });

// Tests never mint real browser sessions, but the JWT module refuses to start
// without a secret — give it a throwaway one when the env doesn't provide it.
process.env.AUTH_SECRET ??= "vitest-only-secret-never-use-in-production";

// Never let the suite reach real LLM providers: with the keys stripped, paid
// tiers deterministically take the NotConfigured → 501 path, costing nothing.
// (Live provider checks are a manual script, not part of the suite.)
delete process.env.OPENROUTER_API_KEY;
delete process.env.GEMINI_API_KEY;
