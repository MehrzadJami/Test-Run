import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { extractionsTable } from "./extractions";

export const variablesTable = pgTable("variables", {
  id: serial("id").primaryKey(),
  extractionId: integer("extraction_id")
    .notNull()
    .references(() => extractionsTable.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull().default(0),
  symbol: text("symbol").notNull(),
  name: text("name").notNull().default(""),
  meaning: text("meaning").notNull().default(""),
  unit: text("unit").notNull().default(""),
  role: text("role", { enum: ["state", "input", "output", "parameter", "control"] })
    .notNull()
    .default("state"),
  confidence: text("confidence", { enum: ["high", "medium", "low"] })
    .notNull()
    .default("medium"),
  sourceQuote: text("source_quote").notNull().default(""),
  editedByUser: boolean("edited_by_user").notNull().default(false),
  originalValue: jsonb("original_value"),
});

export const insertVariableSchema = createInsertSchema(variablesTable).omit({
  id: true,
});
export type InsertVariable = z.infer<typeof insertVariableSchema>;
export type Variable = typeof variablesTable.$inferSelect;
