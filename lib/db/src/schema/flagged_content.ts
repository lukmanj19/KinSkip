import { pgTable, serial, integer, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const flagSeverityEnum = pgEnum("flag_severity", ["low", "medium", "high", "extreme"]);
export const flagTypeEnum = pgEnum("flag_type", ["submission", "media"]);

export const flaggedContentTable = pgTable("flagged_content", {
  id: serial("id").primaryKey(),
  type: flagTypeEnum("type").notNull(),
  referenceId: integer("reference_id").notNull(),
  severity: flagSeverityEnum("severity").notNull(),
  reason: text("reason").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertFlaggedContentSchema = createInsertSchema(flaggedContentTable).omit({ id: true, createdAt: true });
export type InsertFlaggedContent = z.infer<typeof insertFlaggedContentSchema>;
export type FlaggedContent = typeof flaggedContentTable.$inferSelect;
