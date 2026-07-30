import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

// The API must never return data_encrypted / data_iv (see replit.md "Gotchas").
export const credentials = pgTable(
  "credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable so rows created before auth shipped are preserved.
    userId: varchar("user_id").references(() => usersTable.id),
    name: text("name").notNull(),
    // "oauth2", "api_key", "basic", "aws", etc.
    credentialType: text("credential_type").notNull(),
    // AES-256-GCM base64 ciphertext.
    dataEncrypted: text("data_encrypted").notNull(),
    dataIv: text("data_iv").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // Unique credential names are scoped per user — two different users may use the same name.
    uniqueIndex("credentials_user_name_key")
      .on(table.userId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    index("idx_credentials_type")
      .on(table.credentialType)
      .where(sql`${table.deletedAt} IS NULL`),
    index("idx_credentials_user_id").on(table.userId),
  ],
);

export const insertCredentialSchema = createInsertSchema(credentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export type InsertCredential = z.infer<typeof insertCredentialSchema>;
export type Credential = typeof credentials.$inferSelect;
