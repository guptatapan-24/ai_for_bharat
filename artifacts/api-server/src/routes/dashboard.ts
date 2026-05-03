import { Router } from "express";
import { db } from "@workspace/db";
import { casesTable, directivesTable, actionItemsTable, auditLogTable } from "@workspace/db";
import { sql, desc } from "drizzle-orm";

const router = Router();

router.get("/dashboard/summary", async (req, res) => {
  const now = new Date().toISOString().split("T")[0];

  const [caseStats] = await db
    .select({
      totalCases: sql<number>`count(*)::int`,
      casesUnderReview: sql<number>`count(*) filter (where ${casesTable.status} = 'under_review')::int`,
      casesVerified: sql<number>`count(*) filter (where ${casesTable.status} = 'verified')::int`,
    })
    .from(casesTable);

  const [directiveStats] = await db
    .select({
      pendingVerifications: sql<number>`count(*) filter (where ${directivesTable.verificationStatus} = 'pending')::int`,
      mandatoryDirectivesTotal: sql<number>`count(*) filter (where ${directivesTable.classification} = 'mandatory')::int`,
      advisoryDirectivesTotal: sql<number>`count(*) filter (where ${directivesTable.classification} = 'advisory')::int`,
    })
    .from(directivesTable);

  const [actionStats] = await db
    .select({
      totalActionItems: sql<number>`count(*)::int`,
      overdueItems: sql<number>`count(*) filter (where ${actionItemsTable.deadline} < ${now} and ${actionItemsTable.status} != 'completed')::int`,
      criticalItems: sql<number>`count(*) filter (where ${actionItemsTable.priority} = 'critical' and ${actionItemsTable.status} != 'completed')::int`,
    })
    .from(actionItemsTable);

  const processingTimes = await db
    .select({
      started: casesTable.processingStartedAt,
      completed: casesTable.processingCompletedAt,
    })
    .from(casesTable)
    .where(sql`${casesTable.processingStartedAt} is not null and ${casesTable.processingCompletedAt} is not null`);

  const avgMinutes =
    processingTimes.length > 0
      ? processingTimes.reduce((sum, r) => {
          const diff =
            new Date(r.completed!).getTime() - new Date(r.started!).getTime();
          return sum + diff / 60000;
        }, 0) / processingTimes.length
      : null;

  return res.json({
    totalCases: caseStats?.totalCases ?? 0,
    casesUnderReview: caseStats?.casesUnderReview ?? 0,
    casesVerified: caseStats?.casesVerified ?? 0,
    totalActionItems: actionStats?.totalActionItems ?? 0,
    pendingVerifications: directiveStats?.pendingVerifications ?? 0,
    overdueItems: actionStats?.overdueItems ?? 0,
    criticalItems: actionStats?.criticalItems ?? 0,
    avgProcessingMinutes: avgMinutes,
    mandatoryDirectivesTotal: directiveStats?.mandatoryDirectivesTotal ?? 0,
    advisoryDirectivesTotal: directiveStats?.advisoryDirectivesTotal ?? 0,
  });
});

router.get("/dashboard/urgent", async (req, res) => {
  const now = new Date().toISOString().split("T")[0];

  const items = await db
    .select({
      id: actionItemsTable.id,
      caseId: actionItemsTable.caseId,
      caseNumber: casesTable.caseNumber,
      court: casesTable.court,
      title: actionItemsTable.title,
      department: actionItemsTable.department,
      deadline: actionItemsTable.deadline,
      classification: actionItemsTable.classification,
      priority: actionItemsTable.priority,
    })
    .from(actionItemsTable)
    .innerJoin(casesTable, sql`${actionItemsTable.caseId} = ${casesTable.id}`)
    .where(
      sql`${actionItemsTable.deadline} is not null and ${actionItemsTable.status} != 'completed' and ${actionItemsTable.deadline} <= (current_date + interval '30 days')`
    )
    .orderBy(actionItemsTable.deadline)
    .limit(20);

  const result = items.map((item) => {
    const deadline = item.deadline ? new Date(item.deadline) : null;
    const daysRemaining = deadline
      ? Math.ceil((deadline.getTime() - new Date(now).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    return {
      actionItemId: item.id,
      caseId: item.caseId,
      caseNumber: item.caseNumber,
      court: item.court,
      title: item.title,
      department: item.department,
      deadline: item.deadline!,
      daysRemaining,
      isOverdue: daysRemaining < 0,
      classification: item.classification as "mandatory" | "advisory",
      priority: item.priority as "critical" | "high" | "medium" | "low",
    };
  });

  return res.json(result);
});

router.get("/dashboard/department-workload", async (req, res) => {
  const now = new Date().toISOString().split("T")[0];

  const rows = await db
    .select({
      department: actionItemsTable.department,
      totalItems: sql<number>`count(*)::int`,
      pendingItems: sql<number>`count(*) filter (where ${actionItemsTable.status} in ('pending','in_progress'))::int`,
      overdueItems: sql<number>`count(*) filter (where ${actionItemsTable.deadline} < ${now} and ${actionItemsTable.status} != 'completed')::int`,
      completedItems: sql<number>`count(*) filter (where ${actionItemsTable.status} = 'completed')::int`,
      mandatoryCount: sql<number>`count(*) filter (where ${actionItemsTable.classification} = 'mandatory')::int`,
      advisoryCount: sql<number>`count(*) filter (where ${actionItemsTable.classification} = 'advisory')::int`,
    })
    .from(actionItemsTable)
    .groupBy(actionItemsTable.department)
    .orderBy(sql`count(*) desc`);

  return res.json(rows);
});

router.get("/dashboard/recent-activity", async (req, res) => {
  const rows = await db
    .select()
    .from(auditLogTable)
    .orderBy(desc(auditLogTable.timestamp))
    .limit(20);

  const result = rows.map((r) => ({
    id: r.id,
    type: r.eventType as string,
    caseId: r.caseId,
    caseNumber: r.caseNumber,
    description: r.description ?? r.eventType,
    reviewer: r.reviewerName ?? null,
    timestamp: r.timestamp,
  }));

  return res.json(result);
});

export default router;
