import { pgTable, serial, integer, real, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mediaTable } from "./media";
import { usersTable } from "./users";

export const frameSourceEnum = pgEnum("frame_source", ["personal", "global"]);
export const frameCategoryEnum = pgEnum("frame_category", ["violence", "sexual", "language", "other"]);

export const jumpFramesTable = pgTable("jump_frames", {
  id: serial("id").primaryKey(),
  mediaId: integer("media_id").notNull().references(() => mediaTable.id, { onDelete: "cascade" }),
  startTime: real("start_time").notNull(),
  endTime: real("end_time").notNull(),
  category: frameCategoryEnum("category").notNull(),
  source: frameSourceEnum("source").notNull().default("personal"),
  validated: boolean("validated").notNull().default(false),
  submittedBy: integer("submitted_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertJumpFrameSchema = createInsertSchema(jumpFramesTable).omit({ id: true, createdAt: true });
export type InsertJumpFrame = z.infer<typeof insertJumpFrameSchema>;
export type JumpFrame = typeof jumpFramesTable.$inferSelect;
