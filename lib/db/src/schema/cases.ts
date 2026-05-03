import { pgTable, serial, text, integer, timestamp, pgEnum, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const caseStatusEnum = pgEnum("case_status", [
  "pending", "processing", "under_review", "verified", "completed"
]);

export const urgencyLevelEnum = pgEnum("urgency_level", [
  "critical", "high", "medium", "low"
]);

export const benchTypeEnum = pgEnum("bench_type", [
  "single", "division", "coordinate", "full_bench"
]);

export const governmentRoleEnum = pgEnum("government_role", [
  "petitioner", "respondent", "both", "none"
]);

export const casesTable = pgTable("cases", {
  id: serial("id").primaryKey(),
  caseNumber: text("case_number").notNull(),
  court: text("court").notNull(),
  bench: text("bench"),
  benchType: benchTypeEnum("bench_type"),
  dateOfOrder: date("date_of_order"),
  petitioner: text("petitioner"),
  respondent: text("respondent"),
  governmentRole: governmentRoleEnum("government_role"),
  status: caseStatusEnum("status").notNull().default("pending"),
  urgencyLevel: urgencyLevelEnum("urgency_level").notNull().default("medium"),
  notes: text("notes"),
  processingStartedAt: timestamp("processing_started_at"),
  processingCompletedAt: timestamp("processing_completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCaseSchema = createInsertSchema(casesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof casesTable.$inferSelect;
