# FlowForge — Project Status

_Last updated: 2026-07-29_

## Where we are

**Milestone 0 (Foundation) is complete. Milestone 1 (MVP): Phase 1.1 (Workflow CRUD + Versioning) is complete, and Phase 1.2 (Visual Canvas) is substantially implemented** — the workflow list and canvas editor pages are live, wired to the real API, and covered by passing tests. No execution engine or webhooks yet. This file tracks progress against the phase breakdown in `docs/06-implementation-phases.md`; update it as phases complete.

### Done

- pnpm workspace scaffold (Replit-native layout — see "Where Things Live" in `replit.md`; it maps to the production layout in `docs/04-folder-structure.md`, folder names differ but the architecture is the same)
- Postgres database provisioned (`DATABASE_URL` set)
- API server artifact (`artifacts/api-server`) running Express 5 with Pino logging, CORS, JSON body parsing — confirmed running on port 8080
- `GET /api/healthz` health check endpoint, backed by a Zod schema and OpenAPI-driven codegen (Orval → `@workspace/api-zod`, `@workspace/api-client-react`)
- Separate `mockup-sandbox` artifact for design prototyping only — unrelated to the product's own workflow canvas below
- **Phase 0.2 — Database Schema & Migrations is complete.** Drizzle schema for all 8 MVP tables (`workflows`, `workflow_versions`, `nodes`, `node_connections`, `executions`, `execution_logs`, `credentials`, `webhooks`) lives in `lib/db/src/schema/`, matching `docs/02-database-schema.md` exactly — columns, indexes, foreign keys, and CHECK constraints on the enum-like columns. Pushed to Postgres with `pnpm --filter @workspace/db run push`; all tables/indexes/FKs/CHECK constraints confirmed present in the database.
- **Phase 0.3 — API Skeleton + Health Endpoints is complete.**
  - `GET /api/ready` added: runs a live `SELECT 1` against Postgres, reports Redis as `"not_configured"`. Schema (`ReadinessStatus`) added to `lib/api-spec/openapi.yaml` and codegen'd into `@workspace/api-zod`.
  - Global error handling foundation: `AppError` + `ErrorCode` → HTTP status table; `notFoundHandler` and `errorHandler` middleware serialise to Problem JSON.
  - Request logging middleware extracted to `artifacts/api-server/src/middlewares/requestLogger.ts`.
  - Test framework: Vitest + Supertest. 8 tests covering `/api/healthz`, `/api/ready`, 404 fallback, and error handler branches.
- **Phase 1.1 — Workflow CRUD + Versioning is complete.**
  - `GET /api/v1/workflows` — list workflows with cursor pagination (`after`, `limit`), `isActive`, `search`, and `tags[]` filters; returns `{ workflows, nextCursor, total }`.
  - `POST /api/v1/workflows` — create workflow + auto-create version 1; returns `{ workflow, version }`.
  - `GET /api/v1/workflows/:id` — get workflow with its active version graph; returns `{ workflow, activeVersion }`.
  - `PUT /api/v1/workflows/:id` — save new version (increments version number, sets `activeVersionId`); returns `{ workflow, version }`.
  - `PATCH /api/v1/workflows/:id` — update metadata (name, description, tags, isActive) without creating a new version.
  - `DELETE /api/v1/workflows/:id` — soft-delete (sets `deletedAt`), returns 204.
  - `GET /api/v1/workflows/:id/versions` — list all versions in descending order; returns `{ versions }`.
  - `POST /api/v1/workflows/:id/versions/:versionId/restore` — set a past version as active.
  - All endpoints: Zod validation on request bodies (422 `VALIDATION_ERROR`), `AppError`-based 404 for unknown/deleted workflows, soft-delete respected everywhere.
  - 30 Vitest + Supertest tests covering all 8 endpoints, happy paths, validation errors, 404s, double-delete, version restoration cross-workflow guard, and pagination. All 38 backend tests pass.
  - **Bug fix:** `errorHandler.ts` and `errorHandler.test.ts` updated to import `ZodError` from `"zod/v4"` (not `"zod"`) — the two are different classes in zod v3.x with the `/v4` subpath export.
  - Routes mounted at `/api/v1/workflows` via a new `artifacts/api-server/src/routes/v1/` sub-router.
- **Phase 1.2 — Visual Canvas is substantially implemented**, in `artifacts/web/src/features/workflow-canvas/` on top of `@xyflow/react` (React Flow):
  - `workflows-list.tsx` — list page with search, a create-workflow dialog, and delete, backed by the real `GET/POST/DELETE /api/v1/workflows` endpoints.
  - `workflow-editor.tsx` — three-pane editor shell (node palette / canvas / node inspector) with rename, save, and a version-history dropdown (list + restore).
  - Node palette: drag-and-drop onto the canvas for 5 node types — `start`, `http_request`, `delay`, `if`, `end` — each with an icon, color, and description.
  - Canvas: connecting nodes by dragging between handles, multi-output handles for the `if` node's true/false branches, selecting a node, minimap, pan/zoom controls (`WorkflowCanvasView.tsx`, `CanvasNode.tsx`).
  - Node inspector: per-type config form (HTTP method/URL/headers/body, delay duration, if-condition) and delete, driven by `node-registry.ts`'s type-safe node definitions.
  - `graph-transform.ts` — bidirectional mapping between the canvas's React Flow nodes/edges and the API's persisted `WorkflowGraph` JSON shape, with 7 passing unit tests (`graph-transform.test.ts`) covering both directions, branch handles, and fallback position/label logic.
  - `useWorkflowEditor.ts` — load/save/dirty-tracking/node CRUD hook wired to the generated `@workspace/api-client-react` hooks (`saveWorkflowVersion` → `PUT /api/v1/workflows/:id`, etc.), not stubbed.
  - Routing confirmed in `App.tsx`: `/` → workflow list, `/workflows/:id` → editor.
  - Verified end-to-end for real: created a workflow via the API, `PUT` a 3-node/2-connection graph, `GET` it back and confirmed the graph round-trips byte-for-byte with the version number incremented — satisfies the phase's "add nodes, connect, save → persists on refresh" acceptance criterion at the data layer. Both routes also confirmed serving the correct SPA shell over HTTP (200 OK, correct `<title>`, correct entry script).
  - 7 new Vitest tests (all in `graph-transform.test.ts`); combined with the backend, 45 tests pass across the whole repo.

### Not started
- Redis + BullMQ queue infrastructure (no `REDIS_URL` yet) — also needed before `/api/ready` can check Redis for real
- `ENCRYPTION_KEY` secret (needed once the credential store is built — Phase 1.7)
- Worker process / artifact for workflow execution (proposed as project task #2)
- Remaining Phase 1.2 polish called for by `docs/06-implementation-phases.md` but not yet built: undo/redo stack, auto-layout (Dagre), node palette search/categories (today it's a flat list, fine for 5 node types but won't scale), and keyboard shortcuts beyond React Flow's built-in pan/zoom (copy/paste, select-all, delete-key are not wired up)
- Phase 1.3 (Core Nodes — expanding today's 5 basic node types to the full MVP set), Phase 1.4 (Execution Engine), and everything else in Milestone 1 onward

### Replit-specific notes
- `docs/04-folder-structure.md` describes the target **production/self-hosted** layout (`apps/`, `packages/`, `infra/` with Docker Compose, Kubernetes, Helm). On Replit this project instead uses the pnpm-workspace template's `artifacts/` + `lib/` layout (see `replit.md`). Same architecture, different folder names — don't try to reconcile them literally.
- Phase 0.5 (Docker Compose + CI) doesn't apply on Replit — Replit's own workflow system and autoscale deployment target replace it for dev and prod respectively. Skip it here; it would only matter for a separate self-hosted distribution.
- `docs/03-api-specification.md` writes the readiness route as `/api/v1/ready`. This project already diverges from that versioned path scheme for `/healthz` (no `/v1` prefix anywhere), so `/api/ready` follows the same existing convention rather than the doc's literal path. The production startup health check in `artifacts/api-server/.replit-artifact/artifact.toml` stays on `/api/healthz`, not `/ready` — don't change that.
- The workflow CRUD routes are correctly mounted under `/api/v1/` per the spec.
- A fresh Postgres container has no tables until someone runs `pnpm --filter @workspace/db run push` — the schema isn't seeded automatically on environment (re)provisioning. If `/api/v1/workflows` 500s with `relation "workflows" does not exist`, that's why; re-run the push.
- `artifacts/web` and `artifacts/api-server` each have a valid `.replit-artifact/artifact.toml` on disk and a matching `.replit` workflow, but as of this writing neither is registered with Replit's artifact registry (`listArtifacts()` returns empty), so the agent's screenshot tooling can't target them by name yet. This doesn't affect the running app — both dev servers work fine and are reachable directly — it only affects visual verification tooling. Likely residue from the GitHub export/import round-trip; needs registering properly the next time someone sets up artifact-based preview for this project.

## MVP scope (confirmed)

Per `docs/01-architecture.md`, `docs/02-database-schema.md`, and `docs/03-api-specification.md`, the MVP is deliberately **single-tenant and unauthenticated**:
- No user accounts, no login/register/sessions, no JWTs
- No `users` or `workspaces` tables — every row in the MVP schema is global and unscoped (no `owner_id` / `workspace_id` / `created_by` anywhere)
- The REST API has no access control and is meant to run only on `localhost` or a trusted private network
- Auth, workspaces, teams, RBAC, API keys, and audit logs are fully designed but intentionally excluded from the MVP; they land later as a purely additive migration — now its own **Milestone 4 — Authentication & Multi-Tenancy** in the roadmap

## Next phase

**Phase 1.1 — Workflow CRUD + Versioning is complete. Phase 1.2 — Visual Canvas is substantially implemented** (see Done/Not started above for exactly what's covered and what's left).

**Next, in phase order per `docs/06-implementation-phases.md`:**
1. Close out the remaining Phase 1.2 gaps (undo/redo, auto-layout, palette search) — optional polish, not blocking.
2. **Phase 1.3 — Core Nodes**: expand from today's 5 basic node types to the full MVP node set.
3. **Phase 1.4 — Execution Engine**: `POST /api/v1/workflows/:id/execute`, `GET /api/v1/executions`, `GET /api/v1/executions/:id`, `POST /api/v1/executions/:id/cancel`. Requires Redis + BullMQ queue infrastructure (Phase 0.4, skipped until needed) and the worker process artifact. Scope per the phase doc: DAG execution, node dispatch, execution record tracking, and node-level logs — using the existing `executions` and `execution_logs` tables. Tracked separately as project task #2.
