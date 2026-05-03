import { Router } from "express";
import { db, caseCommentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/cases/:id/comments", async (req, res) => {
  const caseId = Number(req.params.id);
  if (!caseId) return res.status(400).json({ error: "Invalid case id" });

  const comments = await db
    .select()
    .from(caseCommentsTable)
    .where(eq(caseCommentsTable.caseId, caseId))
    .orderBy(desc(caseCommentsTable.createdAt));

  return res.json(comments);
});

router.post("/cases/:id/comments", async (req, res) => {
  const caseId = Number(req.params.id);
  if (!caseId) return res.status(400).json({ error: "Invalid case id" });

  const content: string | undefined = req.body?.content;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: "Content is required" });
  }

  const appUser = req.appUser;
  const [comment] = await db
    .insert(caseCommentsTable)
    .values({
      caseId,
      authorName: appUser.fullName ?? appUser.email,
      authorRole: appUser.role,
      content: content.trim(),
    })
    .returning();

  return res.status(201).json(comment);
});

export default router;
