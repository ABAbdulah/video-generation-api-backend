# GenVideo backend — API + in-process Remotion render worker (M11).
#
# WHY A DOCKERFILE INSTEAD OF NIXPACKS: exports render in headless Chrome,
# which needs a set of system shared libraries Railway's Nixpacks image does
# not ship. Under Nixpacks the API boots fine and every export fails at
# render time with a missing-.so error. This image installs those libraries
# explicitly and bakes the browser in, so a deployed render behaves exactly
# like a local one.
#
# LAYER ORDER IS LOAD-BEARING: Remotion caches Chrome Headless Shell inside
# `node_modules/.remotion` (~270MB). Dependencies must be installed BEFORE
# the browser is fetched, and no install may run after it — a later
# `pnpm install` would prune that directory and the browser would be
# re-downloaded on the first production render (the exact failure this file
# exists to prevent).
FROM node:22-bookworm-slim

# --- Chrome Headless Shell runtime libraries -------------------------------
# Package list per Remotion's Linux requirements. Debian bookworm ships
# libasound2 (Ubuntu 24.04+ renamed it libasound2t64) — do not "modernise"
# this name or the build breaks on this base image.
#
# The fonts are OURS, not Remotion's list, and they are not optional: this
# product is kinetic typography, and a slim Debian image ships no fonts at
# all. Without them every text export renders as blank boxes. Liberation
# covers the Arial/Helvetica/Times metric-compatible families that generated
# scenes ask for via system-ui/sans-serif; DejaVu is the broad Unicode
# fallback; Noto Color Emoji keeps emoji from rendering as tofu.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 \
      libdbus-1-3 \
      libatk1.0-0 \
      libgbm-dev \
      libasound2 \
      libxrandr2 \
      libxkbcommon-dev \
      libxfixes3 \
      libxcomposite1 \
      libxdamage1 \
      libatk-bridge2.0-0 \
      libpango-1.0-0 \
      libcairo2 \
      libcups2 \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Dependencies ----------------------------------------------------------
# Copied separately so a source-only change doesn't invalidate the dependency
# and browser layers below.
RUN npm install -g pnpm@11
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# --- Bake the browser ------------------------------------------------------
# Downloads Chrome Headless Shell at BUILD time into node_modules/.remotion,
# so the first production export renders immediately instead of pulling
# ~113MB (and timing out the request that triggered it).
COPY scripts/ensure-browser.mjs ./scripts/ensure-browser.mjs
RUN node scripts/ensure-browser.mjs

# --- Application source ----------------------------------------------------
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle
COPY scripts ./scripts

# Pre-build the render composition's webpack bundle so the first export in
# production renders immediately instead of bundling on the request path.
RUN node --import tsx scripts/build-bundle.mjs

# Set after install so pnpm doesn't silently drop devDependencies above.
ENV NODE_ENV=production
# Railway injects PORT; index.ts falls back to 4000 locally.
EXPOSE 4000

CMD ["pnpm", "start"]
