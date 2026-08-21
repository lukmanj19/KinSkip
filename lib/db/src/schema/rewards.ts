import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { submissionsTable } from "./submissions";

/**
 * Reward ledger — one row per point award event (e.g. a submission is approved
 * into the global skip-frame database). The running totals live on the user
 * (`points`, `framesContributed`); this table records the history.
 */
export const rewardsTable = pgTable("rewards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  submissionId: integer("submission_id").references(() => submissionsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertRewardSchema = createInsertSchema(rewardsTable).omit({ id: true, createdAt: true });
export type InsertReward = z.infer<typeof insertRewardSchema>;
export type Reward = typeof rewardsTable.$inferSelect;
