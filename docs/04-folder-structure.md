# FlowForge — Production-Ready Folder Structure

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
│   │   │   │   ├── VariableInspector.tsx
│   │   │   │   └── ExecutionList.tsx
│   │   │   │
│   │   │   ├── pages/
│   │   │   │   ├── DashboardPage.tsx
│   │   │   │   ├── WorkflowsPage.tsx
│   │   │   │   ├── WorkflowEditorPage.tsx   # Wraps Canvas
│   │   │   │   ├── ExecutionsPage.tsx
│   │   │   │   ├── CredentialsPage.tsx
│   │   │   │   ├── VariablesPage.tsx
│   │   │   │   ├── TeamPage.tsx
│   │   │   │   ├── SettingsPage.tsx
│   │   │   │   ├── AuditLogPage.tsx
│   │   │   │   ├── LoginPage.tsx
│   │   │   │   └── NotFoundPage.tsx
│   │   │   │
│   │   │   ├── credentials/
│   │   │   │   ├── CredentialForm.tsx
│   │   │   │   └── CredentialSelector.tsx
│   │   │   │
│   │   │   ├── hooks/
│   │   │   │   ├── useAuth.ts
│   │   │   │   ├── useWorkspace.ts
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
│   │   │   │   ├── auth.ts
│   │   │   │   ├── workspaces.ts
│   │   │   │   ├── workflows.ts
│   │   │   │   ├── executions.ts
│   │   │   │   ├── webhooks.ts      # Public webhook receiver
│   │   │   │   ├── schedules.ts
│   │   │   │   ├── credentials.ts
│   │   │   │   ├── variables.ts
│   │   │   │   ├── nodes.ts
│   │   │   │   ├── api-keys.ts
│   │   │   │   ├── teams.ts
│   │   │   │   └── audit-logs.ts
│   │   │   │
│   │   │   ├── services/
│   │   │   │   ├── WorkflowService.ts
│   │   │   │   ├── ExecutionService.ts
│   │   │   │   ├── CredentialService.ts
│   │   │   │   ├── SchedulerService.ts
│   │   │   │   ├── WebhookService.ts
│   │   │   │   ├── NodeRegistryService.ts
│   │   │   │   ├── AuditService.ts
│   │   │   │   ├── StorageService.ts
│   │   │   │   └── NotificationService.ts
│   │   │   │
│   │   │   ├── middlewares/
│   │   │   │   ├── auth.ts          # JWT + API key validation
│   │   │   │   ├── requireRole.ts   # RBAC enforcement
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
│   │   │       ├── jwt.ts
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
│       │   │   └── scheduleProcessor.ts   # Cron job handler
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
│   │   │       ├── auth.ts
│   │   │       └── data.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── nodes-core/                  # Built-in nodes
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── triggers/
│   │   │   │   ├── WebhookTrigger.ts
│   │   │   │   ├── ScheduleTrigger.ts
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
│   ├── nodes-integrations/          # Integration nodes (v1.1+)
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
│   │   │       ├── users.ts
│   │   │       ├── workspaces.ts
│   │   │       ├── workflows.ts
│   │   │       ├── executions.ts
│   │   │       ├── credentials.ts
│   │   │       ├── variables.ts
│   │   │       ├── schedules.ts
│   │   │       ├── webhooks.ts
│   │   │       ├── api-keys.ts
│   │   │       ├── teams.ts
│   │   │       └── audit-logs.ts
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
│   └── 06-implementation-phases.md
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

### Environment variables
See `.env.example` for full list. Critical vars:
```
DATABASE_URL=
REDIS_URL=
ENCRYPTION_KEY=          # 32 hex bytes, AES-256 key
JWT_SECRET=
JWT_REFRESH_SECRET=
S3_BUCKET=
S3_ENDPOINT=             # empty = AWS, set for MinIO
SESSION_SECRET=
```

### Node execution isolation
Custom `Code` nodes run in `isolated-vm`; all other node types run in the worker process directly. Node packages are loaded at worker startup from `@flowforge/nodes-core` and optionally `@flowforge/nodes-integrations`.
