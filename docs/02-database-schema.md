# FlowForge — Database Schema

All tables use PostgreSQL 16. Primary keys are `uuid` (gen_random_uuid()). Timestamps are `timestamptz` stored in UTC. Soft-delete pattern (`deleted_at`) used on core entities.

**MVP note:** the MVP ships with no user accounts and no tenancy. None of the tables below carry a `workspace_id`, `owner_id`, or `created_by` column — every row is globally visible and editable via the API. This is a deliberate simplification, not an oversight: see "Deferred Schema — Authentication & Multi-Tenancy" for the tables that get added later, and "Additive Migration Sketch" for exactly how existing rows gain an owner without a rewrite.

---

## MVP Schema

Tables that exist from day one of the MVP (Milestone 1).

### Entity Relationship Overview

```
workflows ──< workflow_versions
workflows ──< executions
executions ──< execution_logs
workflow_versions ──< nodes
workflow_versions ──< node_connections
workflows ──< webhooks
credentials                              (standalone; referenced by nodes.credential_id)
```

No entity in the MVP graph is scoped to a user or tenant.

### `workflows`

```sql
CREATE TABLE workflows (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  description       text,
  tags              text[] NOT NULL DEFAULT '{}',
  is_active         boolean NOT NULL DEFAULT false,
  active_version_id uuid,                        -- FK set after first version insert
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX idx_workflows_active ON workflows(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_workflows_tags   ON workflows USING gin(tags);
```

### `workflow_versions`

```sql
CREATE TABLE workflow_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  version      integer NOT NULL,
  graph_json   jsonb NOT NULL,                 -- full node+edge graph snapshot
  description  text,                           -- changelog / commit message
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, version)
);

CREATE INDEX idx_wf_versions_workflow ON workflow_versions(workflow_id);
-- After insert, workflows.active_version_id FK is set:
ALTER TABLE workflows ADD CONSTRAINT fk_active_version
  FOREIGN KEY (active_version_id) REFERENCES workflow_versions(id) DEFERRABLE INITIALLY DEFERRED;
```

### `nodes`

```sql
-- Denormalised for fast graph queries; source of truth is workflow_versions.graph_json
CREATE TABLE nodes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  node_key            text NOT NULL,           -- unique key within the graph, e.g. "http_1"
  node_type           text NOT NULL,           -- "trigger.webhook", "action.http", etc.
  label               text,
  position_x          real NOT NULL DEFAULT 0,
  position_y          real NOT NULL DEFAULT 0,
  config              jsonb NOT NULL DEFAULT '{}',   -- node-specific settings
  credential_id       uuid REFERENCES credentials(id) ON DELETE SET NULL,
  is_disabled         boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nodes_version ON nodes(workflow_version_id);
CREATE INDEX idx_nodes_type    ON nodes(node_type);
```

### `node_connections`

```sql
CREATE TABLE node_connections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  source_node_key     text NOT NULL,
  source_handle       text NOT NULL DEFAULT 'output',   -- named output port
  target_node_key     text NOT NULL,
  target_handle       text NOT NULL DEFAULT 'input',    -- named input port
  condition_expr      text,                             -- optional filter expression
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_connections_version ON node_connections(workflow_version_id);
CREATE INDEX idx_connections_source  ON node_connections(workflow_version_id, source_node_key);
```

### `executions`

```sql
CREATE TABLE executions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id      uuid NOT NULL REFERENCES workflows(id),
  version_id       uuid NOT NULL REFERENCES workflow_versions(id),
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','running','success','error','cancelled','timeout')),
  trigger_type     text NOT NULL CHECK (trigger_type IN ('manual','webhook','schedule','api')),
  trigger_payload  jsonb,                      -- initial input data
  output           jsonb,                      -- final output of last node
  error            jsonb,                      -- structured error if failed
  started_at       timestamptz,
  finished_at      timestamptz,
  duration_ms      integer,
  retry_count      integer NOT NULL DEFAULT 0,
  parent_id        uuid REFERENCES executions(id),   -- for sub-workflow calls
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_executions_workflow ON executions(workflow_id, created_at DESC);
CREATE INDEX idx_executions_status   ON executions(status) WHERE status IN ('pending','running');

-- Partition by month for scale (partition DDL omitted for brevity)
-- ALTER TABLE executions PARTITION BY RANGE (created_at);
```

### `execution_logs`

```sql
CREATE TABLE execution_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  node_key     text NOT NULL,
  status       text NOT NULL CHECK (status IN ('pending','running','success','error','skipped')),
  input        jsonb,                          -- node input (or storage_ref key if large)
  output       jsonb,                          -- node output (or storage_ref key if large)
  error        jsonb,
  storage_ref  text,                           -- S3 key when payload > 100 KB
  duration_ms  integer,
  attempt      integer NOT NULL DEFAULT 1,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_exec_logs_execution ON execution_logs(execution_id);
CREATE INDEX idx_exec_logs_node      ON execution_logs(execution_id, node_key);
```

### `credentials`

```sql
CREATE TABLE credentials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  credential_type text NOT NULL,               -- "oauth2", "api_key", "basic", "aws", etc.
  data_encrypted  text NOT NULL,               -- AES-256-GCM base64 ciphertext
  data_iv         text NOT NULL,               -- base64 IV
  schema_version  integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (name) WHERE deleted_at IS NULL
);

CREATE INDEX idx_credentials_type ON credentials(credential_type) WHERE deleted_at IS NULL;
```

Credentials are global and unscoped in the MVP — there is no owner and no per-user visibility rule. This table is about secret storage, not identity, so it ships in the MVP even though accounts do not.

### `webhooks`

```sql
CREATE TABLE webhooks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id       uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  token             text NOT NULL UNIQUE,         -- wh_{uuid}, used in public URL
  method            text NOT NULL DEFAULT 'POST',
  response_mode     text NOT NULL DEFAULT 'immediate'
                      CHECK (response_mode IN ('immediate','wait_for_completion')),
  response_status   integer NOT NULL DEFAULT 200,
  response_template jsonb,                        -- static response body template
  signing_secret    text,                         -- HMAC key (stored hashed)
  is_active         boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhooks_workflow ON webhooks(workflow_id);
CREATE UNIQUE INDEX idx_webhooks_token ON webhooks(token);
```

---

## Milestone 2 Schema — Scheduling & Variables

Added when the Scheduling & Variables milestone ships. Still flat — no tenancy.

### `schedules`

```sql
CREATE TABLE schedules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id       uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  cron_expression   text NOT NULL,               -- standard 5-part cron
  timezone          text NOT NULL DEFAULT 'UTC',
  is_active         boolean NOT NULL DEFAULT true,
  last_run_at       timestamptz,
  next_run_at       timestamptz,
  missed_run_policy text NOT NULL DEFAULT 'skip' CHECK (missed_run_policy IN ('skip','run_once')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedules_workflow ON schedules(workflow_id);
CREATE INDEX idx_schedules_next_run ON schedules(next_run_at) WHERE is_active = true;
```

### `variables`

```sql
CREATE TABLE variables (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  uuid REFERENCES workflows(id) ON DELETE CASCADE,  -- null = global variable
  environment  text NOT NULL DEFAULT 'all' CHECK (environment IN ('all','dev','staging','prod')),
  key          text NOT NULL,
  value        text NOT NULL,
  is_secret    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, environment, key)
);

CREATE INDEX idx_variables_workflow ON variables(workflow_id);
```

---

## Deferred Schema — Authentication & Multi-Tenancy

**Not created until the Authentication & Multi-Tenancy milestone.** These tables are fully designed now so the migration is a known quantity, not an open design question when the time comes.

### Entity Relationship Overview (deferred)

```
users ──< workspace_members >── workspaces
workspaces ──< teams
teams ──< team_members >── users
workspaces ──< api_keys
workspaces ──< audit_logs
workspaces ──< permissions
refresh_tokens >── users

-- Additive columns land on existing MVP tables:
workspaces ──< workflows     (workspace_id, created_by, updated_by added)
workspaces ──< credentials   (workspace_id, created_by, updated_by added)
workspaces ──< executions    (workspace_id added)
workspaces ──< webhooks      (workspace_id added)
workspaces ──< schedules     (workspace_id, created_by added)
workspaces ──< variables     (workspace_id, created_by added)
```

### `users`

```sql
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  password_hash  text,                        -- null when using OIDC-only
  display_name   text NOT NULL,
  avatar_url     text,
  role           text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','superadmin')),
  settings       jsonb NOT NULL DEFAULT '{}', -- UI preferences, notification prefs
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
```

### `refresh_tokens`

```sql
CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,           -- sha256(token)
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  user_agent  text,
  ip_address  inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
```

### `workspaces`

```sql
CREATE TABLE workspaces (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,          -- url-safe, e.g. "acme-corp"
  name         text NOT NULL,
  description  text,
  owner_id     uuid NOT NULL REFERENCES users(id),
  plan         text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','enterprise')),
  settings     jsonb NOT NULL DEFAULT '{}',   -- execution limits, webhook signing key
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX idx_workspaces_slug  ON workspaces(slug) WHERE deleted_at IS NULL;
```

### `workspace_members`

```sql
CREATE TABLE workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner','admin','editor','viewer')),
  invited_by   uuid REFERENCES users(id),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY  (workspace_id, user_id)
);

CREATE INDEX idx_ws_members_user ON workspace_members(user_id);
```

### `teams`

```sql
CREATE TABLE teams (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  created_by   uuid NOT NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE INDEX idx_teams_workspace ON teams(workspace_id);
```

### `team_members`

```sql
CREATE TABLE team_members (
  team_id    uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
```

### `permissions`

```sql
-- Fine-grained resource overrides on top of workspace role
CREATE TABLE permissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  principal_type  text NOT NULL CHECK (principal_type IN ('user','team')),
  principal_id    uuid NOT NULL,
  resource_type   text NOT NULL CHECK (resource_type IN ('workflow','credential','execution')),
  resource_id     uuid,                        -- null = applies to all of resource_type
  action          text NOT NULL,               -- 'read','write','execute','delete'
  effect          text NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_permissions_principal ON permissions(principal_type, principal_id);
CREATE INDEX idx_permissions_resource  ON permissions(resource_type, resource_id);
```

### `api_keys`

```sql
CREATE TABLE api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id),
  name         text NOT NULL,
  key_hash     text NOT NULL UNIQUE,             -- sha256(raw_key)
  key_prefix   text NOT NULL,                    -- first 8 chars for display
  scopes       text[] NOT NULL DEFAULT '{}',     -- ['workflow:read','execution:write', ...]
  expires_at   timestamptz,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_workspace ON api_keys(workspace_id);
CREATE INDEX idx_api_keys_hash      ON api_keys(key_hash);
```

### `audit_logs`

```sql
CREATE TABLE audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  actor_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_type    text NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user','api_key','system')),
  actor_key_id  uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  action        text NOT NULL,                   -- 'workflow.created', 'credential.updated', ...
  resource_type text NOT NULL,
  resource_id   uuid,
  before_json   jsonb,                           -- state before change
  after_json    jsonb,                           -- state after change
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Partitions created monthly; old partitions can be detached and archived to S3
CREATE INDEX idx_audit_workspace ON audit_logs(workspace_id, created_at DESC);
CREATE INDEX idx_audit_actor     ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_resource  ON audit_logs(resource_type, resource_id);
```

### Additive Migration Sketch

This is the exact shape the Authentication & Multi-Tenancy migration takes. No MVP table is dropped, renamed, or restructured — every change is a nullable column added, then backfilled, then tightened.

```sql
-- 1. Create the new tables above (users, workspaces, workspace_members, teams,
--    team_members, permissions, api_keys, audit_logs, refresh_tokens).

-- 2. Add nullable tenant/ownership columns to existing MVP tables.
ALTER TABLE workflows        ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE workflows        ADD COLUMN created_by   uuid REFERENCES users(id);
ALTER TABLE workflows        ADD COLUMN updated_by   uuid REFERENCES users(id);
ALTER TABLE workflow_versions ADD COLUMN created_by  uuid REFERENCES users(id);
ALTER TABLE credentials      ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE credentials      ADD COLUMN created_by   uuid REFERENCES users(id);
ALTER TABLE credentials      ADD COLUMN updated_by   uuid REFERENCES users(id);
ALTER TABLE executions       ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE webhooks         ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE schedules        ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE schedules        ADD COLUMN created_by   uuid REFERENCES users(id);
ALTER TABLE variables        ADD COLUMN workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE variables        ADD COLUMN created_by   uuid REFERENCES users(id);

-- 3. Seed exactly one user and one workspace to own everything that already exists.
INSERT INTO users (email, display_name, role) VALUES ('local@flowforge.local', 'Local User', 'admin')
  RETURNING id;                                                    -- => :adminUserId
INSERT INTO workspaces (slug, name, owner_id) VALUES ('local', 'Local Workspace', :adminUserId)
  RETURNING id;                                                    -- => :localWorkspaceId
INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (:localWorkspaceId, :adminUserId, 'owner');

-- 4. Backfill every pre-existing row onto the seeded workspace/user.
UPDATE workflows         SET workspace_id = :localWorkspaceId, created_by = :adminUserId, updated_by = :adminUserId WHERE workspace_id IS NULL;
UPDATE workflow_versions SET created_by = :adminUserId WHERE created_by IS NULL;
UPDATE credentials        SET workspace_id = :localWorkspaceId, created_by = :adminUserId, updated_by = :adminUserId WHERE workspace_id IS NULL;
UPDATE executions         SET workspace_id = :localWorkspaceId WHERE workspace_id IS NULL;
UPDATE webhooks           SET workspace_id = :localWorkspaceId WHERE workspace_id IS NULL;
UPDATE schedules          SET workspace_id = :localWorkspaceId, created_by = :adminUserId WHERE workspace_id IS NULL;
UPDATE variables          SET workspace_id = :localWorkspaceId, created_by = :adminUserId WHERE workspace_id IS NULL;

-- 5. Tighten constraints now that every row is backfilled.
ALTER TABLE workflows   ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE workflows   ALTER COLUMN created_by   SET NOT NULL;
ALTER TABLE workflows   ALTER COLUMN updated_by   SET NOT NULL;
ALTER TABLE credentials ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE executions  ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE webhooks    ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE schedules   ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE variables   ALTER COLUMN workspace_id SET NOT NULL;

-- 6. Add the tenant-scoped indexes that only make sense once workspace_id exists.
CREATE INDEX idx_workflows_workspace   ON workflows(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_credentials_workspace ON credentials(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_executions_workspace  ON executions(workspace_id, created_at DESC);
```

---

## Indexing Strategy Summary

| Pattern | Index type | Rationale |
|---|---|---|
| Lookup by UUID PK | btree (default) | O(log n) point lookup |
| Execution history per workflow (time-ordered) | btree on `(workflow_id, created_at DESC)` | Most common query; compound for filter+sort |
| Active schedules by next run time | partial btree on `next_run_at WHERE is_active` | Scheduler tick query; very selective |
| Workflow full-text search | `gin(to_tsvector('english', name || description))` (future) | Tag array queries use `gin(tags)` |
| Credentials by type | btree on `credential_type` | Node config dropdown population |
| Soft-deleted exclusions | partial index `WHERE deleted_at IS NULL` | Avoid dead-row scans |
| *(deferred)* Audit log by actor | btree on `(actor_id, created_at DESC)` | User activity timeline — added with Authentication & Multi-Tenancy |
| *(deferred)* Resource lookup by tenant | btree on `workspace_id` | Added post-migration once `workspace_id` exists |

---

## Data Retention & Partitioning

- `executions` and `execution_logs`: partition by month; detach + S3 archive after 90 days (configurable)
- `audit_logs` *(deferred)*: partition by month; retain for 1 year minimum (compliance); never delete — does not exist until the Authentication & Multi-Tenancy milestone
- Large node payloads (>100 KB): stored in S3, `storage_ref` column holds the key
- Credential `data_encrypted`: never archived; always available
