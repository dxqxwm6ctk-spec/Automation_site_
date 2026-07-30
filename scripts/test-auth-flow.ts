/**
 * End-to-end auth + workflow flow test (no real browser required).
 *
 * What it does:
 *   1. Inserts a synthetic OIDC user into the users table (simulating a
 *      successful /callback upsert)
 *   2. Creates a session row (simulating createSession)
 *   3. Calls GET /api/v1/workflows  — expects empty list
 *   4. Calls POST /api/v1/workflows — creates a workflow, checks userId
 *   5. Calls GET /api/v1/workflows  — expects 1 workflow
 *   6. Calls GET /api/v1/workflows/:id — checks the specific workflow
 *   7. Calls POST /api/v1/workflows/:id/execute — triggers first run
 *   8. Deletes the session row (simulating /logout)
 *   9. Calls GET /api/v1/workflows  — expects 401
 *  10. Cleans up test rows
 *
 * Run: pnpm --filter scripts run tsx test-auth-flow.ts
 */

import crypto from 'node:crypto';
import pg from 'pg';

const API = 'http://localhost:8080';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });

async function sql(text: string, values: unknown[] = []) {
  const res = await pool.query(text, values);
  return res.rows;
}

async function apiFetch(
  path: string,
  opts: RequestInit & { cookie?: string } = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.cookie ? { Cookie: opts.cookie } : {}),
  };
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...headers, ...(opts.headers as Record<string, string> | undefined) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// Coloured helpers
const ok = (msg: string) => console.log(`  ✅  ${msg}`);
const fail = (msg: string) => { console.error(`  ❌  ${msg}`); process.exitCode = 1; };
const section = (msg: string) => console.log(`\n── ${msg}`);

function assert(cond: boolean, msg: string) {
  if (cond) ok(msg); else fail(msg);
}

// ─── Test user / session setup ────────────────────────────────────────────────

const TEST_USER_ID = `test_oidc_${crypto.randomBytes(6).toString('hex')}`;
const TEST_SID     = crypto.randomBytes(32).toString('hex');
const SESSION_TTL  = 7 * 24 * 60 * 60 * 1000;
const cookie       = `sid=${TEST_SID}`;

async function setup() {
  section('Setup: inserting test user + session');

  await sql(
    `INSERT INTO users (id, email, first_name, last_name, profile_image_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_USER_ID, 'testuser@example.com', 'Test', 'User', null],
  );
  ok(`User ${TEST_USER_ID} inserted`);

  const sessData = {
    user: {
      id: TEST_USER_ID,
      email: 'testuser@example.com',
      firstName: 'Test',
      lastName: 'User',
      profileImageUrl: null,
    },
    access_token: 'fake_access_token',
    expires_at: Math.floor((Date.now() + SESSION_TTL) / 1000),
  };

  await sql(
    `INSERT INTO sessions (sid, sess, expire)
     VALUES ($1, $2, $3)
     ON CONFLICT (sid) DO NOTHING`,
    [TEST_SID, JSON.stringify(sessData), new Date(Date.now() + SESSION_TTL)],
  );
  ok(`Session ${TEST_SID.slice(0, 12)}… created`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testWorkflowList_empty() {
  section('1. GET /api/v1/workflows — expect empty list');
  const { status, body } = await apiFetch('/api/v1/workflows', { cookie });
  assert(status === 200, `status 200 (got ${status})`);
  const b = body as { workflows: unknown[]; total: number } | null;
  assert(b?.workflows?.length === 0, `workflows is empty (len=${b?.workflows?.length})`);
  assert(b?.total === 0, `total is 0 (got ${b?.total})`);
}

let createdWorkflowId: string | null = null;

async function testWorkflowCreate() {
  section('2. POST /api/v1/workflows — create workflow, verify userId');
  const { status, body } = await apiFetch('/api/v1/workflows', {
    method: 'POST',
    cookie,
    body: JSON.stringify({
      name: 'Test Workflow',
      description: 'Created by auth flow test',
      tags: ['test'],
    }),
  });
  assert(status === 201, `status 201 (got ${status})`);
  const b = body as { workflow: { id: string; userId: string }; version: unknown } | null;
  assert(!!b?.workflow?.id, `response has workflow.id (${b?.workflow?.id})`);
  assert(b?.workflow?.userId === TEST_USER_ID, `userId = ${b?.workflow?.userId} (want ${TEST_USER_ID})`);
  createdWorkflowId = b?.workflow?.id ?? null;

  // Verify in DB directly
  if (createdWorkflowId) {
    const rows = await sql('SELECT user_id FROM workflows WHERE id = $1', [createdWorkflowId]);
    assert(rows[0]?.user_id === TEST_USER_ID, `DB row user_id = ${rows[0]?.user_id}`);
  }
}

async function testWorkflowList_one() {
  section('3. GET /api/v1/workflows — expect 1 result');
  const { status, body } = await apiFetch('/api/v1/workflows', { cookie });
  assert(status === 200, `status 200 (got ${status})`);
  const b = body as { workflows: unknown[]; total: number } | null;
  assert(b?.workflows?.length === 1, `workflows has 1 item (len=${b?.workflows?.length})`);
  assert(b?.total === 1, `total is 1 (got ${b?.total})`);
}

async function testWorkflowGet() {
  if (!createdWorkflowId) { fail('no workflow id — skipping GET by id'); return; }
  section('4. GET /api/v1/workflows/:id — check specific workflow');
  const { status, body } = await apiFetch(`/api/v1/workflows/${createdWorkflowId}`, { cookie });
  assert(status === 200, `status 200 (got ${status})`);
  const b = body as { workflow: { id: string; name: string } } | null;
  assert(b?.workflow?.name === 'Test Workflow', `name = "${b?.workflow?.name}"`);
}

async function testExecute() {
  if (!createdWorkflowId) { fail('no workflow id — skipping execute'); return; }
  section('5. POST /api/v1/workflows/:id/execute — trigger run');
  const { status, body } = await apiFetch(`/api/v1/workflows/${createdWorkflowId}/execute`, {
    method: 'POST',
    cookie,
    body: JSON.stringify({}),
  });
  // Workflow has an empty graph, so it may return 202 or 422 (no runnable nodes).
  // Both are acceptable; what matters is it's NOT 401/403/404.
  const b = body as { execution?: { id: string }; error?: string } | null;
  assert(
    status === 202 || status === 422,
    `status 202 or 422 — got ${status}. body: ${JSON.stringify(b)}`,
  );
  if (status === 202) ok(`execution id: ${(b as { execution?: { id: string } })?.execution?.id}`);
}

async function testLogout_and_401() {
  section('6. Delete session (simulate logout) → GET returns 401');
  await sql('DELETE FROM sessions WHERE sid = $1', [TEST_SID]);
  ok('Session row deleted');

  const { status } = await apiFetch('/api/v1/workflows', { cookie });
  assert(status === 401, `status 401 after logout (got ${status})`);
}

async function testAuthUser_unauthenticated() {
  section('7. GET /api/auth/user without session — returns {user:null}');
  const { status, body } = await apiFetch('/api/auth/user');
  assert(status === 200, `status 200 (got ${status})`);
  const b = body as { user: null } | null;
  assert(b?.user === null, `user is null (got ${JSON.stringify(b?.user)})`);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup() {
  section('Cleanup');
  if (createdWorkflowId) {
    await sql('DELETE FROM workflow_versions WHERE workflow_id = $1', [createdWorkflowId]);
    await sql('DELETE FROM workflows WHERE id = $1', [createdWorkflowId]);
    ok(`workflow ${createdWorkflowId} deleted`);
  }
  await sql('DELETE FROM sessions WHERE sid = $1', [TEST_SID]);
  await sql('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
  ok(`user ${TEST_USER_ID} deleted`);
  await pool.end();
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('FlowForge — auth + workflow end-to-end test\n');
  try {
    await setup();
    await testWorkflowList_empty();
    await testWorkflowCreate();
    await testWorkflowList_one();
    await testWorkflowGet();
    await testExecute();
    await testLogout_and_401();
    await testAuthUser_unauthenticated();
    console.log('\n' + (process.exitCode === 1 ? '❌  Some tests failed.' : '✅  All tests passed.'));
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
