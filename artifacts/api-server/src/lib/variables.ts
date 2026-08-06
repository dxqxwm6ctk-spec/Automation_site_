/**
 * Per-user variable store (Milestone 2 — Phase 2.2).
 *
 * Loaded once per execution and threaded through the engine so every node
 * can reference `{{vars.KEY}}` in its config (string substitution) or
 * `$vars` in an evaluated expression (e.g. Set Variable).
 */
import { eq } from "drizzle-orm";
import { db, variables } from "@workspace/db";

/** Loads all variables owned by `userId` as a flat `{ KEY: value }` map. */
export async function loadUserVariables(userId: string | null): Promise<Record<string, string>> {
  if (!userId) return {};
  const rows = await db.select().from(variables).where(eq(variables.userId, userId));
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

/** Matches `{{vars.KEY}}` (optional whitespace around the key). */
const VAR_TEMPLATE_RE = /\{\{\s*vars\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** Substitutes `{{vars.KEY}}` in a single string with its resolved value, leaving unknown keys untouched. */
function substituteString(value: string, vars: Record<string, string>): string {
  return value.replace(VAR_TEMPLATE_RE, (match, key: string) => (key in vars ? vars[key]! : match));
}

/**
 * Recursively walks a node config, substituting `{{vars.KEY}}` in every
 * string value. Non-string values (numbers, booleans, nested objects/arrays)
 * are walked/preserved as-is; only string leaves are rewritten.
 */
export function resolveVariableTemplates<T>(value: T, vars: Record<string, string>): T {
  if (typeof value === "string") {
    return substituteString(value, vars) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveVariableTemplates(item, vars)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, resolveVariableTemplates(val, vars)]),
    ) as unknown as T;
  }
  return value;
}

/**
 * Upserts `{ key: value }` into `userId`'s variable store — used by the
 * Set Variable node's `persist: true` option. Kept in the api-server (not
 * node-registry) so the shared registry package stays DB-free.
 */
export async function persistVariable(userId: string | null, key: string, value: string): Promise<void> {
  if (!userId) return;
  await db
    .insert(variables)
    .values({ userId, key, value })
    .onConflictDoUpdate({
      target: [variables.userId, variables.key],
      set: { value, updatedAt: new Date() },
    });
}
