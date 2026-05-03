# VerdictIQ

## Overview

Full-lifecycle court judgment intelligence system for government legal compliance. Processes High Court judgment PDFs through AI extraction, human verification, and department-ready action plan generation.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/verdictiq) — serves at `/`
- **API framework**: Express 5 (artifacts/api-server) — serves at `/api`
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Clerk (Replit-managed, `@clerk/react` + `@clerk/express`)

## Architecture

Four-step judgment lifecycle:
1. **Judgment Understanding** — case registration, PDF ingestion, AI directive extraction
2. **Action Plan Generation** — structured department-ready action items from directives
3. **Human Verification** — reviewer approves/edits/rejects every AI extraction
4. **Dashboard** — decision-maker view of verified action plans with full audit trail

## Key Pages

- `/` — Redirects: signed-in → `/dashboard`, signed-out → `/sign-in`
- `/sign-in`, `/sign-up` — Branded Clerk auth pages (split-screen layout)
- `/dashboard` — Command Center (stats, urgent items, department workload, activity feed)
- `/cases` — Court case list with search/filter
- `/cases/new` — Register a new case (admin/reviewer only)
- `/cases/:id` — Case detail (Directives / Action Plan / Compliance Timeline / Audit Trail tabs)
- `/cases/:id/verify` — Human-in-the-loop verification interface (admin/reviewer only)
- `/admin/users` — User management / role assignment (admin only)

## Authentication

- Replit-managed Clerk (`setupClerkWhitelabelAuth()` already run, app ID: `app_3DCis62LacqQ9KfEhhpVKO1PWX6`)
- Clerk proxy middleware mounted at `/api/__clerk` in Express before CORS/body parsers
- All API routes protected by `requireAuth` + `ensureUserExists` middlewares — health check exempt
- Frontend uses `ClerkProvider` in `App.tsx` with `@clerk/themes` shadcn theme + VerdictIQ amber branding
- Tailwind v4: `@layer theme, base, clerk, components, utilities;` in index.css; `tailwindcss({ optimize: false })` in vite.config.ts
- User profile + role badge in sidebar footer via `useUser` + `useClerk` + `useUserRole` hooks
- CRITICAL: `VITE_CLERK_PUBLISHABLE_KEY` used directly (not via publishableKeyFromHost) to avoid Clerk loading from Replit dev domain proxy

## RBAC

Three roles: `admin`, `reviewer`, `viewer` (stored in `users` table, `user_role` pg enum).

- **First user to sign up auto-becomes admin**; all subsequent users default to `viewer`
- `ensureUserExists` middleware auto-provisions the `users` row on first API request
- Role is exposed via `UserRoleContext` (`useUserRole()` hook) on the frontend

| Permission | Viewer | Reviewer | Admin |
|---|---|---|---|
| View cases/dashboard | ✓ | ✓ | ✓ |
| Register new case / Extract AI | — | — | ✓ |
| Verify directives / Edit case | — | ✓ | ✓ |
| Delete cases / Replace PDF | — | — | ✓ |
| Manage user roles | — | — | ✓ |

Key files:
- `artifacts/api-server/src/middlewares/auth.ts` — `requireAuth`, `ensureUserExists`, `requireRole`
- `artifacts/api-server/src/routes/users.ts` — `GET /me`, `GET /users`, `PATCH /users/:clerkId/role`
- `artifacts/verdictiq/src/contexts/UserRoleContext.tsx` — role context + provider
- `lib/db/src/schema/users.ts` — `usersTable`, `userRoleEnum`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Database Schema

- `users` — user accounts synced from Clerk (clerkId, email, fullName, role)
- `cases` — court case metadata (case number, court, bench, parties, status, urgency)
- `judgments` — ingested PDF records (hash, page count, OCR confidence, model version)
- `directives` — AI-extracted directives (type, classification, source text, page, confidence, verification status)
- `action_items` — department-ready action plan items derived from verified directives
- `audit_log` — immutable audit trail of all extractions and reviewer decisions

## API Routes

All routes require authentication except `GET /api/healthz`. Role requirements noted.

- `GET /api/me` — current user (any role)
- `GET /api/users` — list all users (admin)
- `PATCH /api/users/:clerkId/role` — update role (admin)
- `GET /api/cases` — list cases (any)
- `POST /api/cases` — create case (admin)
- `GET/PATCH /api/cases/:id` — case detail/update (any/reviewer+)
- `DELETE /api/cases/:id` — delete case (admin)
- `POST /api/cases/:id/process` — trigger AI processing (admin)
- `GET /api/cases/:id/directives` — list directives (any)
- `POST /api/cases/:id/directives/:directiveId/verify` — verify directive (reviewer+)
- `GET /api/cases/:id/action-plan` — verified action plan (any)
- `GET /api/cases/:id/compliance-timeline` — deadline timeline (any)
- `GET /api/dashboard/*` — dashboard stats (any)
- `GET /api/audit-log` — full audit trail (any)

## Codegen

Run `cd lib/api-spec && npx orval --config ./orval.config.ts` (not `pnpm codegen` — broken typecheck:libs step).
CRITICAL: `lib/api-client-react/src/index.ts` must export both `./generated/api` AND `./generated/api.schemas`.
`lib/api-zod/src/index.ts` exports ONLY `./generated/api` (no api.schemas in split zod output).

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
