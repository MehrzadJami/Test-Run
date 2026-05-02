import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { sourceDocumentsTable } from "./source-documents";

export const extractionsTable = pgTable("extractions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  sourceDocumentId: integer("source_document_id").references(
    () => sourceDocumentsTable.id,
    { onDelete: "set null" },
  ),
  providerUsed: text("provider_used", { enum: ["mock", "openai", "gemini"] })
    .notNull()
    .default("mock"),
  status: text("status", { enum: ["pending", "ready", "failed"] })
    .notNull()
    .default("ready"),
  modelCardTitle: text("model_card_title").notNull(),
  domain: text("domain").notNull().default(""),
  systemDescription: text("system_description").notNull().default(""),
  problemStatement: text("problem_statement").notNull().default(""),
  odeTemplate: text("ode_template").notNull().default(""),
  // Full validated provider output (canonical ExtractionResultSchema shape).
  // Nullable for backwards compatibility with rows created before this column
  // existed; the frontend gracefully falls back to normalized tables.
  rawExtractionJson: jsonb("raw_extraction_json"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertExtractionSchema = createInsertSchema(extractionsTable).omit(
  { id: true, createdAt: true, updatedAt: true },
);
export type InsertExtraction = z.infer<typeof insertExtractionSchema>;
export type Extraction = typeof extractionsTable.$inferSelect;
