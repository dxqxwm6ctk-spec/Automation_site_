# FlowForge — Project Status

_Last updated: 2026-07-29_

## Where we are

**Milestone 0 (Foundation) is complete; Milestone 1 (MVP) has not started yet.** No product feature work has started — the repo has the architecture/design docs in `docs/`, a working DB schema, and an API skeleton with health/readiness/error-handling foundations, but no workflow, node, or execution functionality yet. This file tracks progress against the phase breakdown in `docs/06-implementation-phases.md`; update it as phases complete.

### Done
- pnpm workspace scaffold (Replit-native layout — see "Where Things Live" in `replit.md`; it maps to the production layout in `docs/04-folder-structure.md`, folder names differ but the architecture is the same)
- Postgres database provisioned (`DATABASE_URL` set)
- API server artifact (`artifacts/api-server`) running Express 5 with Pino logging, CORS, JSON body parsing — confirmed running on port 8080
- `GET /api/healthz` health check endpoint, backed by a Zod schema and OpenAPI-driven codegen (Orval → `@workspace/api-zod`, `@workspace/api-client-react`)
- Canvas/mockup-sandbox artifact scaffolded (for design prototyping only — not the product's workflow canvas, which is still unbuilt)
- **Phase 0.2 — Database Schema & Migrations is complete.** Drizzle schema for all 8 MVP tables (`workflows`, `workflow_versions`, `nodes`, `node_connections`, `executions`, `execution_logs`, `credentials`, `webhooks`) lives in `lib/db/src/schema/`, matching `docs/02-database-schema.md` exactly — columns, indexes, foreign keys, and CHECK constraints on the enum-like columns (`executions.status`, `executions.trigger_type`, `execution_logs.status`, `webhooks.response_mode`; these were added this session to close the only gap versus the doc). Pushed to Postgres with `pnpm --filter @workspace/db run push`; all tables/indexes/FKs/CHECK constraints confirmed present in the database. The app-side Drizzle client (`lib/db/src/index.ts`) was verified end-to-end with a live insert/select/delete round-trip against `workflows`.
- **Phase 0.3 — API Skeleton + Health Endpoints is complete.**
  - `GET /api/ready` added (`artifacts/api-server/src/routes/health.ts`): runs a live `SELECT 1` against Postgres via the shared `pool` from `@workspace/db`, and reports Redis as `"not_configured"` (honest, not faked — Redis isn't provisioned until Phase 0.4, and it does not gate readiness). Responds `200` with `status: "ok"` when Postgres is reachable, `503` with `status: "degraded"` otherwise. Schema (`ReadinessStatus`) added to `lib/api-spec/openapi.yaml` and codegen'd into `@workspace/api-zod`.
  - Global error handling foundation added per `docs/01-architecture.md` / `docs/03-api-specification.md`'s RFC 7807 contract: `artifacts/api-server/src/lib/errors.ts` defines `AppError` (carries `code`/`statusCode`/`context`) and the full `ErrorCode` → HTTP status table from the docs' Error Codes list; `artifacts/api-server/src/middlewares/errorHandler.ts` exports `notFoundHandler` (404 fallback) and `errorHandler` (serialises `AppError`, `ZodError` — mapped to 422 `VALIDATION_ERROR` — and any other thrown error to Problem JSON `{ type, title, status, detail, instance, code }`; hides internals in production). Only `NOT_FOUND`/`INTERNAL_ERROR`/`VALIDATION_ERROR` are actually triggered today — the rest of the table is there for CRUD phases to reuse.
  - Request logging extracted from `app.ts` into its own `artifacts/api-server/src/middlewares/requestLogger.ts` (same Pino behavior, now modular per the documented file layout).
  - Test framework introduced for the first time in this repo: Vitest + Supertest, added to `artifacts/api-server` (`pnpm run test`, also wired into the root `pnpm run test`). 8 tests cover `/api/healthz`, `/api/ready` (live DB round-trip), the 404 Problem JSON fallback, and the error handler's `AppError` / `ZodError` / generic-error / prod-vs-dev branches. All passing; full workspace `pnpm run typecheck` is clean.

### Not started
- Redis + BullMQ queue infrastructure (no `REDIS_URL` yet) — also needed before `/api/ready` can check Redis for real
- `ENCRYPTION_KEY` secret (needed once the credential store is built — Phase 1.7)
- Worker process / artifact for workflow execution (proposed as project task #4)
- Frontend canvas editor artifact (proposed as project task #3)
- Everything in Milestone 1 (MVP) onward

### Replit-specific notes
- `docs/04-folder-structure.md` describes the target **production/self-hosted** layout (`apps/`, `packages/`, `infra/` with Docker Compose, Kubernetes, Helm). On Replit this project instead uses the pnpm-workspace template's `artifacts/` + `lib/` layout (see `replit.md`). Same architecture, different folder names — don't try to reconcile them literally.
- Phase 0.5 (Docker Compose + CI) doesn't apply on Replit — Replit's own workflow system and autoscale deployment target replace it for dev and prod respectively. Skip it here; it would only matter for a separate self-hosted distribution.
- `docs/03-api-specification.md` writes the readiness route as `/api/v1/ready`. This project already diverges from that versioned path scheme for `/healthz` (no `/v1` prefix anywhere), so `/api/ready` follows the same existing convention rather than the doc's literal path. The production startup health check in `artifacts/api-server/.replit-artifact/artifact.toml` stays on `/api/healthz`, not `/ready` — don't change that.

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

**Milestone 0 (Foundation) is now complete** — Phases 0.1–0.3 are all done (0.4 Queue Infrastructure and 0.5 Docker/CI are explicitly skipped on Replit; see "Replit-specific notes").

**Next: Milestone 1, Phase 1.1 — Workflow CRUD + Versioning** (`docs/06-implementation-phases.md`): its dependencies (Phase 0.2 Database Schema, Phase 0.3 API Skeleton + Health Endpoints) are both done, so it can start now. This is tracked as project task "Build Workflow CRUD so automations can be created and saved." Scope per the phase doc: `POST/GET/PATCH/DELETE /api/workflows`, version snapshots on save, `AppError`-based `NOT_FOUND`/`CONFLICT` handling (reusing the error foundation from Phase 0.3) — still no auth, per confirmed MVP scope.
