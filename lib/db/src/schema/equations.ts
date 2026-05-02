import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { extractionsTable } from "./extractions";

export const equationsTable = pgTable("equations", {
  id: serial("id").primaryKey(),
  extractionId: integer("extraction_id")
    .notNull()
    .references(() => extractionsTable.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull().default(0),
  label: text("label").notNull().default(""),
  latex: text("latex").notNull(),
  plaintext: text("plaintext").notNull().default(""),
  meaning: text("meaning").notNull().default(""),
  variablesInvolved: text("variables_involved")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  confidence: text("confidence", { enum: ["high", "medium", "low"] })
    .notNull()
    .default("medium"),
  description: text("description").notNull().default(""),
  sourceQuote: text("source_quote").notNull().default(""),
  editedByUser: boolean("edited_by_user").notNull().default(false),
  originalValue: jsonb("original_value"),
});

export const insertEquationSchema = createInsertSchema(equationsTable).omit({
  id: true,
});
export type InsertEquation = z.infer<typeof insertEquationSchema>;
export type Equation = typeof equationsTable.$inferSelect;
