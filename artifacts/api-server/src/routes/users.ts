import { Router } from "express";
import { db, usersTable, roleChangeLogTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";
import { UpdateUserRoleBody } from "@workspace/api-zod";

const router = Router();

router.get("/me", (req, res) => {
  return res.json(req.appUser);
});

router.get("/users", requireRole(["admin"]), async (_req, res) => {
  const users = await db
    .select()
    .from(usersTable)
    .orderBy(usersTable.createdAt);
  return res.json(users);
});

router.patch("/users/:clerkId/role", requireRole(["admin"]), async (req, res) => {
  const parsed = UpdateUserRoleBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid role" });

  const target = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, req.params.clerkId))
    .then((r) => r[0]);

  if (!target) return res.status(404).json({ error: "User not found" });

  const [updated] = await db
    .update(usersTable)
    .set({ role: parsed.data.role, updatedAt: new Date() })
    .where(eq(usersTable.clerkId, req.params.clerkId))
    .returning();

  await db.insert(roleChangeLogTable).values({
    actorClerkId: req.appUser.clerkId,
    actorName: req.appUser.fullName ?? req.appUser.email,
    targetClerkId: target.clerkId,
    targetName: target.fullName ?? target.email,
    oldRole: target.role,
    newRole: parsed.data.role,
  });

  return res.json(updated);
});

router.get("/role-change-log", requireRole(["admin"]), async (_req, res) => {
  const rows = await db
    .select()
    .from(roleChangeLogTable)
    .orderBy(desc(roleChangeLogTable.changedAt))
    .limit(50);
  return res.json(rows);
});

export default router;
