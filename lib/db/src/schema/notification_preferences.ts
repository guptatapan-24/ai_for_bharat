import { pgTable, serial, integer, boolean, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const notificationPreferencesTable = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }).notNull().unique(),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  inAppEnabled: boolean("in_app_enabled").notNull().default(true),
  urgentOnly: boolean("urgent_only").notNull().default(false),
  departmentSubscriptions: text("department_subscriptions").notNull().default("[]"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type NotificationPreferences = typeof notificationPreferencesTable.$inferSelect;
export type InsertNotificationPreferences = typeof notificationPreferencesTable.$inferInsert;
