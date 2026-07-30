import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workflowVersions } from "./workflow-versions";
import { usersTable } from "./auth";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable so rows created before auth shipped are preserved.
    userId: varchar("user_id").references(() => usersTable.id),
    name: text("name").notNull(),
    description: text("description"),
    tags: text("tags").array().notNull().default([]),
    isActive: boolean("is_active").notNull().default(false),
    // Set after the first workflow_versions row is inserted (see that file).
    // A plain FK is safe here (no DEFERRABLE needed) because the app always
    // creates the workflow, then the version, then updates this column.
    activeVersionId: uuid("active_version_id").references(
      (): AnyPgColumn => workflowVersions.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_workflows_active").on(table.isActive).where(sql`${table.deletedAt} IS NULL`),
    index("idx_workflows_tags").using("gin", table.tags),
    index("idx_workflows_user_id").on(table.userId),
  ],
);

export const insertWorkflowSchema = createInsertSchema(workflows).omit({
  id: true,
  activeVersionId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export type InsertWorkflow = z.infer<typeof insertWorkflowSchema>;
export type Workflow = typeof workflows.$inferSelect;
