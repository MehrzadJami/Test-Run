import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { extractionsTable } from "./extractions";

export const parametersTable = pgTable("parameters", {
  id: serial("id").primaryKey(),
  extractionId: integer("extraction_id")
    .notNull()
    .references(() => extractionsTable.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull().default(0),
  symbol: text("symbol").notNull(),
  name: text("name").notNull().default(""),
  value: doublePrecision("value").notNull(),
  unit: text("unit").notNull().default(""),
  confidence: text("confidence", { enum: ["high", "medium", "low"] })
    .notNull()
    .default("medium"),
  sourceQuote: text("source_quote").notNull().default(""),
  editedByUser: boolean("edited_by_user").notNull().default(false),
  originalValue: jsonb("original_value"),
});

export const insertParameterSchema = createInsertSchema(parametersTable).omit({
  id: true,
});
export type InsertParameter = z.infer<typeof insertParameterSchema>;
export type Parameter = typeof parametersTable.$inferSelect;
