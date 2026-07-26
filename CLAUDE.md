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
5. Paid tiers (M7, built 2026-07-26): `generate()` does RAG few-shot from the
   corpus → provider call → validate → ONE repair pass with the validator's
   errors fed back (M8); still-invalid output is refused and never billed.
   Starter (gemini-2.5-flash) prefers GEMINI_API_KEY and transparently falls
   back to OpenRouter ("google/<id>") when only OPENROUTER_API_KEY is set.
   Best = anthropic/claude-sonnet-5, Pro = anthropic/claude-opus-5 — ids
   verified against the live OpenRouter catalog 2026-07-26. A tier with no
   usable key throws NotConfiguredError → the same clean, unbilled 501.
   The vitest suite STRIPS provider keys (vitest.setup.ts) so it never spends
   money; live checks are manual via `pnpm smoke:llm [pro]` (costs cents).

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

## M11 — exports (built 2026-07-26, live-verified)

Paid plans (beginner/pro) export MP4/WebM/GIF; free tier gets a clean 403
tier_locked the UI renders as an upgrade prompt. Architecture:
- The `exports` table IS the queue. `src/render/worker.ts` runs IN-PROCESS
  with the API (no separate service): claims rows with FOR UPDATE SKIP
  LOCKED (replica-safe — proven live with two concurrent workers), renders
  via @remotion/renderer + headless Chrome, stores bytes in `file_data`
  (bytea; blob storage swap point = fileData → outputUrl).
- `src/render/composition/DynamicScene.tsx` is BROWSER-CONTEXT code (webpack
  bundle, executes only inside Remotion's Chrome) — the one sanctioned
  `new Function` in this repo; `tests/no-eval.test.ts` pins it there and
  forbids the API from importing the composition.
- Routes: POST /api/exports (gated), GET /:id, GET /:id/download (bytes,
  bearer-auth — frontend downloads via blob), GET /scene/:id/list.
- Manual e2e: `pnpm smoke:render [all|mp4|webm|gif]`.
- ⚠️ **Railway MUST build from the Dockerfile, not Nixpacks.** Confirmed in
  production 2026-07-26: the Nixpacks image lacks Chrome's shared libraries,
  so every export failed with `Closed with 127` seconds after being queued.
  `railway.json` now pins `builder: DOCKERFILE`. The Dockerfile installs
  those libs, installs FONTS (a slim Debian image has none — without them a
  kinetic-typography product renders blank text), bakes Chrome Headless Shell
  at build time, and pre-builds the webpack bundle so the first export is
  fast. Verified by building the image locally and rendering mp4/webm/gif.
- DEBUGGING NOTE: the deployed worker polls the SAME Neon database as your
  laptop. While production runs a build that can't render, it will claim and
  fail local test exports within seconds, which looks exactly like local
  flakiness. Set DISABLE_RENDER_WORKER=1 on the deployed service (or fix the
  deploy) before trusting local export tests.
- `RENDER_LOG_LEVEL=verbose` streams full Chrome output; Remotion truncates
  the error it throws to 500 chars, which hides the real launch failure.

Also built same day: `GET /api/templates` (public corpus for the gallery)
and `GET /api/scenes/recent` (workspace-scoped history) — see routes/library.ts.

## Next milestone

Remaining roadmap: **M9** (AI-authored params persistence), **M10** (full
version history UI), **M12** (multi-scene), **M13** (community templates),
**M14** (analytics), plus the differentiators (verification loop,
patch-based editing). Prod env for paid tiers: `OPENROUTER_API_KEY`
(Best/Pro + Starter fallback), optionally `GEMINI_API_KEY`. The OpenRouter
account must hold credit — it reserves `max_tokens` (8000) worth up front,
so a near-zero balance 402s.
