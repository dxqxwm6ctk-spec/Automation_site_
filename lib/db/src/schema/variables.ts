import { boolean, index, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

/**
 * Per-user variables (Milestone 2 — Phase 2.2).
 *
 * Variables are key/value pairs injected into every node's execution context
 * as `{{vars.<key>}}` (string substitution in node config) and as
 * `context.vars.<key>` (for nodes that evaluate an expression, e.g.
 * Set Variable's `$vars`). Secret variables are stored in plaintext here
 * (unlike credentials, they are short strings like tokens) but their values
 * are masked in API responses when `isSecret = true`.
 *
 * Scoped by `userId` — nullable so rows created before this scoping existed
 * are preserved, matching the `workflows.userId` pattern.
 */
export const variables = pgTable(
  "variables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id").references(() => usersTable.id),
    key: text("key").notNull(),
    value: text("value").notNull().default(""),
    isSecret: boolean("is_secret").notNull().default(false),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_variables_key").on(table.key),
    index("idx_variables_user_id").on(table.userId),
    unique("variables_user_id_key_key").on(table.userId, table.key),
  ],
);

export const insertVariableSchema = createInsertSchema(variables).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVariable = z.infer<typeof insertVariableSchema>;
export type Variable = typeof variables.$inferSelect;
