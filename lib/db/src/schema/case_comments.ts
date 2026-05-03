import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { casesTable } from "./cases";

export const caseCommentsTable = pgTable("case_comments", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").references(() => casesTable.id).notNull(),
  authorName: text("author_name").notNull(),
  authorRole: text("author_role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
