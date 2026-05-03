import { Router } from "express";
import { db } from "@workspace/db";
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

const MODEL = "gpt-5.4";

// How many chars roughly correspond to one page in a dense Indian judgment
const CHARS_PER_PAGE_ESTIMATE = 2000;
const CHUNK_SIZE = 6000;
const CHUNK_OVERLAP = 600;
const MAX_CHUNKS = 50;
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

/** Split full judgment text into overlapping chunks.
 *  Strategy for Indian court judgments:
 *  - Last 40% (operative part): 65% of chunk budget, evenly spaced
 *  - First 60% (facts + analysis): 35% of chunk budget, evenly spaced
 *
 *  This guarantees both sections get meaningful AI coverage regardless of
 *  document length — avoiding the failure mode where a very long tail fills the
 *  entire budget and the first 60% of the judgment gets no coverage.
 */
function buildChunks(fullText: string, pageCount: number): Chunk[] {
  const textLen = fullText.length;

  if (textLen <= CHUNK_SIZE * 1.5) {
    return [{ text: fullText, estStartPage: 1, estEndPage: Math.max(pageCount, 1), index: 0 }];
  }

  const tailBudget = Math.floor(MAX_CHUNKS * 0.65); // ~32 chunks for last 40%
  const headBudget = MAX_CHUNKS - tailBudget;        // ~18 chunks for first 60%

  const tailCutoff = Math.floor(textLen * 0.60);
  const tailText = fullText.slice(tailCutoff);
  const headText = fullText.slice(0, tailCutoff);

  const makeChunk = (slice: string, charOffset: number, idx: number): Chunk | null => {
    if (slice.trim().length < 300) return null;
    const startRatio = charOffset / textLen;
    const endRatio = Math.min(1, (charOffset + CHUNK_SIZE) / textLen);
    return {
      text: slice,
      estStartPage: Math.max(1, Math.round(startRatio * pageCount)),
      estEndPage: Math.min(pageCount, Math.round(endRatio * pageCount) + 1),
      index: idx,
    };
  };

  const chunks: Chunk[] = [];

  // Tail: evenly-sampled positions within last 40%
  const tailStep = Math.max(CHUNK_SIZE - CHUNK_OVERLAP, Math.ceil(tailText.length / tailBudget));
  for (let i = 0; i < tailText.length && chunks.length < tailBudget; i += tailStep) {
    const c = makeChunk(tailText.slice(i, i + CHUNK_SIZE), tailCutoff + i, chunks.length);
    if (c) chunks.push(c);
  }

  // Head: evenly-sampled positions within first 60%
  const headStep = Math.max(CHUNK_SIZE - CHUNK_OVERLAP, Math.ceil(headText.length / headBudget));
  const headChunks: Chunk[] = [];
  for (let i = 0; i < headText.length && headChunks.length < headBudget; i += headStep) {
    const c = makeChunk(headText.slice(i, i + CHUNK_SIZE), i, headChunks.length);
    if (c) headChunks.push(c);
  }

  // Combine: tail first (highest directive density), then head
  const all = [...chunks, ...headChunks].slice(0, MAX_CHUNKS);
  // Re-index
  all.forEach((c, i) => { c.index = i; });
  return all;
}

/** Deduplicate directives — two are considered the same if their sourceTexts
 *  share >70% of significant words (length > 3). */
function deduplicateDirectives(directives: ExtractedDirective[]): ExtractedDirective[] {
  const sig = (s: string) =>
    new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length > 3));

  const unique: ExtractedDirective[] = [];
  for (const d of directives) {
    const wordsD = sig(d.sourceText);
    const isDup = unique.some((u) => {
      const wordsU = sig(u.sourceText);
      const smaller = Math.min(wordsD.size, wordsU.size);
      if (smaller === 0) return false;
      let overlap = 0;
      for (const w of wordsD) if (wordsU.has(w)) overlap++;
      return overlap / smaller > 0.7;
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
  const systemPrompt = `You are VerdictIQ, a specialized legal AI for Indian government compliance. You are given a SINGLE EXCERPT from a larger court judgment. Your task is to extract every court-ordered directive, compliance obligation, stay order, deadline, and direction found in this excerpt.

IMPORTANT RULES:
- Only extract actual court orders and directions — not arguments of counsel, factual recitals, or pure observations.
- Look for operative language: "is directed to", "shall", "is ordered to", "we direct", "we order", "ORDERED THAT", "In the result", "Accordingly", "is required to", "must comply".
- If this excerpt contains NO directives, return {"directives": []}.
- Do NOT invent directives not present in this excerpt.
- Source text must be verbatim from the excerpt.
- Page numbers: use the provided start/end page range as context.

For each directive found, return:
{
  "type": "compliance_order" | "stay" | "direction" | "limitation_period" | "appeal" | "observation" | "other",
  "classification": "mandatory" | "advisory",
  "sourceText": "<verbatim text from excerpt>",
  "pageNumber": <integer within provided range>,
  "paragraphRef": "<e.g. Para 12>" | null,
  "deadline": "<YYYY-MM-DD>" | null,
  "deadlineInferred": true | false,
  "deadlineSource": "<how determined>" | null,
  "responsibleDepartment": "<specific Indian govt department/authority>",
  "actionRequired": "<one sentence imperative>",
  "isNovel": true | false,
  "confidenceScore": 0.0-1.0
}

Return {"directives": [...]} — may be empty.`;

  const userPrompt = `CASE CONTEXT:
${caseContext}

DOCUMENT EXCERPT (pages ${chunk.estStartPage}–${chunk.estEndPage}):
${chunk.text}`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 4096,
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

Return {"directives": [...]}.`;

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
  logger: { info: (obj: object, msg: string) => void }
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

router.post("/cases", async (req, res) => {
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

router.patch("/cases/:id", async (req, res) => {
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

router.delete("/cases/:id", async (req, res) => {
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

router.post("/cases/:id/process", async (req, res) => {
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

    await db.delete(directivesTable).where(eq(directivesTable.caseId, caseRow.id));
    await db.delete(actionItemsTable).where(eq(actionItemsTable.caseId, caseRow.id));

    let inserted = 0;
    for (const d of extracted) {
      const [directive] = await db
        .insert(directivesTable)
        .values({
          caseId: caseRow.id,
          judgmentId: existingJudgment.id,
          type: d.type,
          classification: d.classification,
          sourceText: d.sourceText,
          pageNumber: d.pageNumber,
          paragraphRef: d.paragraphRef ?? null,
          deadline: d.deadline ? d.deadline.split("T")[0] : null,
          deadlineInferred: d.deadlineInferred,
          deadlineSource: d.deadlineSource ?? null,
          responsibleDepartment: d.responsibleDepartment,
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
        department: d.responsibleDepartment,
        priority: d.classification === "mandatory"
          ? (d.type === "stay" || d.type === "compliance_order" ? "critical" : "high")
          : "medium",
        classification: d.classification,
        deadline: d.deadline ? d.deadline.split("T")[0] : null,
        deadlineInferred: d.deadlineInferred,
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

export default router;
