import { pgTable, serial, integer, real, timestamp, text, boolean, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mediaTable } from "./media";
import { usersTable } from "./users";
import { frameCategoryEnum } from "./jumpframes";

export const submissionStatusEnum = pgEnum("submission_status", ["pending", "approved", "rejected", "flagged"]);

export const submissionsTable = pgTable("submissions", {
  id: serial("id").primaryKey(),
  mediaId: integer("media_id").notNull().references(() => mediaTable.id, { onDelete: "cascade" }),
  startTime: real("start_time").notNull(),
  endTime: real("end_time").notNull(),
  category: frameCategoryEnum("category").notNull(),
  status: submissionStatusEnum("status").notNull().default("pending"),
  submittedBy: integer("submitted_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  aiFlagged: boolean("ai_flagged").notNull().default(false),
  aiReason: text("ai_reason"),
  aiSeverity: text("ai_severity"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertSubmissionSchema = createInsertSchema(submissionsTable).omit({ id: true, createdAt: true });
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type Submission = typeof submissionsTable.$inferSelect;
