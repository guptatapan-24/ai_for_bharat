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
- `/cases/new` — Register a new case
- `/cases/:id` — Case detail (Directives / Action Plan / Compliance Timeline / Audit Trail tabs)
- `/cases/:id/verify` — Human-in-the-loop verification interface

## Authentication

- Replit-managed Clerk (`setupClerkWhitelabelAuth()` already run, app ID: `app_3DCis62LacqQ9KfEhhpVKO1PWX6`)
- Clerk proxy middleware mounted at `/api/__clerk` in Express before CORS/body parsers
- All API routes protected by `requireAuth` middleware (getAuth from @clerk/express) — health check exempt
- Frontend uses `ClerkProvider` in `App.tsx` with `@clerk/themes` shadcn theme + VerdictIQ amber branding
- Tailwind v4: `@layer theme, base, clerk, components, utilities;` in index.css; `tailwindcss({ optimize: false })` in vite.config.ts
- User profile + sign-out in sidebar footer via `useUser` + `useClerk` hooks
- CRITICAL: `VITE_CLERK_PUBLISHABLE_KEY` used directly (not via publishableKeyFromHost) to avoid Clerk loading from Replit dev domain proxy

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Database Schema

- `cases` — court case metadata (case number, court, bench, parties, status, urgency)
- `judgments` — ingested PDF records (hash, page count, OCR confidence, model version)
- `directives` — AI-extracted directives (type, classification, source text, page, confidence, verification status)
- `action_items` — department-ready action plan items derived from verified directives
- `audit_log` — immutable audit trail of all extractions and reviewer decisions

## API Routes

All routes require authentication except `GET /api/healthz`.

- `GET/POST /api/cases` — list/create cases
- `GET/PATCH /api/cases/:id` — case detail/update
- `POST /api/cases/:id/process` — trigger AI processing
- `GET /api/cases/:id/directives` — list extracted directives
- `POST /api/cases/:id/directives/:directiveId/verify` — human verification decision
- `GET /api/cases/:id/action-plan` — verified action plan
- `GET /api/cases/:id/compliance-timeline` — deadline timeline
- `GET /api/dashboard/summary` — system stats
- `GET /api/dashboard/urgent` — urgent items
- `GET /api/dashboard/department-workload` — per-department breakdown
- `GET /api/dashboard/recent-activity` — activity feed
- `GET /api/audit-log` — full audit trail

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
