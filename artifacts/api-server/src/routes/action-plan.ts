import { Router } from "express";
import { db } from "@workspace/db";
import { actionItemsTable, auditLogTable, casesTable } from "@workspace/db";
import {
  GetActionPlanParams,
  UpdateActionItemParams,
  UpdateActionItemBody,
} from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/cases/:id/action-plan", async (req, res) => {
  const parsed = GetActionPlanParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

  const items = await db
    .select()
    .from(actionItemsTable)
    .where(eq(actionItemsTable.caseId, parsed.data.id))
    .orderBy(actionItemsTable.deadline);

  return res.json(items);
});

router.patch("/cases/:id/action-plan/:itemId", async (req, res) => {
  const paramParsed = UpdateActionItemParams.safeParse({
    id: Number(req.params.id),
    itemId: Number(req.params.itemId),
  });
  if (!paramParsed.success) return res.status(400).json({ error: "Invalid params" });

  const bodyParsed = UpdateActionItemBody.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: bodyParsed.error });

  const { status, notes, deadline } = bodyParsed.data;
  const updates: Record<string, unknown> = {};
  if (status !== undefined) {
    updates.status = status;
    if (status === "completed") updates.completedAt = new Date();
  }
  if (notes !== undefined) updates.notes = notes;
  if (deadline !== undefined) updates.deadline = deadline ? String(deadline) : null;

  const [updated] = await db
    .update(actionItemsTable)
    .set(updates)
    .where(
      and(
        eq(actionItemsTable.id, paramParsed.data.itemId),
        eq(actionItemsTable.caseId, paramParsed.data.id)
      )
    )
    .returning();

  if (!updated) return res.status(404).json({ error: "Action item not found" });

  const caseRow = await db
    .select({ caseNumber: casesTable.caseNumber })
    .from(casesTable)
    .where(eq(casesTable.id, paramParsed.data.id))
    .then((r) => r[0]);

  await db.insert(auditLogTable).values({
    caseId: paramParsed.data.id,
    caseNumber: caseRow?.caseNumber ?? "",
    eventType: "action_item_updated",
    description: `Action item "${updated.title}" status updated to ${updated.status}`,
  });

  return res.json(updated);
});

export default router;
