import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  real,
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
  providerUsed: text("provider_used", { enum: ["mock", "openai", "gemini", "groq", "ollama", "rule_based"] })
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
  rawExtractionJson: jsonb("raw_extraction_json"),
  // ── M17: Prompt Transparency & Extraction Audit Trail ──────────────────────
  providerModel: text("provider_model").notNull().default(""),
  systemPrompt: text("system_prompt").notNull().default(""),
  promptTemplateSummary: text("prompt_template_summary").notNull().default(""),
  rawProviderResponse: jsonb("raw_provider_response"),
  repairStatus: text("repair_status", {
    enum: ["not_needed", "repaired", "failed"],
  })
    .notNull()
    .default("not_needed"),
  validationErrors: text("validation_errors"),
  tokenUsage: jsonb("token_usage"),
  // ── M19: Domain Templates and Model Type Classifier ─────────────────────────
  // Auto-detected canonical model type from the rule-based domain classifier.
  // "unknown" is the safe default for unknown models.
  modelType: text("model_type", {
    enum: [
      "monod_chemostat",
      "fed_batch",
      "batch_culture",
      "cstr",
      "pfr",
      "enzyme_kinetics",
      "gas_liquid",
      "microalgae_photobioreactor",
      "oxygen_balanced_mixotrophy",
      "unknown",
    ],
  })
    .notNull()
    .default("unknown"),
  // Normalised classifier confidence in [0, 1]. 0 = no keyword evidence.
  modelTypeConfidence: real("model_type_confidence").notNull().default(0),
  // Keywords from the source text that triggered the classification.
  modelTypeMatchedKeywords: jsonb("model_type_matched_keywords")
    .$type<string[]>()
    .notNull()
    .default([]),
  // User-supplied override. When set, takes precedence over modelType.
  // Null means "use the classifier result".
  modelTypeOverride: text("model_type_override", {
    enum: [
      "monod_chemostat",
      "fed_batch",
      "batch_culture",
      "cstr",
      "pfr",
      "enzyme_kinetics",
      "gas_liquid",
      "microalgae_photobioreactor",
      "oxygen_balanced_mixotrophy",
      "unknown",
    ],
  }),
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
