import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
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
});

export const insertAssumptionSchema = createInsertSchema(assumptionsTable).omit(
  { id: true },
);
export type InsertAssumption = z.infer<typeof insertAssumptionSchema>;
export type Assumption = typeof assumptionsTable.$inferSelect;
