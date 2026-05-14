import { pgTable, serial, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { casesTable } from "./cases";

export const emailStatusEnum = pgEnum("email_status", [
  "sent", "failed", "skipped",
]);

export const emailLogsTable = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  status: emailStatusEnum("status").notNull(),
  providerResponse: text("provider_response"),
  relatedCaseId: integer("related_case_id").references(() => casesTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type EmailLog = typeof emailLogsTable.$inferSelect;
