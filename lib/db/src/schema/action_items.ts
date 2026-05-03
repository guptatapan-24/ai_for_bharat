import { pgTable, serial, text, integer, timestamp, boolean, pgEnum, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { casesTable } from "./cases";
import { directivesTable } from "./directives";

export const actionItemStatusEnum = pgEnum("action_item_status", [
  "pending", "in_progress", "completed", "escalated"
]);

export const actionItemsTable = pgTable("action_items", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").references(() => casesTable.id).notNull(),
  directiveId: integer("directive_id").references(() => directivesTable.id).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  department: text("department").notNull(),
  priority: text("priority").notNull().default("medium"),
  classification: text("classification").notNull().default("mandatory"),
  deadline: date("deadline"),
  deadlineInferred: boolean("deadline_inferred").notNull().default(false),
  status: actionItemStatusEnum("status").notNull().default("pending"),
  sourcePageNumber: integer("source_page_number").notNull(),
  sourceText: text("source_text").notNull(),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertActionItemSchema = createInsertSchema(actionItemsTable).omit({ id: true, createdAt: true });
export type InsertActionItem = z.infer<typeof insertActionItemSchema>;
export type ActionItem = typeof actionItemsTable.$inferSelect;
