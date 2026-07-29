# FlowForge — Project Status

_Last updated: 2026-07-29_

## Where we are

**Milestone 0 (Foundation) is in progress.** No product feature work has started yet — the repo currently consists of the architecture/design docs in `docs/` plus a bare scaffold. This file tracks progress against the phase breakdown in `docs/06-implementation-phases.md`; update it as phases complete.

### Done
- pnpm workspace scaffold (Replit-native layout — see "Where Things Live" in `replit.md`; it maps to the production layout in `docs/04-folder-structure.md`, folder names differ but the architecture is the same)
- Postgres database provisioned (`DATABASE_URL` set)
- API server artifact (`artifacts/api-server`) running Express 5 with Pino logging, CORS, JSON body parsing — confirmed running on port 8080
- `GET /api/healthz` health check endpoint, backed by a Zod schema and OpenAPI-driven codegen (Orval → `@workspace/api-zod`, `@workspace/api-client-react`)
- Canvas/mockup-sandbox artifact scaffolded (for design prototyping only — not the product's workflow canvas, which is still unbuilt)

### Not started
- Drizzle schema — `lib/db/src/schema/index.ts` is still the empty template; none of the MVP tables from `docs/02-database-schema.md` exist yet (`workflows`, `workflow_versions`, `nodes`, `node_connections`, `executions`, `execution_logs`, `credentials`, `webhooks`, ...)
- Redis + BullMQ queue infrastructure (no `REDIS_URL` yet)
- `ENCRYPTION_KEY` secret (needed once the credential store is built — Phase 1.7)
- Worker process / artifact for workflow execution (proposed as project task #4)
- Frontend canvas editor artifact (proposed as project task #3)
- Remaining Phase 0.3 pieces: `/api/ready` (DB + Redis check), a global error handler, and a request-logger middleware as their own files — the health check works today but these are separate per `docs/06-implementation-phases.md`
- Everything in Milestone 1 (MVP) onward

### Replit-specific notes
- `docs/04-folder-structure.md` describes the target **production/self-hosted** layout (`apps/`, `packages/`, `infra/` with Docker Compose, Kubernetes, Helm). On Replit this project instead uses the pnpm-workspace template's `artifacts/` + `lib/` layout (see `replit.md`). Same architecture, different folder names — don't try to reconcile them literally.
- Phase 0.5 (Docker Compose + CI) doesn't apply on Replit — Replit's own workflow system and autoscale deployment target replace it for dev and prod respectively. Skip it here; it would only matter for a separate self-hosted distribution.

## MVP scope (confirmed)

Per `docs/01-architecture.md`, `docs/02-database-schema.md`, and `docs/03-api-specification.md`, the MVP is deliberately **single-tenant and unauthenticated**:
- No user accounts, no login/register/sessions, no JWTs
- No `users` or `workspaces` tables — every row in the MVP schema is global and unscoped (no `owner_id` / `workspace_id` / `created_by` anywhere)
- The REST API has no access control and is meant to run only on `localhost` or a trusted private network
- Auth, workspaces, teams, RBAC, API keys, and audit logs are fully designed but intentionally excluded from the MVP; they land later as a purely additive migration (see "Additive Migration Sketch" in `docs/02-database-schema.md`) — now its own **Milestone 4 — Authentication & Multi-Tenancy** in the roadmap

## Documentation fix applied this session

`docs/05-development-roadmap.md` and `docs/06-implementation-phases.md` still described Milestone 1 (MVP) as including full authentication (register/login/JWT) and multi-user workspaces — left over from an earlier plan, contradicting the no-auth MVP decision already locked into docs 01–04. Corrected:
- Removed Auth and Workspaces deliverables/phases from Milestone 1 — MVP now only covers the workflow editor, core nodes, execution engine, webhooks, real-time execution UI, and credential store (all ownerless in the MVP schema)
- Renumbered the remaining MVP phases (were 1.3–1.9, now 1.1–1.7) and fixed their dependency references
- Moved Authentication + Workspaces into **Milestone 4 — Authentication & Multi-Tenancy**, positioned after Integration Nodes (renumbered from Milestone 4 to **Milestone 3**) — this ordering matches how `docs/03-api-specification.md` and `docs/04-folder-structure.md` already referred to "Milestone 3 (Integration Nodes)" and "the Authentication & Multi-Tenancy milestone" by name
- No architecture, schema, or API contract changed — this was purely a roadmap sequencing fix

## Next phase

**Phase 0.2 — Database Schema & Migrations** (`docs/06-implementation-phases.md`): write the Drizzle schema for the MVP tables in `lib/db/src/schema/`, matching `docs/02-database-schema.md` exactly (columns, indexes, relationships), then push it to the already-provisioned Postgres database with `pnpm --filter @workspace/db run push`. Nothing else in Milestone 1 can start until this exists.
