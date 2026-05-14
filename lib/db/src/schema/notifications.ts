import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { casesTable } from "./cases";
import { directivesTable } from "./directives";

export const notificationTypeEnum = pgEnum("notification_type", [
  "case_uploaded",
  "directive_assigned",
  "action_plan_generated",
  "case_status_updated",
  "deadline_approaching",
  "escalation_overdue",
]);

export const notificationPriorityEnum = pgEnum("notification_priority", [
  "critical", "high", "medium", "low",
]);

export const notificationDeliveryStatusEnum = pgEnum("notification_delivery_status", [
  "pending", "delivered", "failed",
]);

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }).notNull(),
  caseId: integer("case_id").references(() => casesTable.id, { onDelete: "cascade" }),
  directiveId: integer("directive_id").references(() => directivesTable.id, { onDelete: "cascade" }),
  department: text("department"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: notificationTypeEnum("type").notNull(),
  priority: notificationPriorityEnum("priority").notNull().default("medium"),
  isRead: boolean("is_read").notNull().default(false),
  deliveryStatus: notificationDeliveryStatusEnum("delivery_status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notificationsTable.$inferSelect;
export type InsertNotification = typeof notificationsTable.$inferInsert;
