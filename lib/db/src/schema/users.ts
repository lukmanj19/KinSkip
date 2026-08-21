import { pgTable, serial, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roleEnum = pgEnum("role", ["admin", "viewer"]);
export const tierEnum = pgEnum("tier", ["free", "premium"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  role: roleEnum("role").notNull().default("viewer"),
  tier: tierEnum("tier").notNull().default("free"),
  pinHash: text("pin_hash"),
  // Community reward system: points earned for approved global skip-frame submissions
  points: integer("points").notNull().default(0),
  framesContributed: integer("frames_contributed").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
