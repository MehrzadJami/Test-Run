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

// Stores both assumptions and limitations under one table, distinguished by `kind`.
export const assumptionsTable = pgTable("assumptions", {
  id: serial("id").primaryKey(),
  extractionId: integer("extraction_id")
    .notNull()
    .references(() => extractionsTable.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull().default(0),
  kind: text("kind", { enum: ["assumption", "limitation"] })
    .notNull()
    .default("assumption"),
  text: text("text").notNull(),
  sourceQuote: text("source_quote").notNull().default(""),
  confidence: text("confidence", { enum: ["high", "medium", "low"] })
    .notNull()
    .default("medium"),
  editedByUser: boolean("edited_by_user").notNull().default(false),
  originalValue: jsonb("original_value"),
});

export const insertAssumptionSchema = createInsertSchema(assumptionsTable).omit(
  { id: true },
);
export type InsertAssumption = z.infer<typeof insertAssumptionSchema>;
export type Assumption = typeof assumptionsTable.$inferSelect;
