# FlowForge — Phase-by-Phase Implementation Plan

Each phase is a focused, independently shippable unit of work. Phases within a milestone can sometimes be parallelised across engineers; dependencies are noted where ordering is mandatory.

Complexity ratings: 🟢 Low · 🟡 Medium · 🔴 High

---

## Milestone 0 — Foundation

---

### Phase 0.1 — Monorepo Scaffold

**Goals:** Get the workspace compiling and linting. Every engineer can clone and run the stack.

**Files to create:**
```
package.json                     pnpm-workspace.yaml
tsconfig.base.json               tsconfig.json
.eslintrc.json                   .env.example
apps/api/package.json            apps/api/tsconfig.json
apps/api/src/index.ts            apps/api/src/app.ts
apps/api/src/config.ts
apps/worker/package.json         apps/worker/tsconfig.json
apps/worker/src/index.ts
apps/web/package.json            apps/web/tsconfig.json
apps/web/vite.config.ts          apps/web/index.html
apps/web/src/main.tsx            apps/web/src/App.tsx
apps/web/src/index.css
packages/db/package.json         packages/db/tsconfig.json
packages/db/src/index.ts         packages/db/src/client.ts
packages/db/drizzle.config.ts
packages/api-spec/openapi.yaml   packages/api-spec/orval.config.ts
packages/api-spec/package.json
```

**Features:**
- pnpm workspace with all packages linked
- Shared TypeScript strict config
- ESLint + Prettier configured
- `pnpm typecheck` passes clean

**Acceptance criteria:**
- `pnpm install` completes without errors
- `pnpm typecheck` exits 0
- `pnpm lint` exits 0

**Complexity:** 🟢 Low

---

### Phase 0.2 — Database Schema & Migrations

**Goals:** All tables created; push command works; Drizzle client connected.

**Dependencies:** Phase 0.1

**Files to create/modify:**
```
packages/db/src/schema/users.ts
packages/db/src/schema/workspaces.ts
packages/db/src/schema/workspace-members.ts
packages/db/src/schema/workflows.ts
packages/db/src/schema/workflow-versions.ts
packages/db/src/schema/nodes.ts
packages/db/src/schema/node-connections.ts
packages/db/src/schema/executions.ts
packages/db/src/schema/execution-logs.ts
packages/db/src/schema/credentials.ts
packages/db/src/schema/variables.ts
packages/db/src/schema/schedules.ts
packages/db/src/schema/webhooks.ts
packages/db/src/schema/api-keys.ts
packages/db/src/schema/teams.ts
packages/db/src/schema/audit-logs.ts
packages/db/src/schema/index.ts       (re-export all)
```

**Features:**
- Complete Drizzle schema matching the database design doc
- Indexes defined inline
- `pnpm --filter @flowforge/db run push` applies schema to Postgres

**Acceptance criteria:**
- `pnpm db:push` creates all 16 tables
- `pnpm db:studio` opens Drizzle Studio and shows all tables

**Complexity:** 🟢 Low

---

### Phase 0.3 — API Skeleton + Health Endpoints

**Goals:** Express server starts, all route groups mounted, health endpoints respond.

**Dependencies:** Phase 0.1

**Files to create:**
```
apps/api/src/lib/logger.ts
apps/api/src/lib/redis.ts
apps/api/src/lib/jwt.ts
apps/api/src/lib/crypto.ts
apps/api/src/middlewares/errorHandler.ts
apps/api/src/middlewares/requestLogger.ts
apps/api/src/routes/index.ts
apps/api/src/routes/health.ts
```

**Features:**
- Pino request logger
- Global error handler → RFC 7807 Problem JSON
- `GET /api/v1/health` → `{ status: "ok" }`
- `GET /api/v1/ready` → DB + Redis check

**Acceptance criteria:**
- `GET /api/v1/health` → 200
- Intentional 404 → Problem JSON with `status: 404`
- Unhandled error → Problem JSON with `status: 500`; stack trace only in dev

**Complexity:** 🟢 Low

---

### Phase 0.4 — Queue Infrastructure

**Goals:** BullMQ queues defined; worker process consumes a test job.

**Dependencies:** Phase 0.1

**Files to create:**
```
apps/api/src/lib/queue.ts           (queue definitions, shared)
apps/worker/src/index.ts            (worker bootstrap)
apps/worker/src/processors/executionProcessor.ts   (stub)
```

**Features:**
- `executions`, `schedules`, `webhooks` queues defined
- Worker connects, logs "waiting for jobs", processes a test job
- Graceful shutdown on SIGTERM (drain in-flight jobs)

**Acceptance criteria:**
- Enqueue a test job via Redis CLI → worker logs job receipt and completes it
- SIGTERM → worker finishes current job before exiting

**Complexity:** 🟡 Medium

---

### Phase 0.5 — Docker Compose + CI

**Goals:** `docker compose up` starts all services; CI runs on PRs.

**Dependencies:** Phases 0.1–0.4

**Files to create:**
```
infra/docker/Dockerfile.api
infra/docker/Dockerfile.worker
infra/docker/Dockerfile.web
infra/docker-compose.yml
.github/workflows/ci.yml
```

**Features:**
- Compose: api, worker, web, postgres, redis, pgbouncer
- Health-check dependencies (api waits for postgres ready)
- CI: checkout → install → typecheck → lint → unit tests

**Acceptance criteria:**
- `docker compose up` → all containers healthy within 60 s
- PR to main runs CI; red on failing typecheck

**Complexity:** 🟢 Low

---

## Milestone 1 — MVP

---

### Phase 1.1 — Authentication

**Goals:** Users can register, log in, and receive JWT tokens.

**Dependencies:** Phase 0.3, 0.2

**Files to create:**
```
apps/api/src/routes/auth.ts
apps/api/src/services/AuthService.ts
apps/api/src/middlewares/auth.ts          (JWT validation)
apps/web/src/pages/LoginPage.tsx
apps/web/src/pages/RegisterPage.tsx
apps/web/src/hooks/useAuth.ts
```

**Features:**
- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- Argon2 password hashing
- JWT access (15 min) + refresh token (30 days, server-side record)
- `requireAuth` middleware
- Frontend: login/register forms with React Hook Form + Zod

**Acceptance criteria:**
- Register → receive access + refresh tokens
- Access token expires → refresh → new tokens issued
- Logout → refresh token revoked; re-use returns 401

**Complexity:** 🟡 Medium

---

### Phase 1.2 — Workspaces & Members

**Goals:** Personal workspace auto-created at registration; basic member management.

**Dependencies:** Phase 1.1

**Files to create:**
```
apps/api/src/routes/workspaces.ts
apps/api/src/services/WorkflowService.ts   (partial — workspace CRUD)
apps/api/src/middlewares/requireRole.ts
apps/web/src/hooks/useWorkspace.ts
apps/web/src/pages/SettingsPage.tsx         (workspace name/description)
```

**Features:**
- Auto-create workspace on register
- `GET /workspaces`, `POST /workspaces`, `PATCH /:id`, `DELETE /:id`
- Member invite by email (no email sending yet — return invite link in response)
- RBAC middleware; role stored in `workspace_members`

**Acceptance criteria:**
- New user has a workspace after registration
- Owner can invite; invitee can accept via link; invitee has correct role
- Viewer cannot PATCH workspace → 403

**Complexity:** 🟡 Medium

---

### Phase 1.3 — Workflow CRUD + Versioning

**Goals:** Workflows can be created, listed, saved, and versioned.

**Dependencies:** Phase 1.2

**Files to create:**
```
apps/api/src/routes/workflows.ts
apps/api/src/services/WorkflowService.ts    (full)
apps/web/src/pages/WorkflowsPage.tsx
apps/web/src/pages/WorkflowEditorPage.tsx   (shell only)
```

**Features:**
- Full workflow CRUD API
- `PUT /:id` creates new version, updates `active_version_id`
- Version history list + restore endpoint
- Frontend: workflow list page with search, tags, create button

**Acceptance criteria:**
- Create workflow → version 1 created
- Save workflow → version 2 created; version 1 still retrievable
- Restore version 1 → `active_version_id` points to v1

**Complexity:** 🟡 Medium

---

### Phase 1.4 — Visual Canvas

**Goals:** Users can build a workflow graph visually and save it.

**Dependencies:** Phase 1.3

**Files to create:**
```
apps/web/src/canvas/Canvas.tsx
apps/web/src/canvas/useCanvasStore.ts
apps/web/src/canvas/CanvasToolbar.tsx
apps/web/src/canvas/MiniMap.tsx
apps/web/src/canvas/nodes/BaseNode.tsx
apps/web/src/canvas/nodes/TriggerNode.tsx
apps/web/src/canvas/nodes/ActionNode.tsx
apps/web/src/canvas/nodes/ConditionNode.tsx
apps/web/src/canvas/edges/DefaultEdge.tsx
apps/web/src/canvas/panels/NodeSearchPanel.tsx
apps/web/src/canvas/panels/NodeConfigPanel.tsx
apps/web/src/canvas/hooks/useUndoRedo.ts
apps/web/src/canvas/hooks/useKeyboardShortcuts.ts
apps/web/src/canvas/hooks/useAutoLayout.ts
```

**Features:**
- React Flow canvas with custom node types
- Node palette panel (left sidebar, search + categories)
- Node config panel (right sidebar, per-node JSON form)
- Drag to connect nodes (output handle → input handle)
- Undo/redo stack (Zustand immer)
- Keyboard shortcuts: Cmd+Z/Y, Del, Cmd+A/C/V, Space+drag, scroll-zoom
- Auto-layout with Dagre
- Save button → calls `PUT /workflows/:id`

**Acceptance criteria:**
- Add 3 nodes, connect them, save → graph persists on page refresh
- Undo removes last action; redo restores it
- Auto-layout reorders nodes without breaking connections

**Complexity:** 🔴 High

---

### Phase 1.5 — Core Nodes

**Goals:** 7 MVP nodes usable in the canvas and executable by the engine.

**Dependencies:** Phase 1.4

**Files to create:**
```
packages/nodes-core/src/triggers/ManualTrigger.ts
packages/nodes-core/src/triggers/WebhookTrigger.ts
packages/nodes-core/src/actions/HttpRequest.ts
packages/nodes-core/src/actions/CodeNode.ts
packages/nodes-core/src/actions/ConditionNode.ts
packages/nodes-core/src/actions/SetVariableNode.ts
packages/nodes-core/src/actions/LogNode.ts
packages/nodes-core/src/index.ts
packages/node-sdk/src/index.ts
packages/node-sdk/src/types.ts
packages/node-sdk/src/BaseNode.ts
apps/api/src/routes/nodes.ts
apps/api/src/services/NodeRegistryService.ts
```

**Features:**
- Node SDK types: `NodeManifest`, `NodeContext`, `NodeResult`
- Each node implements `execute(context): Promise<NodeResult>`
- Node manifests define `inputSchema` (JSON Schema), `outputSchema`, `credentials` list
- `GET /api/v1/nodes` returns all manifests
- Canvas loads manifests to populate palette + config forms

**Acceptance criteria:**
- All 7 node types appear in canvas palette with icons
- Config panel renders the correct fields for each node type
- Node manifests pass JSON Schema validation

**Complexity:** 🟡 Medium

---

### Phase 1.6 — Execution Engine

**Goals:** Workflows execute end-to-end; node logs are persisted.

**Dependencies:** Phase 1.5, Phase 0.4

**Files to create:**
```
apps/worker/src/engine/ExecutionEngine.ts
apps/worker/src/engine/GraphBuilder.ts
apps/worker/src/engine/NodeRunner.ts
apps/worker/src/engine/BranchResolver.ts
apps/worker/src/engine/VariableStore.ts
apps/worker/src/engine/RetryManager.ts
apps/worker/src/engine/TimeoutWatcher.ts
apps/worker/src/engine/SandboxRunner.ts
apps/worker/src/processors/executionProcessor.ts   (full)
apps/api/src/routes/executions.ts
apps/api/src/services/ExecutionService.ts
```

**Features:**
- `POST /workflows/:id/execute` → enqueue job → worker picks up
- GraphBuilder: JSON graph → in-memory DAG with topological sort
- NodeRunner: run each node, catch errors, write `execution_logs`
- BranchResolver: evaluate condition node expressions (`$input.value > 100`)
- VariableStore: read/write variables scoped to execution ID
- SandboxRunner: `isolated-vm` for Code nodes
- TimeoutWatcher: per-node 30 s default; per-execution 5 min default
- Execution status transitions: pending → running → success/error

**Acceptance criteria:**
- Manual trigger → all nodes execute → `execution.status = success`
- Condition node routes to correct branch based on expression
- Code node with `return { value: $input.value * 2 }` doubles a number
- Node exceeding timeout → `execution_log.status = error`; rest of execution cancelled

**Complexity:** 🔴 High

---

### Phase 1.7 — Webhooks

**Goals:** External systems can trigger workflows via HTTP webhook.

**Dependencies:** Phase 1.6

**Files to create:**
```
apps/api/src/routes/webhooks.ts          (public receiver + management)
apps/api/src/services/WebhookService.ts
apps/web/src/pages/* (webhook URL display in canvas panel)
```

**Features:**
- `POST /api/v1/webhooks/:token` — receive, validate HMAC, enqueue
- Management endpoints: create, list, delete
- Canvas: webhook trigger node shows generated URL + copy button
- Immediate response mode only (wait mode in v1.1)

**Acceptance criteria:**
- `curl -X POST https://app/api/v1/webhooks/wh_abc123 -d '{"event":"push"}'` → `202 Accepted`
- Execution created with `trigger_type = webhook`; payload available as first node output

**Complexity:** 🟡 Medium

---

### Phase 1.8 — Real-time Execution UI

**Goals:** Users see node status update live as the workflow runs.

**Dependencies:** Phase 1.6, Phase 1.7

**Files to create:**
```
apps/api/src/realtime/socketServer.ts
apps/api/src/realtime/executionRelay.ts
apps/web/src/lib/socket.ts
apps/web/src/hooks/useRealtimeExecution.ts
apps/web/src/execution/ExecutionDetail.tsx
apps/web/src/execution/NodeLogCard.tsx
apps/web/src/execution/ExecutionList.tsx
apps/web/src/canvas/panels/ExecutionPanel.tsx
```

**Features:**
- Worker publishes `node:start`, `node:complete`, `node:error`, `execution:complete` to Redis channel
- API server relays via Socket.io to subscribed clients
- Canvas panel: node borders turn green/red in real time
- Execution detail page: collapsible cards per node with input/output JSON

**Acceptance criteria:**
- Click "Run" → node status badges update within 500 ms of node completing
- Execution detail page shows all node input/output without page refresh
- Socket disconnects gracefully when user navigates away

**Complexity:** 🔴 High

---

### Phase 1.9 — Credential Store

**Goals:** Credentials stored encrypted; usable in HTTP Request node.

**Dependencies:** Phase 1.1

**Files to create:**
```
apps/api/src/routes/credentials.ts
apps/api/src/services/CredentialService.ts
apps/web/src/credentials/CredentialForm.tsx
apps/web/src/credentials/CredentialSelector.tsx
apps/web/src/pages/CredentialsPage.tsx
```

**Features:**
- AES-256-GCM encrypt on write; decrypt only inside worker at execution time
- API never returns decrypted data — only masked display names
- Credential selector in HTTP node config (filtered by compatible types)
- `POST /credentials/:id/test` — live connectivity check

**Acceptance criteria:**
- Create API key credential → stored encrypted in DB
- HTTP node with credential completes request with auth header injected
- `GET /credentials` response never contains raw credential values

**Complexity:** 🟡 Medium

---

## Milestone 2 — Scheduling & Variables

### Phase 2.1 — Scheduler

**Files to create:** `apps/api/src/services/SchedulerService.ts`, `apps/worker/src/processors/scheduleProcessor.ts`, `apps/api/src/routes/schedules.ts`, schedule UI in canvas + dedicated schedule management page

**Key challenges:**
- `redlock` leader election to prevent duplicate job scheduling across API instances
- Missed-run recovery logic on startup
- cron-parser edge cases (DST transitions)

**Complexity:** 🟡 Medium

### Phase 2.2 — Variables System

**Files to create:** `apps/api/src/routes/variables.ts`, `apps/api/src/services/VariableService.ts`, `apps/web/src/pages/VariablesPage.tsx`

**Key challenge:** Variable scoping (workspace > workflow > execution runtime) — VariableStore priority chain

**Complexity:** 🟢 Low

### Phase 2.3 — Node Retry Logic

**Files to create:** Update `RetryManager.ts`; UI: retry config on node config panel

**Key challenge:** Exponential backoff with jitter; distinguish retryable vs. non-retryable errors

**Complexity:** 🟡 Medium

---

## Milestone 3 — Teams & RBAC

### Phase 3.1 — Team Management & Fine-grained RBAC

**Files to create:** `apps/api/src/routes/teams.ts`, `apps/api/src/services/TeamService.ts`, permissions table service + middleware, `apps/web/src/pages/TeamPage.tsx`

**Complexity:** 🟡 Medium

### Phase 3.2 — API Keys

**Files to create:** `apps/api/src/routes/api-keys.ts`, `apps/api/src/services/ApiKeyService.ts`, scope enforcement in `auth.ts` middleware, UI in settings page

**Complexity:** 🟢 Low

### Phase 3.3 — Audit Logs

**Files to create:** `apps/api/src/services/AuditService.ts` (middleware hook), `apps/api/src/routes/audit-logs.ts`, `apps/web/src/pages/AuditLogPage.tsx`

**Complexity:** 🟢 Low

### Phase 3.4 — OIDC Login

**Files to create:** OIDC routes in `auth.ts`, `apps/api/src/lib/oidc.ts`, frontend OIDC button on login page

**Complexity:** 🟡 Medium

---

## Milestone 4 — Integration Nodes

### Phase 4.1 — Node SDK Public API + Manifest Validator

**Files:** `packages/node-sdk` final public API; `apps/api/src/services/NodeRegistryService.ts` manifest validation

**Complexity:** 🟡 Medium

### Phase 4.2 — OAuth2 Credential Type

**Files:** `packages/nodes-core/src/credentials/OAuth2.ts`; token refresh background job; frontend OAuth2 flow

**Complexity:** 🔴 High

### Phase 4.3 — Integration Nodes (per-node phases, parallelize across engineers)

Each integration is its own sub-phase:
- 4.3a Slack — `chat.postMessage`, `channels.list` (🟢)
- 4.3b GitHub — webhook events, create issue, list PRs (🟡)
- 4.3c Stripe — payment intent, customer lookup (🟡)
- 4.3d Postgres — query, insert, update (🟡)
- 4.3e OpenAI — chat completion, embeddings (🟢)
- ... (remaining integrations follow same pattern)

### Phase 4.4 — Custom Node Upload

**Files:** Upload endpoint + zip validator + dynamic node loader in worker

**Complexity:** 🔴 High

---

## Milestone 5 — Enterprise & Scale

### Phase 5.1 — SAML 2.0 SSO
**Complexity:** 🔴 High

### Phase 5.2 — Table Partitioning & Archival
**Complexity:** 🟡 Medium

### Phase 5.3 — Kubernetes Helm Chart + HPA
**Complexity:** 🟡 Medium

### Phase 5.4 — Prometheus Metrics + Grafana Dashboard
**Complexity:** 🟢 Low

### Phase 5.5 — CLI Tool
**Complexity:** 🟡 Medium

### Phase 5.6 — Git Sync (Workflow ↔ GitHub Repo)
**Complexity:** 🔴 High

---

## Summary Table

| Phase | Milestone | Description | Complexity |
|---|---|---|---|
| 0.1 | Foundation | Monorepo scaffold | 🟢 |
| 0.2 | Foundation | DB schema & migrations | 🟢 |
| 0.3 | Foundation | API skeleton + health | 🟢 |
| 0.4 | Foundation | Queue infrastructure | 🟡 |
| 0.5 | Foundation | Docker Compose + CI | 🟢 |
| 1.1 | MVP | Authentication | 🟡 |
| 1.2 | MVP | Workspaces & members | 🟡 |
| 1.3 | MVP | Workflow CRUD + versioning | 🟡 |
| 1.4 | MVP | Visual canvas | 🔴 |
| 1.5 | MVP | Core nodes | 🟡 |
| 1.6 | MVP | Execution engine | 🔴 |
| 1.7 | MVP | Webhooks | 🟡 |
| 1.8 | MVP | Real-time execution UI | 🔴 |
| 1.9 | MVP | Credential store | 🟡 |
| 2.x | Scheduling | Scheduler + variables + retry | 🟡 |
| 3.x | Teams | RBAC + API keys + audit + OIDC | 🟡 |
| 4.x | Integrations | Node SDK + OAuth2 + 15+ integrations | 🔴 |
| 5.x | Enterprise | SAML + partitioning + K8s + CLI + Git sync | 🔴 |

**Total estimated MVP (Milestone 0 + 1): ~12–16 engineer-weeks (solo) · ~6–8 weeks (2 engineers)**
