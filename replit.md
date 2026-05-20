# SafePlayer

A security-first family media player that automatically protects viewers by detecting unsafe content and skipping it in real-time. Parents control child access via role-based accounts, PIN locks, and a global validated frame database.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, served at /api)
- `pnpm --filter @workspace/safeplayer run dev` — run the React frontend (served at /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — session signing secret

## Demo Accounts

- **Admin (Parent):** `parent@family.com` / `password123`
- **Viewer (Child):** `child@family.com` / `viewer123`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS v4 (at `/`)
- API: Express 5 (at `/api`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Auth: express-session + bcryptjs + connect-pg-simple
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/` — DB schema files (users, media, jumpframes, submissions, flagged_content, activity)
- `artifacts/api-server/src/routes/` — Express route handlers (auth, media, jumpframes, submissions, admin)
- `artifacts/safeplayer/src/` — React frontend (pages: auth, dashboard, player, admin, settings)
- `artifacts/safeplayer/src/lib/auth.tsx` — AuthProvider and useAuth hook
- `lib/api-client-react/src/generated/` — Generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — Generated Zod schemas (do not edit)

## Architecture decisions

- Sessions stored in PostgreSQL via connect-pg-simple for persistent auth across restarts
- Jump frame skip engine runs entirely client-side on `timeupdate` events for zero-latency skipping
- Dual jump frame sources: `personal` (user-created) and `global` (community-validated)
- AI guardrail logic flags `sexual` and `violence` category submissions at the API layer; blocks playback for non-admins
- PIN verification issues a short-lived unfilteredToken (30 min) stored in session; never in localStorage

## Product

- **Media Library:** Load local video files or stream URLs; auto-checks both personal and global databases
- **Safe Mode:** Automatic skip engine fires when playback hits a registered start_time; seeks to end_time
- **RBAC:** Admin (parent) and Viewer (child) roles; Viewer cannot disable filtering
- **PIN Lock:** Admins set a 4-8 digit PIN; unfiltered mode requires PIN re-entry; 30-min session
- **Frame Submission:** Users submit start/end timestamps + category; free tier saves locally, premium submits to global queue
- **Admin Dashboard:** User management, pending submission approval, AI-flagged content review, activity feed
- **Tier System:** Free (ad-supported, personal frames only) vs Premium (global validated database access)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing openapi.yaml
- Always run `pnpm --filter @workspace/db run push` after changing schema files
- The `dark` CSS class must be applied to the `<html>` element (not via `@apply dark`) in Tailwind v4
- Sessions require `SESSION_SECRET` env var — falls back to dev default if missing

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
