import { Router } from "express";
import { db } from "@workspace/db";
import { directivesTable, auditLogTable, casesTable } from "@workspace/db";
import {
  ListDirectivesParams,
  ListDirectivesQueryParams,
  GetDirectiveParams,
  VerifyDirectiveParams,
  VerifyDirectiveBody,
} from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";

const router = Router();

router.get("/cases/:id/directives", async (req, res) => {
  const paramParsed = ListDirectivesParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) return res.status(400).json({ error: "Invalid id" });

  const queryParsed = ListDirectivesQueryParams.safeParse(req.query);
  if (!queryParsed.success) return res.status(400).json({ error: queryParsed.error });

  const { classification, type } = queryParsed.data;
  const conditions: ReturnType<typeof eq>[] = [eq(directivesTable.caseId, paramParsed.data.id)];

  if (classification && classification !== "all") {
    conditions.push(eq(directivesTable.classification, classification as "mandatory" | "advisory" | "unknown"));
  }
  if (type) {
    conditions.push(eq(directivesTable.type, type as "compliance_order" | "stay" | "direction" | "limitation_period" | "appeal" | "observation" | "other"));
  }

  const directives = await db
    .select()
    .from(directivesTable)
    .where(and(...conditions))
    .orderBy(directivesTable.pageNumber);

  return res.json(directives);
});

router.get("/cases/:id/directives/:directiveId", async (req, res) => {
  const parsed = GetDirectiveParams.safeParse({
    id: Number(req.params.id),
    directiveId: Number(req.params.directiveId),
  });
  if (!parsed.success) return res.status(400).json({ error: "Invalid params" });

  const directive = await db
    .select()
    .from(directivesTable)
    .where(
      and(
        eq(directivesTable.caseId, parsed.data.id),
        eq(directivesTable.id, parsed.data.directiveId)
      )
    )
    .then((r) => r[0]);

  if (!directive) return res.status(404).json({ error: "Directive not found" });

  return res.json(directive);
});

router.post("/cases/:id/directives/:directiveId/verify", requireRole(["admin", "reviewer"]), async (req, res) => {
  const paramParsed = VerifyDirectiveParams.safeParse({
    id: Number(req.params.id),
    directiveId: Number(req.params.directiveId),
  });
  if (!paramParsed.success) return res.status(400).json({ error: "Invalid params" });

  const bodyParsed = VerifyDirectiveBody.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: bodyParsed.error });

  const { decision, correctedValue, correctedClassification, correctedDeadline, correctedDepartment, reason, reviewerName } = bodyParsed.data;

  const existing = await db
    .select()
    .from(directivesTable)
    .where(
      and(
        eq(directivesTable.caseId, paramParsed.data.id),
        eq(directivesTable.id, paramParsed.data.directiveId)
      )
    )
    .then((r) => r[0]);

  if (!existing) return res.status(404).json({ error: "Directive not found" });

  const updates: Partial<typeof directivesTable.$inferSelect> & Record<string, unknown> = {
    verificationStatus: decision as "approved" | "edited" | "rejected",
    reviewerName,
    reviewedAt: new Date(),
  };

  if (decision === "edited") {
    updates.reviewerCorrection = correctedValue ?? null;
    updates.reviewerReason = reason ?? null;
    if (correctedClassification) updates.classification = correctedClassification;
    if (correctedDeadline) updates.deadline = String(correctedDeadline);
    if (correctedDepartment) updates.responsibleDepartment = correctedDepartment;
  } else if (decision === "rejected") {
    updates.reviewerReason = reason ?? null;
  }

  const [updated] = await db
    .update(directivesTable)
    .set(updates)
    .where(eq(directivesTable.id, paramParsed.data.directiveId))
    .returning();

  const caseRow = await db
    .select({ caseNumber: casesTable.caseNumber })
    .from(casesTable)
    .where(eq(casesTable.id, paramParsed.data.id))
    .then((r) => r[0]);

  const eventTypeMap: Record<string, "directive_verified" | "directive_edited" | "directive_rejected"> = {
    approved: "directive_verified",
    edited: "directive_edited",
    rejected: "directive_rejected",
  };

  await db.insert(auditLogTable).values({
    caseId: paramParsed.data.id,
    caseNumber: caseRow?.caseNumber ?? "",
    directiveId: paramParsed.data.directiveId,
    eventType: eventTypeMap[decision] ?? "directive_verified",
    extractedValue: existing.actionRequired,
    confidenceScore: existing.confidenceScore,
    reviewerName,
    reviewerDecision: decision,
    correctedValue: correctedValue ?? null,
    statedReason: reason ?? null,
    modelVersion: "gpt-4o",
    description: `Directive on page ${existing.pageNumber} ${decision} by ${reviewerName}`,
  });

  return res.json(updated);
});

export default router;
