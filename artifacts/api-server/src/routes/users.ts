import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

  const [updated] = await db
    .update(usersTable)
    .set({ role: parsed.data.role, updatedAt: new Date() })
    .where(eq(usersTable.clerkId, req.params.clerkId))
    .returning();

  if (!updated) return res.status(404).json({ error: "User not found" });
  return res.json(updated);
});

export default router;
