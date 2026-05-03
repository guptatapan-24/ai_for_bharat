import { pgTable, serial, text, integer, timestamp, boolean, real, pgEnum, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { casesTable } from "./cases";
import { judgmentsTable } from "./judgments";

export const directiveTypeEnum = pgEnum("directive_type", [
  "compliance_order", "stay", "direction", "limitation_period", "appeal", "observation", "other"
]);

export const directiveClassificationEnum = pgEnum("directive_classification", [
  "mandatory", "advisory", "unknown"
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "pending", "approved", "edited", "rejected"
]);

export const directivesTable = pgTable("directives", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").references(() => casesTable.id).notNull(),
  judgmentId: integer("judgment_id").references(() => judgmentsTable.id).notNull(),
  type: directiveTypeEnum("type").notNull().default("other"),
  classification: directiveClassificationEnum("classification").notNull().default("unknown"),
  sourceText: text("source_text").notNull(),
  pageNumber: integer("page_number").notNull(),
  paragraphRef: text("paragraph_ref"),
  deadline: date("deadline"),
  deadlineInferred: boolean("deadline_inferred").notNull().default(false),
  deadlineSource: text("deadline_source"),
  responsibleDepartment: text("responsible_department"),
  actionRequired: text("action_required").notNull(),
  isNovel: boolean("is_novel").notNull().default(false),
  confidenceScore: real("confidence_score").notNull().default(0.85),
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("pending"),
  reviewerName: text("reviewer_name"),
  reviewerCorrection: text("reviewer_correction"),
  reviewerReason: text("reviewer_reason"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDirectiveSchema = createInsertSchema(directivesTable).omit({ id: true, createdAt: true });
export type InsertDirective = z.infer<typeof insertDirectiveSchema>;
export type Directive = typeof directivesTable.$inferSelect;
