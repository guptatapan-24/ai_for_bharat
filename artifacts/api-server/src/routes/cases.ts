import { Router } from "express";
import { requireRole } from "../middlewares/auth";
import { db, DEPARTMENT_NAMES } from "@workspace/db";
import {
  notifyCaseUploaded,
  notifyActionPlanGenerated,
  notifyDirectiveAssigned,
  notifyCaseStatusUpdated,
} from "../services/notificationService";
import {
  casesTable,
  judgmentsTable,
  directivesTable,
  actionItemsTable,
  auditLogTable,
} from "@workspace/db";
import {
  ListCasesQueryParams,
  CreateCaseBody,
  GetCaseParams,
  UpdateCaseParams,
  UpdateCaseBody,
  ProcessCaseParams,
  GetComplianceTimelineParams,
} from "@workspace/api-zod";
import { eq, and, or, ilike, desc, asc, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const MODEL = "gpt-4.1";

// How many chars roughly correspond to one page in a dense Indian judgment
const CHARS_PER_PAGE_ESTIMATE = 2000;
const CHUNK_SIZE = 9000;       // larger window = more context per AI call
const CHUNK_OVERLAP = 900;     // 10% overlap to avoid splitting mid-sentence
const MAX_CHUNKS = 120;        // enough to fully cover a 200-page judgment
const CHUNK_BATCH_SIZE = 6;

interface ExtractedDirective {
  type: "compliance_order" | "stay" | "direction" | "limitation_period" | "appeal" | "observation" | "other";
  classification: "mandatory" | "advisory";
  sourceText: string;
  pageNumber: number;
  paragraphRef: string | null;
  deadline: string | null;
  deadlineInferred: boolean;
  deadlineSource: string | null;
  responsibleDepartment: string;
  actionRequired: string;
  isNovel: boolean;
  confidenceScore: number;
}

interface Chunk {
  text: string;
  estStartPage: number;
  estEndPage: number;
  index: number;
}

/** Return a valid YYYY-MM-DD string or null. Rejects descriptive text the AI sometimes returns. */
function sanitizeDate(val: string | null | undefined): string | null {
  if (!val) return null;
  const trimmed = val.trim().split("T")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

/**
 * Resolve a deadline value to a YYYY-MM-DD string.
 * Accepts:
 *  - Already-valid YYYY-MM-DD → returned as-is
 *  - Relative expressions like "3 months", "6 weeks", "90 days", "1 year"
 *    → computed from anchor date (dateOfOrder or today)
 *  - Anything else → null
 */
function resolveDeadline(
  val: string | null | undefined,
  anchorDate: string | null
): string | null {
  if (!val) return null;
  const trimmed = val.trim();

  // Already absolute
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed.split("T")[0])) return trimmed.split("T")[0];

  const anchor = anchorDate ? new Date(anchorDate) : new Date();
  if (isNaN(anchor.getTime())) return null;
  const base = new Date(anchor);

  // Match patterns like "3 months", "6 weeks", "90 days", "1 year", "2 years"
  const numMatch = trimmed.match(/(\d+)\s*(day|week|month|year)/i);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    const unit = numMatch[2].toLowerCase();
    if (unit.startsWith("day")) base.setDate(base.getDate() + n);
    else if (unit.startsWith("week")) base.setDate(base.getDate() + n * 7);
    else if (unit.startsWith("month")) base.setMonth(base.getMonth() + n);
    else if (unit.startsWith("year")) base.setFullYear(base.getFullYear() + n);
    return base.toISOString().split("T")[0];
  }

  return null;
}

/**
 * Fuzzy-match an AI-returned department name against the canonical list.
 * Scoring: exact match > canonical name contained in AI string > AI string tokens in canonical name.
 * Falls back to "Other / Not Specified" if nothing matches with reasonable confidence.
 */
function normalizeDepartment(raw: string): string {
  if (!raw) return "Other / Not Specified";

  // Exact match
  if (DEPARTMENT_NAMES.includes(raw)) return raw;

  const lower = raw.toLowerCase().trim();

  // Exact case-insensitive match
  const exactCI = DEPARTMENT_NAMES.find((d) => d.toLowerCase() === lower);
  if (exactCI) return exactCI;

  // Score each canonical name against the raw string
  const scored = DEPARTMENT_NAMES.map((canonical) => {
    const cl = canonical.toLowerCase();
    // Token overlap score
    const rawTokens = new Set(lower.split(/[\s,&\/]+/).filter((t) => t.length > 2));
    const canTokens = new Set(cl.split(/[\s,&\/]+/).filter((t) => t.length > 2));
    let overlap = 0;
    for (const t of rawTokens) {
      if (canTokens.has(t) || cl.includes(t) || lower.includes(t.slice(0, 5))) overlap++;
    }
    const score = canTokens.size > 0 ? overlap / Math.max(rawTokens.size, canTokens.size) : 0;
    return { canonical, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  // Only accept if there's a meaningful match (>30% token overlap)
  if (best && best.score > 0.3) return best.canonical;
  return "Other / Not Specified";
}

const VALID_DIRECTIVE_TYPES = new Set([
  "compliance_order", "stay", "direction", "limitation_period", "appeal", "observation", "other",
]);
function sanitizeDirectiveType(val: string): "compliance_order" | "stay" | "direction" | "limitation_period" | "appeal" | "observation" | "other" {
  if (VALID_DIRECTIVE_TYPES.has(val)) return val as ReturnType<typeof sanitizeDirectiveType>;
  // Common AI mis-labels → best-fit mapping
  const lower = val.toLowerCase();
  if (lower.includes("stay") || lower.includes("interim") || lower.includes("injunct")) return "stay";
  if (lower.includes("comply") || lower.includes("compliance")) return "compliance_order";
  if (lower.includes("appeal")) return "appeal";
  if (lower.includes("limit") || lower.includes("period")) return "limitation_period";
  if (lower.includes("direct") || lower.includes("order")) return "direction";
  if (lower.includes("observ")) return "observation";
  return "other";
}

const VALID_CLASSIFICATIONS = new Set(["mandatory", "advisory", "unknown"]);
function sanitizeClassification(val: string): "mandatory" | "advisory" | "unknown" {
  if (VALID_CLASSIFICATIONS.has(val)) return val as ReturnType<typeof sanitizeClassification>;
  const lower = val.toLowerCase();
  if (lower.includes("mandatory") || lower.includes("order") || lower.includes("direct") || lower.includes("shall")) return "mandatory";
  if (lower.includes("advisory") || lower.includes("suggest") || lower.includes("recommend")) return "advisory";
  return "unknown";
}

/** Split full judgment text into overlapping chunks with guaranteed full coverage.
 *
 *  Strategy for Indian court judgments:
 *  - Last 45% (operative part/orders): 60% of chunk budget — processed FIRST
 *  - First 55% (facts + analysis):     40% of chunk budget — processed second
 *
 *  Key fix: chunk start positions are evenly distributed so that every character
 *  of each section is covered by at least one chunk window. The step is computed
 *  as (sectionLen - CHUNK_SIZE) / (budget - 1), ensuring the last chunk always
 *  ends at the section boundary with no gaps.
 */
function buildChunks(fullText: string, pageCount: number): Chunk[] {
  const textLen = fullText.length;

  if (textLen <= CHUNK_SIZE * 1.5) {
    return [{ text: fullText, estStartPage: 1, estEndPage: Math.max(pageCount, 1), index: 0 }];
  }

  const makeChunk = (slice: string, charOffset: number, idx: number): Chunk | null => {
    if (slice.trim().length < 200) return null;
    const startRatio = charOffset / textLen;
    const endRatio = Math.min(1, (charOffset + slice.length) / textLen);
    return {
      text: slice,
      estStartPage: Math.max(1, Math.round(startRatio * pageCount)),
      estEndPage: Math.max(1, Math.min(pageCount, Math.round(endRatio * pageCount) + 1)),
      index: idx,
    };
  };

  /** Build evenly-distributed chunks that guarantee full coverage of a section.
   *  The step between chunk starts = (sectionLen - CHUNK_SIZE) / (n - 1)
   *  so chunk[0] starts at 0, chunk[n-1] starts at sectionLen-CHUNK_SIZE. */
  const makeCoveredChunks = (
    section: string,
    sectionCharOffset: number,
    budget: number
  ): Chunk[] => {
    const sLen = section.length;
    const result: Chunk[] = [];

    if (sLen <= CHUNK_SIZE) {
      const c = makeChunk(section, sectionCharOffset, 0);
      if (c) result.push(c);
      return result;
    }

    // How many chunks do we need for full coverage with no gaps?
    const neededForFullCoverage = Math.ceil((sLen - CHUNK_SIZE) / (CHUNK_SIZE - CHUNK_OVERLAP)) + 1;
    const n = Math.min(budget, neededForFullCoverage);

    // Space starts evenly: step = (lastStart) / (n-1)
    const lastStart = sLen - CHUNK_SIZE;
    const step = n <= 1 ? lastStart : Math.round(lastStart / (n - 1));

    for (let i = 0; i < n; i++) {
      const start = Math.min(i * step, lastStart);
      const slice = section.slice(start, start + CHUNK_SIZE);
      const c = makeChunk(slice, sectionCharOffset + start, result.length);
      if (c) result.push(c);
    }
    return result;
  };

  // Split: last 45% = operative orders, first 55% = facts/analysis
  const tailCutoff = Math.floor(textLen * 0.55);
  const headText = fullText.slice(0, tailCutoff);
  const tailText = fullText.slice(tailCutoff);

  // Budget split: 60% for operative tail (most directives), 40% for facts head
  const tailBudget = Math.ceil(MAX_CHUNKS * 0.60);
  const headBudget = MAX_CHUNKS - tailBudget;

  const tailChunks = makeCoveredChunks(tailText, tailCutoff, tailBudget);
  const headChunks = makeCoveredChunks(headText, 0, headBudget);

  // Tail first (highest directive density), then head — re-index throughout
  const all = [...tailChunks, ...headChunks].slice(0, MAX_CHUNKS);
  all.forEach((c, i) => { c.index = i; });
  return all;
}

/** Deduplicate directives — two are considered duplicates only if their
 *  sourceTexts share >85% of significant words (length > 4).
 *
 *  Using a higher threshold (was 70%) avoids incorrectly merging distinct
 *  directives that share common legal phrasing like "the court ordered" or
 *  "the respondent shall comply". Different departments / actions with similar
 *  boilerplate should be kept as separate directives.
 */
function deduplicateDirectives(directives: ExtractedDirective[]): ExtractedDirective[] {
  const sig = (s: string) =>
    new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length > 4));

  const unique: ExtractedDirective[] = [];
  for (const d of directives) {
    const wordsD = sig(d.sourceText);
    const isDup = unique.some((u) => {
      const wordsU = sig(u.sourceText);
      const smaller = Math.min(wordsD.size, wordsU.size);
      if (smaller < 5) return false; // too short to compare meaningfully
      let overlap = 0;
      for (const w of wordsD) if (wordsU.has(w)) overlap++;
      return overlap / smaller > 0.85;
    });
    if (!isDup) unique.push(d);
  }
  return unique;
}

/** Parse the raw AI response string into an array of ExtractedDirective objects. */
function parseDirectivesResponse(content: string): ExtractedDirective[] {
  let parsed: { directives?: ExtractedDirective[] } = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    try {
      const match = content.match(/\[[\s\S]*\]/);
      parsed = { directives: JSON.parse(match?.[0] ?? "[]") };
    } catch {
      return [];
    }
  }
  return parsed.directives ?? (Array.isArray(parsed) ? (parsed as unknown as ExtractedDirective[]) : []);
}

/** Single AI call for one text chunk. Returns [] on any error (chunk may have no directives). */
async function extractChunk(
  chunk: Chunk,
  caseContext: string,
  dateOfOrder: string | null
): Promise<ExtractedDirective[]> {
  const anchorNote = dateOfOrder
    ? `The date of this court order is ${dateOfOrder}. Use this as the anchor when computing absolute deadlines from relative expressions like "within 3 months", "6 weeks from today", etc. Convert every relative deadline to an absolute YYYY-MM-DD date.`
    : `No date of order provided. If the AI sees a relative deadline like "3 months", store it literally in deadlineSource and set deadlineInferred=true.`;

  const systemPrompt = `You are VerdictIQ, a specialized legal AI for Indian government compliance. Analyze the following excerpt from an Indian court judgment and extract ALL court-ordered directives.

${anchorNote}

EXTRACT EVERY instance of:
• Court orders using: "directed to", "shall", "is ordered", "we direct", "we order", "ORDERED THAT", "In the result", "Accordingly", "is required to", "must comply", "is hereby directed", "shall forthwith", "take steps to"
• Stay/interim orders and injunctions
• Deadlines, time limits, compliance schedules ("within X weeks/months/days")
• Directions to file reports, affidavits, status reports
• Directions to any government body, officer, or department
• Compensation/payment orders with amounts
• Investigation/inquiry directions
• Contempt notices and show-cause directions

DO NOT extract: counsel arguments, factual background, party submissions, case history.

DEADLINE RULES — CRITICAL:
• If a deadline is expressed as "within 3 months" and dateOfOrder is known, compute the absolute date (YYYY-MM-DD) and put it in "deadline"
• If deadline is already an absolute date, convert to YYYY-MM-DD
• Always fill "deadlineSource" with the exact phrase from the text (e.g., "within three months from the date of this order")
• Set deadlineInferred=false if taken verbatim, true if computed/estimated

DEPARTMENT RULES — CRITICAL:
• "responsibleDepartment" MUST be EXACTLY one of the names from the CANONICAL DEPARTMENT LIST
• Do NOT invent department names; pick the closest canonical match
• Police/law enforcement → "Police Department (State)"
• Revenue/land → "Revenue Department (State)"
• Environmental matters → "Ministry of Environment, Forest & Climate Change"
• Courts/registry → "High Court Registry"
• If genuinely none fits → "Other / Not Specified"

CANONICAL DEPARTMENT LIST:
${DEPARTMENT_NAMES.join("\n")}

For EACH directive return this exact JSON:
{
  "type": "compliance_order"|"stay"|"direction"|"limitation_period"|"appeal"|"observation"|"other",
  "classification": "mandatory"|"advisory",
  "sourceText": "<verbatim text from excerpt, max 350 chars>",
  "pageNumber": <integer>,
  "paragraphRef": "<Para N or null>",
  "deadline": "<YYYY-MM-DD or null>",
  "deadlineInferred": <true|false>,
  "deadlineSource": "<exact phrase from text or null>",
  "responsibleDepartment": "<exact canonical name>",
  "actionRequired": "<clear one-sentence imperative starting with a verb>",
  "isNovel": <true|false>,
  "confidenceScore": <0.0-1.0>
}

Respond with ONLY a JSON object: {"directives": [...]}
If no directives found in this excerpt, respond: {"directives": []}`;

  const userPrompt = `CASE: ${caseContext}

JUDGMENT EXCERPT (pages ${chunk.estStartPage}–${chunk.estEndPage}):
---
${chunk.text}
---

Extract all directives from the above excerpt as JSON.`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  return parseDirectivesResponse(content);
}

/** Metadata-only extraction (no PDF text). Used when no document has been uploaded. */
async function extractDirectivesWithAI(caseRow: {
  caseNumber: string;
  court: string;
  bench: string | null;
  benchType: string | null;
  dateOfOrder: string | null;
  petitioner: string | null;
  respondent: string | null;
  governmentRole: string | null;
  notes: string | null;
}): Promise<ExtractedDirective[]> {
  const caseContext = `Case Number: ${caseRow.caseNumber}
Court: ${caseRow.court}
Bench: ${caseRow.bench ?? "Not specified"} (${caseRow.benchType ?? "single"} bench)
Date of Order: ${caseRow.dateOfOrder ?? "Not specified"}
Petitioner: ${caseRow.petitioner ?? "Not specified"}
Respondent: ${caseRow.respondent ?? "Not specified"}
Government Role: ${caseRow.governmentRole ?? "Not specified"}
Case Notes/Nature: ${caseRow.notes ?? "No notes provided"}`;

  const systemPrompt = `You are VerdictIQ, a specialized legal AI for Indian government compliance. No PDF has been provided. Infer realistic directives based solely on the case metadata.

Extract 5–9 plausible directives a court would typically issue in a case of this nature. Make each directive realistic, legally precise, and specific to the facts provided.

For each directive return:
{ "type", "classification", "sourceText", "pageNumber", "paragraphRef", "deadline", "deadlineInferred", "deadlineSource", "responsibleDepartment", "actionRequired", "isNovel", "confidenceScore" }

For "responsibleDepartment" choose EXACTLY ONE from this canonical list (use "Other / Not Specified" if none fits):
${DEPARTMENT_NAMES.join(" | ")}

Return a JSON object: {"directives": [...]}.`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Analyze this case and generate plausible directives:\n\n${caseContext}` },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  return parseDirectivesResponse(content);
}

/** Full-document chunked extraction. Processes chunks in parallel batches. */
async function extractDirectivesFromFullText(
  caseRow: {
    caseNumber: string;
    court: string;
    bench: string | null;
    benchType: string | null;
    dateOfOrder: string | null;
    petitioner: string | null;
    respondent: string | null;
    governmentRole: string | null;
    notes: string | null;
  },
  fullText: string,
  pageCount: number,
  logger: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void }
): Promise<ExtractedDirective[]> {
  const estimatedPages = pageCount > 0 ? pageCount : Math.ceil(fullText.length / CHARS_PER_PAGE_ESTIMATE);
  const chunks = buildChunks(fullText, estimatedPages);

  const caseContext = `Case: ${caseRow.caseNumber} | Court: ${caseRow.court} | Date: ${caseRow.dateOfOrder ?? "unknown"} | Petitioner: ${caseRow.petitioner ?? "unknown"} | Respondent: ${caseRow.respondent ?? "unknown"} | Notes: ${caseRow.notes ?? "none"}`;

  logger.info(
    { totalChunks: chunks.length, docChars: fullText.length, estimatedPages },
    "Starting chunked extraction"
  );

  const allDirectives: ExtractedDirective[] = [];

  // Process in parallel batches
  for (let i = 0; i < chunks.length; i += CHUNK_BATCH_SIZE) {
    const batch = chunks.slice(i, i + CHUNK_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((chunk) => extractChunk(chunk, caseContext, caseRow.dateOfOrder))
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allDirectives.push(...result.value);
      } else {
        logger.error(
          { batchStart: i, error: String(result.reason), stack: result.reason?.stack?.slice(0, 800) },
          "Chunk extraction error"
        );
      }
    }

    logger.info(
      { batchStart: i, batchSize: batch.length, foundSoFar: allDirectives.length },
      "Chunk batch complete"
    );
  }

  // Deduplicate across all chunks
  const unique = deduplicateDirectives(allDirectives);

  logger.info(
    { total: allDirectives.length, afterDedup: unique.length },
    "Chunked extraction complete"
  );

  return unique;
}

const router = Router();

router.get("/cases", async (req, res) => {
  const parsed = ListCasesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error });
  }
  const { status, court, department, search } = parsed.data;

  const conditions = [];
  if (status) conditions.push(eq(casesTable.status, status));
  if (court) conditions.push(ilike(casesTable.court, `%${court}%`));
  if (search) {
    conditions.push(
      or(
        ilike(casesTable.caseNumber, `%${search}%`),
        ilike(casesTable.petitioner, `%${search}%`),
        ilike(casesTable.respondent, `%${search}%`),
        ilike(casesTable.court, `%${search}%`)
      )!
    );
  }

  const cases = await db
    .select()
    .from(casesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(casesTable.updatedAt));

  const caseIds = cases.map((c) => c.id);

  let directiveCounts: Record<number, { total: number; mandatory: number; advisory: number; verified: number; pending: number }> = {};

  if (caseIds.length > 0) {
    const counts = await db
      .select({
        caseId: directivesTable.caseId,
        total: sql<number>`count(*)::int`,
        mandatory: sql<number>`count(*) filter (where ${directivesTable.classification} = 'mandatory')::int`,
        advisory: sql<number>`count(*) filter (where ${directivesTable.classification} = 'advisory')::int`,
        verified: sql<number>`count(*) filter (where ${directivesTable.verificationStatus} in ('approved','edited'))::int`,
        pending: sql<number>`count(*) filter (where ${directivesTable.verificationStatus} = 'pending')::int`,
      })
      .from(directivesTable)
      .where(sql`${directivesTable.caseId} = ANY(${sql.raw(`ARRAY[${caseIds.join(",")}]`)})`)
      .groupBy(directivesTable.caseId);

    for (const row of counts) {
      directiveCounts[row.caseId] = {
        total: row.total,
        mandatory: row.mandatory,
        advisory: row.advisory,
        verified: row.verified,
        pending: row.pending,
      };
    }
  }

  const result = cases.map((c) => {
    const dc = directiveCounts[c.id] ?? { total: 0, mandatory: 0, advisory: 0, verified: 0, pending: 0 };
    return {
      ...c,
      totalDirectives: dc.total,
      mandatoryCount: dc.mandatory,
      advisoryCount: dc.advisory,
      verifiedCount: dc.verified,
      pendingVerificationCount: dc.pending,
    };
  });

  return res.json(result);
});

router.post("/cases", requireRole(["admin"]), async (req, res) => {
  const parsed = CreateCaseBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error });
  }
  const data = parsed.data;
  const [newCase] = await db
    .insert(casesTable)
    .values({
      caseNumber: data.caseNumber,
      court: data.court,
      bench: data.bench,
      benchType: data.benchType,
      dateOfOrder: data.dateOfOrder ? (data.dateOfOrder as Date).toISOString().split("T")[0] : undefined,
      petitioner: data.petitioner,
      respondent: data.respondent,
      governmentRole: data.governmentRole,
      urgencyLevel: data.urgencyLevel ?? "medium",
      notes: data.notes,
    })
    .returning();

  await db.insert(auditLogTable).values({
    caseId: newCase.id,
    caseNumber: newCase.caseNumber,
    eventType: "case_created",
    description: `Case ${newCase.caseNumber} registered`,
  });

  // Fire-and-forget notification (does not block response)
  notifyCaseUploaded({
    caseId: newCase.id,
    caseNumber: newCase.caseNumber,
    court: newCase.court,
    uploadedBy: req.appUser?.fullName ?? req.appUser?.email ?? "Unknown",
  }).catch(() => {});

  return res.status(201).json({
    ...newCase,
    totalDirectives: 0,
    mandatoryCount: 0,
    advisoryCount: 0,
    verifiedCount: 0,
    pendingVerificationCount: 0,
  });
});

router.get("/cases/:id", async (req, res) => {
  const parsed = GetCaseParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

  const caseRow = await db
    .select()
    .from(casesTable)
    .where(eq(casesTable.id, parsed.data.id))
    .then((r) => r[0]);

  if (!caseRow) return res.status(404).json({ error: "Case not found" });

  const judgment = await db
    .select()
    .from(judgmentsTable)
    .where(eq(judgmentsTable.caseId, caseRow.id))
    .then((r) => r[0] ?? null);

  const directives = await db
    .select()
    .from(directivesTable)
    .where(eq(directivesTable.caseId, caseRow.id))
    .orderBy(asc(directivesTable.pageNumber));

  const actionItems = await db
    .select()
    .from(actionItemsTable)
    .where(eq(actionItemsTable.caseId, caseRow.id))
    .orderBy(desc(actionItemsTable.createdAt));

  const totalDirectives = directives.length;
  const mandatoryCount = directives.filter((d) => d.classification === "mandatory").length;
  const advisoryCount = directives.filter((d) => d.classification === "advisory").length;
  const verifiedCount = directives.filter((d) => ["approved", "edited"].includes(d.verificationStatus)).length;
  const pendingVerificationCount = directives.filter((d) => d.verificationStatus === "pending").length;

  const parsedJudgment = judgment
    ? {
        ...judgment,
        lowConfidencePages: JSON.parse(judgment.lowConfidencePages ?? "[]"),
      }
    : null;

  return res.json({
    ...caseRow,
    totalDirectives,
    mandatoryCount,
    advisoryCount,
    verifiedCount,
    pendingVerificationCount,
    judgment: parsedJudgment,
    directives: directives.map((d) => ({ ...d })),
    actionItems: actionItems.map((a) => ({ ...a })),
  });
});

router.patch("/cases/:id", requireRole(["admin", "department_officer"]), async (req, res) => {
  const paramParsed = UpdateCaseParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) return res.status(400).json({ error: "Invalid id" });

  const bodyParsed = UpdateCaseBody.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: bodyParsed.error });

  const data = bodyParsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.bench !== undefined) updates.bench = data.bench;
  if (data.benchType !== undefined) updates.benchType = data.benchType;
  if (data.dateOfOrder !== undefined) updates.dateOfOrder = data.dateOfOrder ? (data.dateOfOrder as Date).toISOString().split("T")[0] : null;
  if (data.petitioner !== undefined) updates.petitioner = data.petitioner;
  if (data.respondent !== undefined) updates.respondent = data.respondent;
  if (data.governmentRole !== undefined) updates.governmentRole = data.governmentRole;
  if (data.urgencyLevel !== undefined) updates.urgencyLevel = data.urgencyLevel;
  if (data.status !== undefined) updates.status = data.status;
  if (data.notes !== undefined) updates.notes = data.notes;

  const [updated] = await db
    .update(casesTable)
    .set(updates)
    .where(eq(casesTable.id, paramParsed.data.id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Case not found" });

  return res.json({
    ...updated,
    totalDirectives: 0,
    mandatoryCount: 0,
    advisoryCount: 0,
    verifiedCount: 0,
    pendingVerificationCount: 0,
  });
});

router.delete("/cases/:id", requireRole(["admin"]), async (req, res) => {
  const parsed = GetCaseParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

  const caseRow = await db
    .select()
    .from(casesTable)
    .where(eq(casesTable.id, parsed.data.id))
    .then((r) => r[0]);

  if (!caseRow) return res.status(404).json({ error: "Case not found" });

  // Delete in FK-safe order: action_items → directives → audit_log → judgments → case
  await db.delete(actionItemsTable).where(eq(actionItemsTable.caseId, caseRow.id));
  await db.delete(directivesTable).where(eq(directivesTable.caseId, caseRow.id));
  await db.delete(auditLogTable).where(eq(auditLogTable.caseId, caseRow.id));
  await db.delete(judgmentsTable).where(eq(judgmentsTable.caseId, caseRow.id));
  await db.delete(casesTable).where(eq(casesTable.id, caseRow.id));

  req.log.info({ caseId: caseRow.id, caseNumber: caseRow.caseNumber }, "Case deleted");

  return res.json({ success: true, message: `Case ${caseRow.caseNumber} and all related data deleted` });
});

router.post("/cases/:id/process", requireRole(["admin"]), async (req, res) => {
  const parsed = ProcessCaseParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

  const caseRow = await db
    .select()
    .from(casesTable)
    .where(eq(casesTable.id, parsed.data.id))
    .then((r) => r[0]);

  if (!caseRow) return res.status(404).json({ error: "Case not found" });

  await db
    .update(casesTable)
    .set({ status: "processing", processingStartedAt: new Date(), updatedAt: new Date() })
    .where(eq(casesTable.id, caseRow.id));

  // Fetch the stored judgment record — the full text is in rawTextPreview
  let existingJudgment = await db
    .select()
    .from(judgmentsTable)
    .where(eq(judgmentsTable.caseId, caseRow.id))
    .then((r) => r[0]);

  // Determine text source: prefer DB-stored full text over anything passed in the body
  const storedFullText: string = existingJudgment?.rawTextPreview ?? "";
  const storedPageCount: number = existingJudgment?.pageCount ?? 0;
  const hasRealText = storedFullText.trim().length > 500;

  await db.insert(auditLogTable).values({
    caseId: caseRow.id,
    caseNumber: caseRow.caseNumber,
    eventType: "processing_started",
    description: hasRealText
      ? `AI processing started: ${storedPageCount} pages, ${storedFullText.length.toLocaleString()} chars, chunked extraction`
      : `AI processing started (no PDF — metadata-only extraction)`,
    modelVersion: MODEL,
  });

  if (!existingJudgment) {
    const crypto = await import("node:crypto");
    const hash = crypto.createHash("sha256").update(caseRow.caseNumber + Date.now()).digest("hex").slice(0, 16);
    [existingJudgment] = await db
      .insert(judgmentsTable)
      .values({
        caseId: caseRow.id,
        pdfHash: `sha256:${hash}`,
        pageCount: 0,
        isScanned: false,
        overallOcrConfidence: null,
        lowConfidencePages: "[]",
        modelVersion: MODEL,
        rawTextPreview: null,
      })
      .returning()
      .then((r) => r);
  }

  try {
    let extracted: ExtractedDirective[];

    if (hasRealText) {
      // Full-document chunked extraction from the uploaded PDF text
      extracted = await extractDirectivesFromFullText(
        caseRow,
        storedFullText,
        storedPageCount,
        req.log
      );
    } else {
      // No PDF uploaded — fall back to metadata-only inference
      extracted = await extractDirectivesWithAI(caseRow);
    }

    await db.delete(actionItemsTable).where(eq(actionItemsTable.caseId, caseRow.id));
    await db.delete(directivesTable).where(eq(directivesTable.caseId, caseRow.id));

    let inserted = 0;
    for (const d of extracted) {
      // Normalize department to exact canonical name (fuzzy match)
      const department = normalizeDepartment(d.responsibleDepartment);

      // Resolve deadline: accept YYYY-MM-DD or relative expressions ("3 months")
      const resolvedDeadline =
        resolveDeadline(d.deadline, caseRow.dateOfOrder) ??
        resolveDeadline(d.deadlineSource, caseRow.dateOfOrder);
      const deadlineInferred = d.deadlineInferred || (!sanitizeDate(d.deadline) && !!resolvedDeadline);

      // Priority: critical for stays/compliance_orders, else high/medium
      const priority = d.classification === "mandatory"
        ? (d.type === "stay" || d.type === "compliance_order" ? "critical" : "high")
        : "medium";

      const [directive] = await db
        .insert(directivesTable)
        .values({
          caseId: caseRow.id,
          judgmentId: existingJudgment.id,
          type: sanitizeDirectiveType(d.type),
          classification: sanitizeClassification(d.classification),
          sourceText: d.sourceText,
          pageNumber: d.pageNumber,
          paragraphRef: d.paragraphRef ?? null,
          deadline: resolvedDeadline,
          deadlineInferred,
          deadlineSource: d.deadlineSource ?? null,
          responsibleDepartment: department,
          actionRequired: d.actionRequired,
          isNovel: d.isNovel,
          confidenceScore: Math.min(1, Math.max(0, d.confidenceScore)),
          verificationStatus: "pending",
        })
        .returning();

      await db.insert(actionItemsTable).values({
        caseId: caseRow.id,
        directiveId: directive.id,
        title: d.actionRequired.length > 80 ? d.actionRequired.slice(0, 77) + "..." : d.actionRequired,
        description: d.actionRequired,
        department,
        priority,
        classification: d.classification,
        deadline: resolvedDeadline,
        deadlineInferred,
        status: "pending",
        sourcePageNumber: d.pageNumber,
        sourceText: d.sourceText,
      });

      inserted++;
    }

    await db
      .update(casesTable)
      .set({ status: "under_review", processingCompletedAt: new Date(), updatedAt: new Date() })
      .where(eq(casesTable.id, caseRow.id));

    const avgConf =
      extracted.length > 0
        ? (extracted.reduce((s, d) => s + d.confidenceScore, 0) / extracted.length).toFixed(2)
        : "N/A";

    await db.insert(auditLogTable).values({
      caseId: caseRow.id,
      caseNumber: caseRow.caseNumber,
      eventType: "processing_completed",
      description: `${inserted} directives extracted (avg confidence ${avgConf}). ${extracted.filter((d) => d.isNovel).length} flagged for expert review. ${hasRealText ? `Source: full PDF (${storedPageCount} pages, chunked)` : "Source: metadata inference"}`,
      modelVersion: MODEL,
      pdfHash: existingJudgment.pdfHash,
    });

    // Fire-and-forget: notify action plan generated
    const uniqueDepts = [...new Set(extracted.map((d) => d.responsibleDepartment))];
    const mandatoryExtracted = extracted.filter((d) => d.classification === "mandatory");
    notifyActionPlanGenerated({
      caseId: caseRow.id,
      caseNumber: caseRow.caseNumber,
      court: caseRow.court,
      totalItems: inserted,
      mandatoryCount: mandatoryExtracted.length,
      departments: uniqueDepts,
    }).catch(() => {});

    // Notify directive assigned per department (fire-and-forget)
    for (const d of extracted) {
      notifyDirectiveAssigned({
        caseId: caseRow.id,
        caseNumber: caseRow.caseNumber,
        court: caseRow.court,
        directiveId: 0,
        department: d.responsibleDepartment,
        directiveSummary: d.sourceText.slice(0, 200),
        actionRequired: d.actionRequired,
        priority: d.classification === "mandatory"
          ? (d.type === "stay" || d.type === "compliance_order" ? "critical" : "high")
          : "medium",
        deadline: d.deadline,
      }).catch(() => {});
    }

    return res.json({
      caseId: caseRow.id,
      status: "completed",
      message: `${inserted} directives extracted and ready for verification`,
      directivesExtracted: inserted,
    });
  } catch (err: unknown) {
    req.log.error({ err }, "AI extraction failed");

    await db
      .update(casesTable)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(casesTable.id, caseRow.id));

    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      caseId: caseRow.id,
      status: "failed",
      message: `AI extraction failed: ${message}`,
      directivesExtracted: null,
    });
  }
});

router.get("/cases/:id/compliance-timeline", async (req, res) => {
  const parsed = GetComplianceTimelineParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

  const now = new Date();
  const items = await db
    .select()
    .from(actionItemsTable)
    .where(
      and(
        eq(actionItemsTable.caseId, parsed.data.id),
        sql`${actionItemsTable.deadline} IS NOT NULL`
      )
    )
    .orderBy(asc(actionItemsTable.deadline));

  const timeline = items.map((item) => {
    const deadline = item.deadline ? new Date(item.deadline) : null;
    const daysRemaining = deadline
      ? Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return {
      date: item.deadline,
      title: item.title,
      description: item.description,
      type: "compliance_order",
      classification: item.classification,
      department: item.department,
      isInferred: item.deadlineInferred,
      directiveId: item.directiveId,
      daysRemaining,
      isOverdue: daysRemaining !== null && daysRemaining < 0,
    };
  });

  return res.json(timeline);
});

router.get("/cases/:id/judgment-text", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  const judgment = await db
    .select({ rawTextPreview: judgmentsTable.rawTextPreview, pageCount: judgmentsTable.pageCount })
    .from(judgmentsTable)
    .where(eq(judgmentsTable.caseId, id))
    .then((r) => r[0]);

  if (!judgment) return res.status(404).json({ error: "No judgment uploaded yet" });

  return res.json(judgment);
});

export default router;
