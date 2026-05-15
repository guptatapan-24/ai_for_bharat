import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { directivesTable } from "./directives";

export const supportedLanguageEnum = pgEnum("supported_language", ["kn-IN", "hi-IN"]);

export const directiveTranslationsTable = pgTable("directive_translations", {
  id: serial("id").primaryKey(),
  directiveId: integer("directive_id").references(() => directivesTable.id, { onDelete: "cascade" }).notNull(),
  languageCode: supportedLanguageEnum("language_code").notNull(),
  translatedText: text("translated_text").notNull(),
  translatedSourceText: text("translated_source_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type DirectiveTranslation = typeof directiveTranslationsTable.$inferSelect;
export type InsertDirectiveTranslation = typeof directiveTranslationsTable.$inferInsert;
