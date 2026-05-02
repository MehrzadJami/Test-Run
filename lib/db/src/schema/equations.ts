import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { extractionsTable } from "./extractions";

export const equationsTable = pgTable("equations", {
  id: serial("id").primaryKey(),
  extractionId: integer("extraction_id")
    .notNull()
    .references(() => extractionsTable.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull().default(0),
  latex: text("latex").notNull(),
  description: text("description").notNull().default(""),
  sourceQuote: text("source_quote").notNull().default(""),
});

export const insertEquationSchema = createInsertSchema(equationsTable).omit({
  id: true,
});
export type InsertEquation = z.infer<typeof insertEquationSchema>;
export type Equation = typeof equationsTable.$inferSelect;
