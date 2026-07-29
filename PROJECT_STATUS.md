# FlowForge — Project Status

_Last updated: 2026-07-29 (Phase 1.4 complete)_

## Where we are

**Milestone 0 (Foundation) is complete. Milestone 1 (MVP): Phase 1.1 (Workflow CRUD + Versioning) is complete, Phase 1.2 (Visual Canvas) is substantially implemented, and Phase 1.3 (Shared Node Registry & Integration Foundation) is complete for its scoped node set** — `start`, `webhook_trigger`, `http_request`, `delay`, `if`, `end` are defined once in a shared package and used identically by the API's validation and the canvas's palette/inspector. This is narrower than `docs/06-implementation-phases.md`'s "Phase 1.3 — Core Nodes", which additionally wants Schedule Trigger, Code, Set Variable, Log, and Loop nodes — those remain outstanding (see "Not started"). No execution engine or webhooks yet. This file tracks progress against the phase breakdown in `docs/06-implementation-phases.md`; update it as phases complete.

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
- **Phase 1.3 — Shared Node Registry & Integration Foundation is complete**, for the scoped node set `start` / `webhook_trigger` / `http_request` / `delay` / `if` / `end`:
  - New workspace package `lib/node-registry/` (`@workspace/node-registry`) is the single source of truth for node metadata — framework-agnostic `NodeDefinition` (`id`, `name`, `description`, `category`, `icon` string id, `inputs`/`outputs` ports, Zod `configSchema`, `defaultConfig`), grouped into categories `trigger` / `action` / `logic` / `control`. Used identically by the API server and the web frontend — no duplicated node metadata anywhere.
  - `validateNodeConfig(type, config)` validates one node's config against its type's Zod schema; `validateWorkflowGraph(graph)` validates every node in a graph (unknown type + per-node config) and aggregates structured `{ nodeId, field, message }` errors.
  - Validation is enforced server-side: `POST /api/v1/workflows` and `PUT /api/v1/workflows/:id` both call `assertValidGraph()` before writing to the database; an invalid graph returns 422 with `context.errors` and is never persisted (covered by dedicated tests in `workflows.test.ts`).
  - `openapi.yaml`'s `WorkflowGraphNodeType` enum includes `webhook_trigger`; `@workspace/api-zod` and `@workspace/api-client-react` are regenerated and confirmed in sync (a clean `orval` codegen run produces no diff).
  - Frontend refactor: `artifacts/web/.../workflow-canvas/node-registry.ts` wraps the shared package's `listNodeDefinitions()` and keeps only true UI concerns locally — lucide-react icon component mapping and Tailwind color classes. `NodePalette` now groups nodes by category (Triggers / Actions / Logic / Control) and includes Webhook Trigger. `CanvasNode` renders ports and `WorkflowCanvasView` builds its React Flow `nodeTypes` map from registry metadata instead of a hardcoded list. `NodeInspector` has config editors for HTTP Request (method, URL, headers, query params, auth, timeout), Webhook Trigger (path, response mode), Delay (durationMs), and If (condition), each running `validateNodeConfig()` for inline field errors.
  - 19 new tests in `lib/node-registry/` (`registry.test.ts`, `validation.test.ts`); combined with the backend and frontend, **70 tests pass across the whole repo**.
  - **Bug fix:** `workflows.test.ts` had one untyped `workflow.id` (missing the `as string` cast used everywhere else in that file) feeding a Drizzle `eq()` call, which broke `pnpm run typecheck` even though the app ran fine. Fixed to match the file's existing pattern — `pnpm install`, `pnpm run typecheck`, and `pnpm run test` all now pass clean with no other changes needed.

- **Phase 1.4 — Execution Engine is complete.**
  - `POST /api/v1/workflows/:workflowId/execute` — creates an `executions` row, fires the engine fire-and-forget, returns 202 immediately. Validates the graph is runnable (single entry node, no cycles, no dangling refs) before starting.
  - `GET /api/v1/executions` — paginated list with `workflowId` and `status` filters, keyset cursor (`after`/`limit`), and total count.
  - `GET /api/v1/executions/:executionId` — returns execution row with all node-level `execution_logs` ordered by `startedAt`.
  - `POST /api/v1/executions/:executionId/cancel` — aborts an in-process run via AbortController; falls back to direct DB update if no controller is registered. Returns 409 if already terminal.
  - Engine internals (`engine/executionEngine.ts`, `engine/graphBuilder.ts`, `engine/nodeRunner.ts`): DAG walk with dependency-driven scheduling (parallel fan-out, fan-in, branch skipping), per-node `execution_logs` rows, 5-minute execution-level timeout backstop, in-process cancellation.
  - All 6 Phase 1.3 node types have `execute` implementations: `start` (pass-through), `end` (pass-through), `http_request` (real fetch with auth/headers/timeout + AbortSignal), `delay` (sleep with AbortSignal), `if` (JS expression → true/false branch), `webhook_trigger` (pass-through).
  - `lib/api-zod/src/index.ts` duplicate-export ambiguity fixed (`ExecuteWorkflowBody` declared in both generated sources; explicit tiebreak added).
  - 16 new Vitest+Supertest tests in `executions.test.ts` covering all 4 endpoints, engine happy paths (instant graph, if-node branching), cancel, and 404/409 error paths. **87 tests pass across the whole repo** (19 node-registry + 7 web + 61 api-server across 4 test files).

### Not started
- Remaining MVP node types beyond Phase 1.3's scoped set — **Schedule Trigger, Code (JS sandbox / `isolated-vm`), Set Variable, Log, Loop** — needed to reach the full node list in `replit.md`'s Product section and `docs/06-implementation-phases.md`'s Phase 1.3 (Core Nodes). The registry architecture and validation pipeline are already in place; adding a node type is now just a new file in `lib/node-registry/src/nodes/` plus a palette icon/color mapping.
- Redis + BullMQ queue infrastructure (no `REDIS_URL` yet) — also needed before `/api/ready` can check Redis for real
- `ENCRYPTION_KEY` secret (needed once the credential store is built — Phase 1.7)
- Remaining Phase 1.2 polish called for by `docs/06-implementation-phases.md` but not yet built: undo/redo stack, auto-layout (Dagre), node palette search (categories now exist — see Phase 1.3 above), and keyboard shortcuts beyond React Flow's built-in pan/zoom (copy/paste, select-all, delete-key are not wired up)
- Phase 1.5 and everything else in Milestone 1 onward

### Replit-specific notes
- `docs/04-folder-structure.md` describes the target **production/self-hosted** layout (`apps/`, `packages/`, `infra/` with Docker Compose, Kubernetes, Helm). On Replit this project instead uses the pnpm-workspace template's `artifacts/` + `lib/` layout (see `replit.md`). Same architecture, different folder names — don't try to reconcile them literally.
- Phase 0.5 (Docker Compose + CI) doesn't apply on Replit — Replit's own workflow system and autoscale deployment target replace it for dev and prod respectively. Skip it here; it would only matter for a separate self-hosted distribution.
- `docs/03-api-specification.md` writes the readiness route as `/api/v1/ready`. This project already diverges from that versioned path scheme for `/healthz` (no `/v1` prefix anywhere), so `/api/ready` follows the same existing convention rather than the doc's literal path. The production startup health check in `artifacts/api-server/.replit-artifact/artifact.toml` stays on `/api/healthz`, not `/ready` — don't change that.
- The workflow CRUD routes are correctly mounted under `/api/v1/` per the spec.
- A fresh Postgres container has no tables until someone runs `pnpm --filter @workspace/db run push` — the schema isn't seeded automatically on environment (re)provisioning. If `/api/v1/workflows` 500s with `relation "workflows" does not exist`, that's why; re-run the push.
- `artifacts/web`, `artifacts/api-server`, and `artifacts/mockup-sandbox` are registered with Replit's artifact registry (fixed post-import — they previously had valid `artifact.toml` + workflows on disk but weren't registered, so `listArtifacts()`/screenshot tooling couldn't see them). Preview paths: web → `/`, API → `/api`, mockup sandbox → `/__mockup`.

## MVP scope (confirmed)

Per `docs/01-architecture.md`, `docs/02-database-schema.md`, and `docs/03-api-specification.md`, the MVP is deliberately **single-tenant and unauthenticated**:
- No user accounts, no login/register/sessions, no JWTs
- No `users` or `workspaces` tables — every row in the MVP schema is global and unscoped (no `owner_id` / `workspace_id` / `created_by` anywhere)
- The REST API has no access control and is meant to run only on `localhost` or a trusted private network
- Auth, workspaces, teams, RBAC, API keys, and audit logs are fully designed but intentionally excluded from the MVP; they land later as a purely additive migration — now its own **Milestone 4 — Authentication & Multi-Tenancy** in the roadmap

## Next phase

**Phase 1.1 — Workflow CRUD + Versioning is complete. Phase 1.2 — Visual Canvas is substantially implemented. Phase 1.3 — Shared Node Registry & Integration Foundation is complete for its scoped node set** (see Done/Not started above for exactly what's covered and what's left).

**Next, in phase order per `docs/06-implementation-phases.md`:**
1. Close out the remaining Phase 1.2 gaps (undo/redo, auto-layout) — optional polish, not blocking.
2. **Finish Phase 1.3 / Core Nodes**: add the remaining MVP node types (Schedule Trigger, Code, Set Variable, Log, Loop) to `lib/node-registry/` using the same pattern as the existing six node types — no new architecture needed, just new node definitions plus matching `NodeInspector` config editors and palette icon/color entries.
3. **Phase 1.4 — Execution Engine**: `POST /api/v1/workflows/:id/execute`, `GET /api/v1/executions`, `GET /api/v1/executions/:id`, `POST /api/v1/executions/:id/cancel`. Requires Redis + BullMQ queue infrastructure (Phase 0.4, skipped until needed) and the worker process artifact. Scope per the phase doc: DAG execution, node dispatch, execution record tracking, and node-level logs — using the existing `executions` and `execution_logs` tables. Tracked separately as an open project task.
