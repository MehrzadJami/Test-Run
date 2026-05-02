import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const sourceDocumentsTable = pgTable("source_documents", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["text", "pdf"] }).notNull(),
  filename: text("filename"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertSourceDocumentSchema = createInsertSchema(
  sourceDocumentsTable,
).omit({ id: true, createdAt: true });
export type InsertSourceDocument = z.infer<typeof insertSourceDocumentSchema>;
export type SourceDocument = typeof sourceDocumentsTable.$inferSelect;
