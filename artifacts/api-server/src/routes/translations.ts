import { Router } from "express";
import { db } from "@workspace/db";
import { directiveTranslationsTable, directivesTable, casesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { translateDirectiveFields, type SupportedLanguage } from "../services/sarvam-translation";

const router = Router();

const SUPPORTED_LANGS: SupportedLanguage[] = ["kn-IN", "hi-IN"];

router.post("/cases/:id/directives/translate", async (req, res) => {
  const caseId = Number(req.params.id);
  if (isNaN(caseId)) return res.status(400).json({ error: "Invalid case id" });

  const { language } = req.body as { language?: string };
  if (!language || !SUPPORTED_LANGS.includes(language as SupportedLanguage)) {
    return res.status(400).json({ error: `language must be one of: ${SUPPORTED_LANGS.join(", ")}` });
  }
  const lang = language as SupportedLanguage;

  const caseExists = await db
    .select({ id: casesTable.id })
    .from(casesTable)
    .where(eq(casesTable.id, caseId))
    .then((r) => r[0]);
  if (!caseExists) return res.status(404).json({ error: "Case not found" });

  const directives = await db
    .select()
    .from(directivesTable)
    .where(eq(directivesTable.caseId, caseId));

  if (!directives.length) return res.json([]);

  const directiveIds = directives.map((d) => d.id);

  const existingTranslations = await db
    .select()
    .from(directiveTranslationsTable)
    .where(
      and(
        inArray(directiveTranslationsTable.directiveId, directiveIds),
        eq(directiveTranslationsTable.languageCode, lang)
      )
    );

  const cachedMap = new Map(existingTranslations.map((t) => [t.directiveId, t]));

  const toTranslate = directives.filter((d) => !cachedMap.has(d.id));

  if (toTranslate.length > 0) {
    for (const directive of toTranslate) {
      try {
        const { translatedAction, translatedSource } = await translateDirectiveFields(
          directive.actionRequired,
          directive.sourceText,
          lang
        );

        const [inserted] = await db
          .insert(directiveTranslationsTable)
          .values({
            directiveId: directive.id,
            languageCode: lang,
            translatedText: translatedAction,
            translatedSourceText: translatedSource,
          })
          .onConflictDoNothing()
          .returning();

        if (inserted) cachedMap.set(directive.id, inserted);
      } catch (_err) {
        // fall through — frontend will fallback to English
      }
    }
  }

  const result = directives.map((d) => ({
    directiveId: d.id,
    languageCode: lang,
    translatedText: cachedMap.get(d.id)?.translatedText ?? null,
    translatedSourceText: cachedMap.get(d.id)?.translatedSourceText ?? null,
    cached: existingTranslations.some((t) => t.directiveId === d.id),
  }));

  return res.json(result);
});

router.get("/cases/:id/directives/translations/:lang", async (req, res) => {
  const caseId = Number(req.params.id);
  const lang = req.params.lang as SupportedLanguage;

  if (isNaN(caseId)) return res.status(400).json({ error: "Invalid case id" });
  if (!SUPPORTED_LANGS.includes(lang)) return res.status(400).json({ error: "Unsupported language" });

  const directives = await db
    .select({ id: directivesTable.id })
    .from(directivesTable)
    .where(eq(directivesTable.caseId, caseId));

  if (!directives.length) return res.json([]);

  const directiveIds = directives.map((d) => d.id);

  const translations = await db
    .select()
    .from(directiveTranslationsTable)
    .where(
      and(
        inArray(directiveTranslationsTable.directiveId, directiveIds),
        eq(directiveTranslationsTable.languageCode, lang)
      )
    );

  return res.json(translations);
});

export default router;
