import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogTable, casesTable } from "@workspace/db";
import { GetAuditLogQueryParams } from "@workspace/api-zod";
import { eq, and, desc, sql } from "drizzle-orm";

const router = Router();

router.get("/audit-log", async (req, res) => {
  const parsed = GetAuditLogQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error });

  const { caseId, reviewer, limit } = parsed.data;
  const conditions = [];

  if (caseId) conditions.push(eq(auditLogTable.caseId, caseId));
  if (reviewer) conditions.push(eq(auditLogTable.reviewerName, reviewer));

  const rows = await db
    .select()
    .from(auditLogTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogTable.timestamp))
    .limit(limit ?? 50);

  return res.json(rows);
});

export default router;
