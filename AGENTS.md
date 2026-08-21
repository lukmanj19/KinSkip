# Base44 Dev Environment

## Stack
- pnpm monorepo (Node 24, TypeScript). Workspaces in `artifacts/*`, `lib/*`, `scripts`.
- **Frontend**: `@workspace/safeplayer` — React + Vite, served on host port 3000 (`/`).
- **API**: `@workspace/api-server` — Express 5, internal port 8080, mounted at `/api`.
- **DB**: PostgreSQL 16 + Drizzle ORM.

## Running
```
docker compose -f docker-compose.base44.yml up -d
```
Services: `postgres`, `dependencies` (one-shot `pnpm install`), `db-setup` (one-shot `drizzle-kit push`), `api`, `web`.

## Wiring notes
- **Single-origin**: only port 3000 is public. The Vite dev server proxies `/api` → `http://api:8080` (added in `artifacts/safeplayer/vite.config.ts`). Session cookies stay same-origin.
- `node_modules` lives in a named volume (`safeplayer-node-modules`) shared by all app services; the one-shot `dependencies` service populates it.
- `pnpm install` needs `--config.dangerouslyAllowAllBuilds=true` because pnpm v11 hard-errors on unapproved build scripts (esbuild postinstall) — the repo's `onlyBuiltDependencies` alone isn't enough in a fresh non-interactive install.
- The API has **no live-reload** dev command — its `dev` script builds an esbuild bundle then runs `node ./dist/index.mjs`. After API source edits, restart the `api` service and call `reload_preview`. Frontend edits hot-reload via Vite.

## Required env (all local, no external secrets needed to boot)
- `DATABASE_URL` — Postgres connection string (compose-generated: `postgresql://safeplayer:safeplayer_dev@postgres:5432/safeplayer`).
- `SESSION_SECRET` — session signing key (compose-generated dev default).
- `PORT` / `BASE_PATH` — required by the Vite config (set to `3000` / `/`).

## Optional external credentials (NOT required to boot)
- `OPENSUBTITLES_API_KEY`, `OPENSUBTITLES_USERNAME`, `OPENSUBTITLES_PASSWORD` — only for the subtitles search/proxy feature (`artifacts/api-server/src/routes/subtitles.ts`). The app runs fine without them; those endpoints return empty results.

## Verification
- `curl -H "Host: external-preview.example.com" http://localhost:3000/` → HTML with `<title>SafePlayer`.
- `curl http://localhost:3000/api/healthz` → `{"status":"ok"}`.
- `curl http://localhost:3000/src/main.tsx` → served TS source (confirms live source, not a prebuilt bundle).

## Demo accounts
The repo README lists `parent@family.com` / `password123` and `child@family.com` / `viewer123`, but there is **no seed script** — the DB starts empty. Use the register page to create accounts (max 2 admins enforced server-side).
