# FlowForge — Production-Ready Folder Structure

This tree covers Milestone 0 (Foundation) through Milestone 3 (Integration Nodes) — i.e. everything up to but not including Authentication & Multi-Tenancy. See "Deferred — Authentication & Multi-Tenancy" at the bottom for the paths that get added on top of this tree when that milestone ships.

```
flowforge/
├── apps/
│   ├── web/                         # React + Vite frontend SPA
│   │   ├── public/
│   │   │   └── static/
│   │   │       └── nodes/           # Node SVG icons
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx              # Router + providers
│   │   │   ├── index.css
│   │   │   │
│   │   │   ├── dashboard/           # Landing page
│   │   │   │   ├── DashboardPage.tsx
│   │   │   │   ├── WorkflowSummaryCards.tsx
│   │   │   │   └── RecentExecutionsFeed.tsx
│   │   │   │
│   │   │   ├── canvas/              # Visual workflow editor
│   │   │   │   ├── Canvas.tsx       # React Flow wrapper, main editor
│   │   │   │   ├── useCanvasStore.ts # Zustand canvas state
│   │   │   │   ├── CanvasToolbar.tsx
│   │   │   │   ├── MiniMap.tsx
│   │   │   │   ├── nodes/           # Custom React Flow node components
│   │   │   │   │   ├── BaseNode.tsx
│   │   │   │   │   ├── TriggerNode.tsx
│   │   │   │   │   ├── ActionNode.tsx
│   │   │   │   │   ├── ConditionNode.tsx
│   │   │   │   │   ├── LoopNode.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   ├── edges/
│   │   │   │   │   ├── DefaultEdge.tsx
│   │   │   │   │   └── ConditionalEdge.tsx
│   │   │   │   ├── panels/
│   │   │   │   │   ├── NodeConfigPanel.tsx  # Right sidebar config
│   │   │   │   │   ├── NodeSearchPanel.tsx  # Add-node palette
│   │   │   │   │   └── ExecutionPanel.tsx   # Live run status
│   │   │   │   └── hooks/
│   │   │   │       ├── useAutoLayout.ts
│   │   │   │       ├── useUndoRedo.ts
│   │   │   │       └── useKeyboardShortcuts.ts
│   │   │   │
│   │   │   ├── execution/           # Execution viewer
│   │   │   │   ├── ExecutionDetail.tsx
│   │   │   │   ├── NodeLogCard.tsx
│   │   │   │   ├── VariableInspector.tsx    # Milestone 2
│   │   │   │   └── ExecutionList.tsx
│   │   │   │
│   │   │   ├── pages/
│   │   │   │   ├── WorkflowsPage.tsx
│   │   │   │   ├── WorkflowEditorPage.tsx   # Wraps Canvas
│   │   │   │   ├── ExecutionsPage.tsx
│   │   │   │   ├── CredentialsPage.tsx
│   │   │   │   ├── VariablesPage.tsx        # Milestone 2
│   │   │   │   └── NotFoundPage.tsx
│   │   │   │
│   │   │   ├── credentials/
│   │   │   │   ├── CredentialForm.tsx
│   │   │   │   └── CredentialSelector.tsx
│   │   │   │
│   │   │   ├── hooks/
│   │   │   │   └── useRealtimeExecution.ts  # Socket.io subscription
│   │   │   │
│   │   │   ├── lib/
│   │   │   │   ├── api-client.ts    # Axios instance + interceptors
│   │   │   │   ├── socket.ts        # Socket.io client singleton
│   │   │   │   └── utils.ts
│   │   │   │
│   │   │   └── components/
│   │   │       └── ui/              # shadcn/ui components
│   │   │
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   │
│   ├── api/                         # Express API server
│   │   ├── src/
│   │   │   ├── index.ts             # HTTP server bootstrap
│   │   │   ├── app.ts               # Express app factory (for testing)
│   │   │   ├── config.ts            # Env-var validation with Zod
│   │   │   │
│   │   │   ├── routes/
│   │   │   │   ├── index.ts         # Router mount point
│   │   │   │   ├── dashboard.ts
│   │   │   │   ├── workflows.ts
│   │   │   │   ├── executions.ts
│   │   │   │   ├── webhooks.ts      # Public webhook receiver
│   │   │   │   ├── schedules.ts     # Milestone 2
│   │   │   │   ├── credentials.ts
│   │   │   │   ├── variables.ts     # Milestone 2
│   │   │   │   └── nodes.ts
│   │   │   │
│   │   │   ├── services/
│   │   │   │   ├── WorkflowService.ts
│   │   │   │   ├── ExecutionService.ts
│   │   │   │   ├── CredentialService.ts
│   │   │   │   ├── SchedulerService.ts    # Milestone 2
│   │   │   │   ├── WebhookService.ts
│   │   │   │   ├── NodeRegistryService.ts
│   │   │   │   ├── DashboardService.ts
│   │   │   │   ├── StorageService.ts
│   │   │   │   └── NotificationService.ts
│   │   │   │
│   │   │   ├── middlewares/
│   │   │   │   ├── identifyActor.ts # No-op actor-context placeholder — see below
│   │   │   │   ├── rateLimiter.ts   # Redis sliding window
│   │   │   │   ├── errorHandler.ts  # Global error → Problem JSON
│   │   │   │   └── requestLogger.ts
│   │   │   │
│   │   │   ├── realtime/
│   │   │   │   ├── socketServer.ts  # Socket.io setup
│   │   │   │   └── executionRelay.ts # Redis sub → Socket.io push
│   │   │   │
│   │   │   └── lib/
│   │   │       ├── crypto.ts        # AES-256-GCM encrypt/decrypt
│   │   │       ├── redis.ts
│   │   │       ├── logger.ts        # Pino singleton
│   │   │       └── queue.ts         # BullMQ queue definitions
│   │   │
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── worker/                      # Execution engine worker process
│       ├── src/
│       │   ├── index.ts             # Worker bootstrap, BullMQ consumer
│       │   ├── config.ts
│       │   │
│       │   ├── engine/
│       │   │   ├── ExecutionEngine.ts    # Top-level orchestrator
│       │   │   ├── GraphBuilder.ts       # JSON → DAG in-memory graph
│       │   │   ├── NodeRunner.ts         # Run single node; catch errors
│       │   │   ├── BranchResolver.ts     # Evaluate branch conditions
│       │   │   ├── LoopController.ts     # Manage loop iterations
│       │   │   ├── RetryManager.ts       # Exponential backoff policy
│       │   │   ├── TimeoutWatcher.ts     # Per-node + per-execution timers
│       │   │   ├── VariableStore.ts      # Runtime variable read/write
│       │   │   └── SandboxRunner.ts      # isolated-vm code node executor
│       │   │
│       │   ├── processors/
│       │   │   ├── executionProcessor.ts  # BullMQ job handler
│       │   │   └── scheduleProcessor.ts   # Cron job handler (Milestone 2)
│       │   │
│       │   └── lib/
│       │       ├── redis.ts
│       │       ├── logger.ts
│       │       └── queue.ts
│       │
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── node-sdk/                    # Public SDK for authoring custom nodes
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── types.ts             # NodeManifest, NodeContext, etc.
│   │   │   ├── BaseNode.ts
│   │   │   └── helpers/
│   │   │       ├── http.ts
│   │   │       ├── auth.ts          # Credential-based auth helpers for node authors
│   │   │       └── data.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── nodes-core/                  # Built-in nodes
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── triggers/
│   │   │   │   ├── WebhookTrigger.ts
│   │   │   │   ├── ScheduleTrigger.ts    # Milestone 2
│   │   │   │   └── ManualTrigger.ts
│   │   │   └── actions/
│   │   │       ├── HttpRequest.ts
│   │   │       ├── CodeNode.ts
│   │   │       ├── ConditionNode.ts
│   │   │       ├── LoopNode.ts
│   │   │       ├── SetVariableNode.ts
│   │   │       ├── LogNode.ts
│   │   │       └── SubWorkflowNode.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── nodes-integrations/          # Integration nodes (Milestone 3)
│   │   ├── src/
│   │   │   ├── slack/
│   │   │   ├── github/
│   │   │   ├── stripe/
│   │   │   ├── postgres/
│   │   │   └── openai/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── db/                          # Drizzle schema + migrations
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── client.ts            # pg pool + Drizzle instance
│   │   │   └── schema/
│   │   │       ├── index.ts         # re-exports all tables
│   │   │       ├── workflows.ts
│   │   │       ├── workflow-versions.ts
│   │   │       ├── nodes.ts
│   │   │       ├── node-connections.ts
│   │   │       ├── executions.ts
│   │   │       ├── execution-logs.ts
│   │   │       ├── credentials.ts
│   │   │       ├── webhooks.ts
│   │   │       ├── schedules.ts     # Milestone 2
│   │   │       └── variables.ts     # Milestone 2
│   │   ├── drizzle.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── api-spec/                    # OpenAPI spec + codegen
│       ├── openapi.yaml             # Single source of truth
│       ├── orval.config.ts
│       └── package.json
│
├── infra/
│   ├── docker/
│   │   ├── Dockerfile.api
│   │   ├── Dockerfile.worker
│   │   └── Dockerfile.web
│   ├── docker-compose.yml           # Local dev: all services
│   ├── docker-compose.prod.yml      # Production compose override
│   ├── nginx/
│   │   ├── nginx.conf
│   │   └── ssl/                     # TLS certs (or Let's Encrypt config)
│   ├── k8s/                         # Kubernetes manifests
│   │   ├── namespace.yaml
│   │   ├── api-deployment.yaml
│   │   ├── worker-deployment.yaml
│   │   ├── web-deployment.yaml
│   │   ├── postgres-statefulset.yaml
│   │   ├── redis-statefulset.yaml
│   │   ├── ingress.yaml
│   │   └── hpa.yaml                 # Horizontal pod autoscaler
│   ├── helm/                        # Helm chart for K8s deploy
│   │   └── flowforge/
│   │       ├── Chart.yaml
│   │       ├── values.yaml
│   │       └── templates/
│   └── grafana/
│       └── dashboard.json
│
├── scripts/
│   ├── seed.ts                      # Dev seed data
│   ├── archive-executions.ts        # S3 archival job
│   ├── rotate-key.ts                # Credential key rotation
│   └── migrate.ts                   # Run Drizzle migrations
│
├── docs/
│   ├── 01-architecture.md
│   ├── 02-database-schema.md
│   ├── 03-api-specification.md
│   ├── 04-folder-structure.md       # This file
│   ├── 05-development-roadmap.md
│   ├── 06-implementation-phases.md
│   └── 07-workflow-engine.md
│
├── .github/
│   └── workflows/
│       ├── ci.yml                   # Lint + typecheck + test on PR
│       └── deploy.yml               # Build + push Docker images on main
│
├── package.json                     # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
├── .env.example
├── .eslintrc.json
└── README.md
```

---

## Key Conventions

### Monorepo layout
- `apps/` — runnable services (web, api, worker)
- `packages/` — shared libraries (node-sdk, db, api-spec, core nodes, integration nodes)
- `infra/` — all deployment configuration
- `scripts/` — operational utilities

### Package naming
- `@flowforge/web`, `@flowforge/api`, `@flowforge/worker`
- `@flowforge/node-sdk`, `@flowforge/nodes-core`, `@flowforge/db`, `@flowforge/api-spec`

### TypeScript project references
- All `packages/*` are composite with `emitDeclarationOnly`
- `apps/*` are leaf packages that import from packages but do not emit
- Root `tsconfig.json` references all packages (solution build)

### The `identifyActor` seam
`apps/api/src/middlewares/identifyActor.ts` runs on every request in the MVP. It currently does one thing: attach a hardcoded "local user" actor context to `req.context` and call `next()` — no token check, no lookup. Route handlers and services already read the actor from `req.context` instead of assuming a single global user, so when the Authentication & Multi-Tenancy milestone ships, this file is replaced with real JWT/session verification and nothing downstream has to change shape.

### Environment variables
See `.env.example` for full list. MVP-required vars:
```
DATABASE_URL=
REDIS_URL=
ENCRYPTION_KEY=          # 32 hex bytes, AES-256 key (credential encryption)
S3_BUCKET=
S3_ENDPOINT=             # empty = AWS, set for MinIO

# Added by the Authentication & Multi-Tenancy milestone — not read by the MVP:
# JWT_SECRET=
# JWT_REFRESH_SECRET=
# SESSION_SECRET=
```

### Node execution isolation
Custom `Code` nodes run in `isolated-vm`; all other node types run in the worker process directly. Node packages are loaded at worker startup from `@flowforge/nodes-core` and, from Milestone 3 onward, `@flowforge/nodes-integrations`.

---

## Deferred — Authentication & Multi-Tenancy

Paths added on top of the tree above when that milestone ships. Nothing above is deleted or renamed to make room for these — this is a purely additive layer.

```
apps/web/src/pages/LoginPage.tsx
apps/web/src/pages/RegisterPage.tsx
apps/web/src/pages/SettingsPage.tsx        # workspace config, team management, API keys
apps/web/src/pages/TeamPage.tsx
apps/web/src/pages/AuditLogPage.tsx
apps/web/src/hooks/useAuth.ts
apps/web/src/hooks/useWorkspace.ts

apps/api/src/routes/auth.ts
apps/api/src/routes/workspaces.ts
apps/api/src/routes/teams.ts
apps/api/src/routes/api-keys.ts
apps/api/src/routes/audit-logs.ts
apps/api/src/services/AuditService.ts
apps/api/src/services/WorkspaceService.ts
apps/api/src/services/TeamService.ts
apps/api/src/services/ApiKeyService.ts
apps/api/src/middlewares/auth.ts           # replaces identifyActor.ts
apps/api/src/middlewares/requireRole.ts    # RBAC enforcement
apps/api/src/lib/jwt.ts
apps/api/src/lib/oidc.ts

packages/db/src/schema/users.ts
packages/db/src/schema/workspaces.ts
packages/db/src/schema/workspace-members.ts
packages/db/src/schema/teams.ts
packages/db/src/schema/team-members.ts
packages/db/src/schema/permissions.ts
packages/db/src/schema/api-keys.ts
packages/db/src/schema/audit-logs.ts
packages/db/src/schema/refresh-tokens.ts

scripts/migrate-to-multi-tenant.ts         # additive migration + backfill (see 02-database-schema.md)
```
