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
- `/cases/:id` — Case detail (Directives / Action Plan / Compliance Timeline / Audit Trail / Comments tabs)
- `/cases/:id/verify` — Human-in-the-loop verification interface with full judgment text panel
- `/admin/users` — User management / role assignment + role change history (admin only)

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
- `artifacts/api-server/src/routes/users.ts` — `GET /me`, `GET /users`, `PATCH /users/:clerkId/role`, `GET /role-change-log`
- `artifacts/verdictiq/src/contexts/UserRoleContext.tsx` — role context + provider
- `lib/db/src/schema/users.ts` — `usersTable`, `userRoleEnum`

## Features (as of v1.1)

### 1. Auto-Status Transitions
After all directives for a case are verified, the case status automatically transitions from `processing` → `verified`.
- Backend: `artifacts/api-server/src/routes/directives.ts` — counts pending directives after each verify call; sets case status to `"verified"` if count reaches zero.

### 2. Judgment Text Panel (Full-Text Viewer)
The verify page shows the raw judgment text with the directive's source text highlighted and auto-scrolled into view.
- Toggle between "Show extract only" (highlighted excerpt) and "Show full text" (complete rawTextPreview).
- Backend: `GET /api/cases/:id/judgment-text` — returns `rawTextPreview` from `judgmentsTable`.
- Frontend: `artifacts/verdictiq/src/pages/cases/verify.tsx`

### 3. Case Comments
Thread-style comments on each case, visible in a dedicated Comments tab on the case detail page.
- Backend: `GET/POST /api/cases/:id/comments` in `artifacts/api-server/src/routes/comments.ts`
- DB table: `case_comments` (id, caseId FK, authorName, authorRole, content, createdAt)
- Frontend: Comments tab in `artifacts/verdictiq/src/pages/cases/detail.tsx`

### 4. Export Action Plan as CSV
Admins and reviewers can download the verified action plan as a CSV file from the case detail page.
- Frontend only: button in the Action Plan tab of `detail.tsx`; uses `encodeURIComponent` + data URI download.
- CSV columns: directive type, department, action, deadline, priority, status.

### 5. Audit Log for Role Changes
Every admin role change is recorded immutably with actor, target, old role, new role, and timestamp.
- Backend: `GET /api/users/role-change-log` in `artifacts/api-server/src/routes/users.ts`; PATCH role route appends to log.
- DB table: `role_change_log` (id, actorClerkId, actorName, targetClerkId, targetName, oldRole, newRole, changedAt)
- Frontend: Role Change History card in `/admin/users`.

### 6. Audit Log Filtering
The Audit Trail tab on case detail supports filtering by event type and date range.
- Backend: `GET /api/audit-log?caseId=&eventType=&dateFrom=&dateTo=` in `artifacts/api-server/src/routes/audit.ts`
- Date params handled as raw query strings (not Zod date objects) to avoid query string coercion issues.
- Frontend: filter controls in Audit Trail tab of `detail.tsx`.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Database Schema

- `users` — user accounts synced from Clerk (clerkId, email, fullName, role)
- `cases` — court case metadata (case number, court, bench, parties, status, urgency)
- `judgments` — ingested PDF records (hash, page count, OCR confidence, model version, rawTextPreview)
- `directives` — AI-extracted directives (type, classification, source text, page, confidence, verification status)
- `action_items` — department-ready action plan items derived from verified directives
- `audit_log` — immutable audit trail of all extractions and reviewer decisions
- `case_comments` — thread-style comments on cases (authorName, authorRole, content, createdAt)
- `role_change_log` — immutable log of admin role assignments (actor, target, old/new role, timestamp)

## API Routes

All routes require authentication except `GET /api/healthz`. Role requirements noted.

- `GET /api/me` — current user (any role)
- `GET /api/users` — list all users (admin)
- `PATCH /api/users/:clerkId/role` — update role (admin); appends to role_change_log
- `GET /api/users/role-change-log` — role change history (admin)
- `GET /api/cases` — list cases (any)
- `POST /api/cases` — create case (admin)
- `GET/PATCH /api/cases/:id` — case detail/update (any/reviewer+)
- `DELETE /api/cases/:id` — delete case (admin)
- `POST /api/cases/:id/process` — trigger AI processing (admin)
- `GET /api/cases/:id/judgment-text` — raw text preview from judgment (any)
- `GET /api/cases/:id/directives` — list directives (any)
- `POST /api/cases/:id/directives/:directiveId/verify` — verify directive; triggers auto-status (reviewer+)
- `GET /api/cases/:id/action-plan` — verified action plan (any)
- `GET /api/cases/:id/compliance-timeline` — deadline timeline (any)
- `GET /api/cases/:id/comments` — list comments (any)
- `POST /api/cases/:id/comments` — add comment (any)
- `GET /api/dashboard/*` — dashboard stats (any)
- `GET /api/audit-log` — full audit trail with optional filters: caseId, eventType, dateFrom, dateTo (any)

## Codegen

Run `cd lib/api-spec && npx orval --config ./orval.config.ts` (not `pnpm codegen` — broken typecheck:libs step).
CRITICAL after codegen:
1. Fix `lib/api-zod/src/index.ts` to export ONLY `./generated/api` (Orval adds a broken `api.schemas` line — remove it).
2. Run `cd lib/api-client-react && npx tsc --build` to rebuild declaration files in `dist/` so verdictiq can resolve the new hooks via project references.

`lib/api-client-react/src/index.ts` must export both `./generated/api` AND `./generated/api.schemas`.
`lib/api-zod/src/index.ts` exports ONLY `./generated/api` (no api.schemas in split zod output).

Hook call pattern: all orval-generated `useGet*`/`useList*` hooks require `queryKey` in the `query` option (TanStack Query v5 constraint). Always pass the corresponding `get*QueryKey()` helper alongside other options.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
