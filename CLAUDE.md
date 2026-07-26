# GenVideo AI — Backend Repo — Project Context

> Auto-read by Claude Code at session start. This repo is the **server half**
> of GenVideo AI, split out of the `../video-generation-api` monorepo on
> 2026-07-26. The frontend (Next.js, `../video-generation-api/web`) talks to
> this service over HTTP only.

## What this is

Express 5 + TypeScript API for an AI motion-design platform. Owns everything
trusted: Neon Postgres (Drizzle + pgvector), JWT auth, the append-only credit
ledger, prompt moderation, per-workspace rate limiting, the template corpus +
retrieval, and the generation endpoint. Runs via `tsx` (no build step).

## Map

```
src/
  index.ts                 entrypoint (loads .env.local, starts Express)
  app.ts                   createApp(): CORS, JSON, auth middleware, routes
  middleware/auth.ts       bearer-token → req.userId (attachUser / requireAuth)
  routes/                  auth (signup/login/me), models, generate, health
  lib/
    auth/jwt.ts            HS256 session tokens (AUTH_SECRET, 30d)
    auth/service.ts        signup/login logic (framework-agnostic, tested directly)
    auth/provision.ts      new user → workspace + 30-credit signup grant
    generation/handler.ts  THE generation pipeline — read its header; the
                           10-step security ordering is load-bearing
    db/                    Drizzle schema + pool (strict TLS pin for Neon)
    credits/ledger.ts      append-only ledger — debit INSIDE the persisting tx
    workspace.ts           workspace/project resolution, IDOR guard
    ratelimit.ts           DB-backed windows over generation_events
    ai/                    models ladder (SERVER ONLY), generate façade,
                           moderation, sanitize, embeddings, Mini provider
    templates/             corpus (47), validate (parse + import whitelist),
                           pgvector retrieval
drizzle/                   migrations (latest: 0003) — run manually, never on deploy
scripts/                   seed, embed-templates, validate-templates
tests/                     153 tests, hit the real Neon DB, sequential
```

## Invariants (do not break)

1. **The client sends a TIER, never a model id.** Model ids/providers never
   appear in any response — `contract.ts` is the only vocabulary the frontend
   sees; `sanitize.ts` scrubs model-authored text; supertest asserts it.
2. **The server never executes generated code** — it only parses to validate.
   `tests/no-eval.test.ts` sweeps src/ for `new Function`/`eval`.
3. **Rate limit sits OUTSIDE moderation** (oracle prevention — see handler.ts).
4. **Debits land inside the scene-persisting transaction** — never charge for
   a generation that didn't persist. Invalid output is refused and not billed.
5. Paid tiers (starter/best/pro) **throw until M7**; the route maps that to a
   501 that names no provider. Model ids in `models.ts` are UNVERIFIED — check
   openrouter.ai/models + ai.google.dev before wiring them.

## Run & verify

```bash
pnpm dev            # tsx watch, :4000 — needs .env.local (see .env.example)
pnpm typecheck      # clean
pnpm test           # 153 passing (needs DATABASE_URL; sequential, ~2min)
pnpm db:migrate     # drizzle migrations against Neon (latest: 0003)
pnpm db:seed        # idempotent corpus seed
pnpm embed:templates  # REQUIRED after seeding or Mini throws
```

Env: `DATABASE_URL`, `AUTH_SECRET` (required), `FRONTEND_ORIGIN` (CORS,
comma-separated), `PORT` (Railway injects), `GEMINI_API_KEY` (optional,
upgrades embeddings), `OPENROUTER_API_KEY` (M7).

Deploy: Railway, `railway.json` present — start `pnpm start`, healthcheck
`/api/health`. No GitHub remote yet — Abdullah must create and push one.

## Next milestone

**M7 — wire the paid tiers** in `lib/ai/generate.ts` (gemini-direct +
openrouter branches), RAG few-shot from `retrieveTemplates()`, then the M8
validation retry loop. Re-check sanitize/whitelist against real untrusted
output when that lands.
