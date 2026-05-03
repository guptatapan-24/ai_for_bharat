import { pgTable, serial, text, integer, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { casesTable } from "./cases";

export const judgmentsTable = pgTable("judgments", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").references(() => casesTable.id).notNull(),
  pdfHash: text("pdf_hash").notNull(),
  pageCount: integer("page_count").notNull().default(0),
  isScanned: boolean("is_scanned").notNull().default(false),
  overallOcrConfidence: real("overall_ocr_confidence"),
  lowConfidencePages: text("low_confidence_pages").default("[]"),
  modelVersion: text("model_version").default("gpt-4o"),
  rawTextPreview: text("raw_text_preview"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertJudgmentSchema = createInsertSchema(judgmentsTable).omit({ id: true, createdAt: true });
export type InsertJudgment = z.infer<typeof insertJudgmentSchema>;
export type Judgment = typeof judgmentsTable.$inferSelect;
