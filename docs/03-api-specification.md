# FlowForge — API Specification

## Conventions

- Base URL: `/api/v1`
- All requests and responses use `application/json`
- Authentication: `Authorization: Bearer <access_token>` on protected routes
- API key auth: `X-API-Key: <raw_key>` as alternative on all non-auth routes
- Errors follow RFC 7807 Problem JSON:
  ```json
  { "type": "...", "title": "...", "status": 400, "detail": "...", "instance": "/api/v1/..." }
  ```
- Pagination: cursor-based using `after` (cursor), `limit` (max 100, default 20); response includes `nextCursor`
- Timestamps: ISO 8601 UTC strings

---

## Authentication

### `POST /api/v1/auth/register`
Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "min8chars",
  "displayName": "Alice"
}
```
**Response `201`:**
```json
{
  "user": { "id": "uuid", "email": "...", "displayName": "..." },
  "accessToken": "...",
  "refreshToken": "..."
}
```

### `POST /api/v1/auth/login`
Authenticate with email + password.

**Request:** `{ "email": "...", "password": "..." }`  
**Response `200`:** Same shape as register.

### `POST /api/v1/auth/refresh`
Exchange a refresh token for a new access token.

**Request:** `{ "refreshToken": "..." }`  
**Response `200`:** `{ "accessToken": "...", "refreshToken": "..." }`

### `POST /api/v1/auth/logout`
Revoke the current refresh token. Requires Bearer auth.  
**Response `204`:** No content.

### `GET /api/v1/auth/me`
Return the authenticated user's profile.  
**Response `200`:** `{ "user": { ... } }`

### `GET /api/v1/auth/oidc/authorize`
Redirect to OIDC provider. Query param: `provider` (`google` | `okta`)

### `GET /api/v1/auth/oidc/callback`
OIDC callback. Issues access + refresh tokens, redirects to frontend.

---

## Workspaces

### `GET /api/v1/workspaces`
List workspaces the authenticated user belongs to.  
**Response `200`:**
```json
{
  "workspaces": [
    { "id": "uuid", "slug": "acme", "name": "Acme Corp", "role": "admin", "plan": "pro" }
  ]
}
```

### `POST /api/v1/workspaces`
Create a workspace. Caller becomes owner.  
**Request:** `{ "name": "Acme", "slug": "acme" }`  
**Response `201`:** `{ "workspace": { ... } }`

### `GET /api/v1/workspaces/:workspaceId`
Get workspace detail.

### `PATCH /api/v1/workspaces/:workspaceId`
Update name, description, or settings. Requires `admin` role.

### `DELETE /api/v1/workspaces/:workspaceId`
Soft-delete workspace. Requires `owner` role.

### `GET /api/v1/workspaces/:workspaceId/members`
List members. Returns user + role pairs.

### `POST /api/v1/workspaces/:workspaceId/members`
Invite a member. Body: `{ "email": "...", "role": "editor" }`

### `PATCH /api/v1/workspaces/:workspaceId/members/:userId`
Change a member's role.

### `DELETE /api/v1/workspaces/:workspaceId/members/:userId`
Remove a member.

---

## Workflows

### `GET /api/v1/workspaces/:workspaceId/workflows`
List workflows. Query params: `tags[]`, `isActive`, `search`, `after`, `limit`.

**Response `200`:**
```json
{
  "workflows": [
    {
      "id": "uuid",
      "name": "Send Slack on GitHub Push",
      "isActive": true,
      "tags": ["ci", "notifications"],
      "activeVersionId": "uuid",
      "lastExecutionAt": "2025-01-01T00:00:00Z",
      "createdAt": "..."
    }
  ],
  "nextCursor": "...",
  "total": 42
}
```

### `POST /api/v1/workspaces/:workspaceId/workflows`
Create a workflow (creates version 1 automatically).  
**Request:**
```json
{
  "name": "My Workflow",
  "description": "...",
  "tags": ["sales"],
  "graph": { "nodes": [], "connections": [] }
}
```
**Response `201`:** `{ "workflow": { ... }, "version": { ... } }`

### `GET /api/v1/workspaces/:workspaceId/workflows/:workflowId`
Get workflow with its active version graph.

### `PUT /api/v1/workspaces/:workspaceId/workflows/:workflowId`
Save a new version of the workflow graph. Creates a new `workflow_versions` record and updates `active_version_id`.  
**Request:** `{ "graph": { "nodes": [...], "connections": [...] }, "description": "Fix HTTP timeout" }`  
**Response `200`:** `{ "workflow": { ... }, "version": { "id": "uuid", "version": 5 } }`

### `PATCH /api/v1/workspaces/:workspaceId/workflows/:workflowId`
Update metadata (name, description, tags, isActive) without creating a new version.

### `DELETE /api/v1/workspaces/:workspaceId/workflows/:workflowId`
Soft-delete workflow. Cancels any running executions.

### `GET /api/v1/workspaces/:workspaceId/workflows/:workflowId/versions`
List version history. Response: `{ "versions": [{ "id", "version", "description", "createdBy", "createdAt" }] }`

### `POST /api/v1/workspaces/:workspaceId/workflows/:workflowId/versions/:versionId/restore`
Set a past version as the active version.

---

## Executions

### `POST /api/v1/workspaces/:workspaceId/workflows/:workflowId/execute`
Manually trigger a workflow execution.  
**Request (optional):** `{ "input": { "key": "value" } }` — injected as trigger payload  
**Response `202`:**
```json
{
  "executionId": "uuid",
  "status": "pending",
  "statusUrl": "/api/v1/executions/uuid"
}
```

### `GET /api/v1/workspaces/:workspaceId/executions`
List executions across all workflows. Query: `workflowId`, `status`, `triggerType`, `after`, `limit`.

### `GET /api/v1/executions/:executionId`
Get execution detail with node-level logs.

**Response `200`:**
```json
{
  "execution": {
    "id": "uuid",
    "workflowId": "uuid",
    "status": "success",
    "triggerType": "manual",
    "startedAt": "...",
    "finishedAt": "...",
    "durationMs": 1234,
    "nodeLogs": [
      {
        "nodeKey": "http_1",
        "status": "success",
        "durationMs": 340,
        "input": { "url": "https://..." },
        "output": { "statusCode": 200, "body": { ... } }
      }
    ]
  }
}
```

### `POST /api/v1/executions/:executionId/cancel`
Cancel a running execution. Sends cancellation signal to worker.  
**Response `200`:** `{ "status": "cancelled" }`

### `POST /api/v1/executions/:executionId/retry`
Retry a failed execution (same input, new execution record).  
**Response `202`:** Same as trigger response.

---

## Webhooks (Public Entry Point)

### `POST /api/v1/webhooks/:token`
Public, unauthenticated webhook receiver.

- Validates HMAC signature if `X-FlowForge-Signature` header is present and webhook has a signing secret.
- Enqueues execution job with `trigger_type = 'webhook'`.
- Immediate mode: responds `202 Accepted` instantly.
- Wait mode (`response_mode = wait_for_completion`): polls execution up to 30 s; returns workflow output.

**Response `202`:** `{ "executionId": "uuid", "message": "Accepted" }`  
**Response `200` (wait mode):** `{ "output": { ... } }` — the workflow's final node output

---

## Webhook Configuration

### `GET /api/v1/workspaces/:workspaceId/workflows/:workflowId/webhooks`
List webhook configs for a workflow.

### `POST /api/v1/workspaces/:workspaceId/workflows/:workflowId/webhooks`
Create a webhook trigger. Returns generated token + public URL.  
**Request:** `{ "method": "POST", "responseMode": "immediate", "signingSecret": "optional" }`  
**Response `201`:** `{ "webhook": { "id": "...", "token": "wh_abc123", "url": "https://app.example.com/api/v1/webhooks/wh_abc123" } }`

### `DELETE /api/v1/workspaces/:workspaceId/webhooks/:webhookId`
Deactivate + delete a webhook.

---

## Schedules

### `GET /api/v1/workspaces/:workspaceId/workflows/:workflowId/schedules`
List schedules.

### `POST /api/v1/workspaces/:workspaceId/workflows/:workflowId/schedules`
Create a schedule.  
**Request:**
```json
{
  "cronExpression": "0 9 * * 1-5",
  "timezone": "America/New_York",
  "missedRunPolicy": "skip"
}
```
**Response `201`:** `{ "schedule": { "id": "...", "nextRunAt": "..." } }`

### `PATCH /api/v1/schedules/:scheduleId`
Update cron expression, timezone, or active state.

### `DELETE /api/v1/schedules/:scheduleId`
Delete a schedule.

---

## Credentials

### `GET /api/v1/workspaces/:workspaceId/credentials`
List credential stubs (name, type — never returns decrypted data).

### `POST /api/v1/workspaces/:workspaceId/credentials`
Create credential. Data is encrypted server-side.  
**Request:** `{ "name": "Stripe Production", "type": "api_key", "data": { "apiKey": "sk_live_..." } }`  
**Response `201`:** `{ "credential": { "id": "...", "name": "...", "type": "...", "createdAt": "..." } }`

### `PUT /api/v1/workspaces/:workspaceId/credentials/:credentialId`
Overwrite credential data (re-encrypts).

### `POST /api/v1/workspaces/:workspaceId/credentials/:credentialId/test`
Run a live connectivity test using the credential.  
**Response `200`:** `{ "success": true }` or `{ "success": false, "error": "..." }`

### `DELETE /api/v1/workspaces/:workspaceId/credentials/:credentialId`
Soft-delete credential. Warns if referenced by active workflows.

---

## Variables

### `GET /api/v1/workspaces/:workspaceId/variables`
List workspace-level variables. Query: `environment`, `workflowId`.

### `POST /api/v1/workspaces/:workspaceId/variables`
Create variable. Secrets stored encrypted.  
**Request:** `{ "key": "API_BASE", "value": "https://...", "environment": "prod", "isSecret": false }`

### `PUT /api/v1/workspaces/:workspaceId/variables/:variableId`
Update value.

### `DELETE /api/v1/workspaces/:workspaceId/variables/:variableId`

---

## Nodes (Node Registry)

### `GET /api/v1/nodes`
List all available node types with their manifests.  
**Response `200`:**
```json
{
  "nodes": [
    {
      "type": "action.http",
      "version": "1.2.0",
      "label": "HTTP Request",
      "category": "Core",
      "description": "Make an HTTP request to any URL",
      "inputSchema": { ... },
      "outputSchema": { ... },
      "credentials": ["oauth2", "api_key"],
      "iconUrl": "/static/nodes/http.svg"
    }
  ]
}
```

### `GET /api/v1/nodes/:nodeType`
Get full manifest for a single node type.

---

## API Keys

### `GET /api/v1/workspaces/:workspaceId/api-keys`
List API keys (masked prefix only).

### `POST /api/v1/workspaces/:workspaceId/api-keys`
Create API key. Returns raw key **once** — not retrievable later.  
**Request:** `{ "name": "CI Deploy Key", "scopes": ["workflow:read", "execution:write"], "expiresAt": "2026-01-01" }`  
**Response `201`:** `{ "apiKey": { "id": "...", "name": "...", "key": "ff_live_abc123..." } }`

### `DELETE /api/v1/workspaces/:workspaceId/api-keys/:keyId`
Revoke API key immediately.

---

## Teams

### `GET /api/v1/workspaces/:workspaceId/teams`
### `POST /api/v1/workspaces/:workspaceId/teams`
### `GET /api/v1/workspaces/:workspaceId/teams/:teamId`
### `PATCH /api/v1/workspaces/:workspaceId/teams/:teamId`
### `DELETE /api/v1/workspaces/:workspaceId/teams/:teamId`
### `POST /api/v1/workspaces/:workspaceId/teams/:teamId/members`
### `DELETE /api/v1/workspaces/:workspaceId/teams/:teamId/members/:userId`

---

## Audit Logs

### `GET /api/v1/workspaces/:workspaceId/audit-logs`
Query audit log. Query params: `actorId`, `action`, `resourceType`, `resourceId`, `from`, `to`, `after`, `limit`.  
Requires `admin` role.

---

## Health & Metrics

### `GET /api/v1/health`
Returns `200 OK` with `{ "status": "ok", "timestamp": "..." }` when the server is live.

### `GET /api/v1/ready`
Checks DB + Redis connectivity. Returns `200` when ready, `503` when degraded.  
**Response:** `{ "postgres": "ok", "redis": "ok" }` or `{ "postgres": "error", "redis": "ok" }`

### `GET /metrics`
Prometheus-format metrics. Accessible only from internal network (Nginx ACL).

---

## Real-time WebSocket

### `WS /api/v1/ws`
Upgrade to Socket.io connection. Authenticate with `auth: { token: "<accessToken>" }` in the handshake.

**Client → Server events:**
| Event | Payload | Description |
|---|---|---|
| `subscribe:execution` | `{ executionId }` | Start receiving events for an execution |
| `unsubscribe:execution` | `{ executionId }` | Stop receiving events |

**Server → Client events:**
| Event | Payload |
|---|---|
| `execution:node:start` | `{ executionId, nodeKey, startedAt }` |
| `execution:node:complete` | `{ executionId, nodeKey, status, output, durationMs }` |
| `execution:node:error` | `{ executionId, nodeKey, error }` |
| `execution:complete` | `{ executionId, status, finishedAt, durationMs }` |
| `execution:cancelled` | `{ executionId }` |

---

## Error Codes

| Code | HTTP Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Authenticated but insufficient role/permission |
| `NOT_FOUND` | 404 | Resource does not exist or is not accessible |
| `CONFLICT` | 409 | Unique constraint violation (e.g. duplicate workflow name) |
| `VALIDATION_ERROR` | 422 | Request body failed Zod schema validation |
| `RATE_LIMITED` | 429 | Too many requests |
| `EXECUTION_FAILED` | 422 | Workflow execution failed; see `detail` for node-level error |
| `CREDENTIAL_INVALID` | 422 | Credential test failed |
| `INTERNAL_ERROR` | 500 | Unexpected server error; reference `instance` for tracing |
