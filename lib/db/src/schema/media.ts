import { pgTable, serial, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const mediaTypeEnum = pgEnum("media_type", ["file", "url"]);
export const safetyStatusEnum = pgEnum("safety_status", ["safe", "unpreviewed", "flagged"]);

export const mediaTable = pgTable("media", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: mediaTypeEnum("type").notNull(),
  title: text("title").notNull(),
  fileName: text("file_name"),
  fileHash: text("file_hash"),
  url: text("url"),
  mimeType: text("mime_type"),
  safetyStatus: safetyStatusEnum("safety_status").notNull().default("unpreviewed"),
  lastWatched: timestamp("last_watched", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertMediaSchema = createInsertSchema(mediaTable).omit({ id: true, createdAt: true });
export type InsertMedia = z.infer<typeof insertMediaSchema>;
export type Media = typeof mediaTable.$inferSelect;
