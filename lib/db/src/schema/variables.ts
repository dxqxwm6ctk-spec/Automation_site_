import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Workspace-level variables (Milestone 2 — Phase 2.2).
 *
 * Variables are key/value pairs injected into every node's execution context
 * as `$vars.<key>`.  Secret variables are stored in plaintext here (unlike
 * credentials, they are short strings like tokens) but their values are
 * masked in API responses when `isSecret = true`.
 */
export const variables = pgTable(
  "variables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    value: text("value").notNull().default(""),
    isSecret: boolean("is_secret").notNull().default(false),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_variables_key").on(table.key)],
);

export const insertVariableSchema = createInsertSchema(variables).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVariable = z.infer<typeof insertVariableSchema>;
export type Variable = typeof variables.$inferSelect;
