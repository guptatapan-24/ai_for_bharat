import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogTable } from "@workspace/db";
import { GetAuditLogQueryParams } from "@workspace/api-zod";
import { eq, and, desc, gte, lte } from "drizzle-orm";

const router = Router();

router.get("/audit-log", async (req, res) => {
  const parsed = GetAuditLogQueryParams.safeParse({
    caseId: req.query.caseId,
    reviewer: req.query.reviewer,
    limit: req.query.limit,
    eventType: req.query.eventType,
  });
  if (!parsed.success) return res.status(400).json({ error: parsed.error });

  const { caseId, reviewer, limit, eventType } = parsed.data;
  const dateFromStr = req.query.dateFrom as string | undefined;
  const dateToStr = req.query.dateTo as string | undefined;
  const conditions = [];

  if (caseId) conditions.push(eq(auditLogTable.caseId, caseId));
  if (reviewer) conditions.push(eq(auditLogTable.reviewerName, reviewer));
  if (eventType) conditions.push(eq(auditLogTable.eventType, eventType as any));
  if (dateFromStr) conditions.push(gte(auditLogTable.timestamp, new Date(dateFromStr)));
  if (dateToStr) {
    const end = new Date(dateToStr);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(auditLogTable.timestamp, end));
  }

  const rows = await db
    .select()
    .from(auditLogTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogTable.timestamp))
    .limit(limit ?? 50);

  return res.json(rows);
});

export default router;
