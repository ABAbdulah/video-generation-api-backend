# genvideo-backend

The API service for **GenVideo AI** — an AI motion-design platform where a
text prompt becomes an animated motion graphic, generated as React/Remotion
code rather than video pixels.

This repo owns every trusted concern: database, auth, credits, moderation,
rate limiting, template retrieval, and the generation pipeline. The frontend
(separate repo: `video-generation-api`, `web/`) is a pure UI over this API.

## Stack

- **Express 5** + TypeScript, run with `tsx` (no build step)
- **Neon Postgres** + pgvector, **Drizzle ORM**
- **JWT auth** (bearer tokens, bcryptjs + jsonwebtoken)
- **zod** validation, **vitest** (153 tests against the real DB)

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | — | create account → `{ token, user }` |
| POST | `/api/auth/login` | — | sign in → `{ token, user }` |
| GET | `/api/auth/me` | Bearer | user + workspace plan + credit balance |
| GET | `/api/models` | — | client-safe tier list (no model ids/providers) |
| POST | `/api/generate` | Bearer | prompt + tier → validated scene code |
| GET | `/api/health` | — | liveness (no DB touch) |

## Getting started

```bash
pnpm install
cp .env.example .env.local     # fill in DATABASE_URL + AUTH_SECRET
pnpm db:migrate                # apply migrations to Neon
pnpm db:seed                   # seed the 47-template corpus
pnpm embed:templates           # compute embeddings (required)
pnpm dev                       # http://localhost:4000
```

Verify: `pnpm typecheck && pnpm test`

## Deploy (Railway)

`railway.json` is committed: Nixpacks build, `pnpm start`, healthcheck
`/api/health`. Set `DATABASE_URL`, `AUTH_SECRET`, and `FRONTEND_ORIGIN`
(the deployed web app's origin, comma-separated for multiple) in the service
env. Migrations are intentionally **not** run on deploy — run them manually.
