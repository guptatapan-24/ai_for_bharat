import { pgTable, serial, text, integer, timestamp, real, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { casesTable } from "./cases";

export const auditEventTypeEnum = pgEnum("audit_event_type", [
  "extraction", "verification", "edit", "rejection", "processing",
  "judgment_uploaded", "processing_started", "processing_completed",
  "directive_verified", "directive_edited", "directive_rejected",
  "action_item_updated", "case_created"
]);

export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").references(() => casesTable.id).notNull(),
  caseNumber: text("case_number").notNull(),
  directiveId: integer("directive_id"),
  eventType: auditEventTypeEnum("event_type").notNull(),
  modelVersion: text("model_version"),
  pdfHash: text("pdf_hash"),
  extractedValue: text("extracted_value"),
  confidenceScore: real("confidence_score"),
  reviewerName: text("reviewer_name"),
  reviewerDecision: text("reviewer_decision"),
  correctedValue: text("corrected_value"),
  statedReason: text("stated_reason"),
  description: text("description"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({ id: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogTable.$inferSelect;
