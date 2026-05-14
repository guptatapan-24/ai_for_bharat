import { Router } from "express";
import { db, notificationsTable, notificationPreferencesTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { getPreferences } from "../services/notificationService";

const router = Router();

router.get("/notifications", async (req, res) => {
  const userId = req.appUser.id;
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Number(req.query.offset ?? 0);
  const unreadOnly = req.query.unread === "true";
  const type = req.query.type as string | undefined;
  const department = req.query.department as string | undefined;

  const conditions = [eq(notificationsTable.userId, userId)];
  if (unreadOnly) conditions.push(eq(notificationsTable.isRead, false));
  if (type) conditions.push(eq(notificationsTable.type, type as typeof notificationsTable.type.enumValues[number]));
  if (department) conditions.push(eq(notificationsTable.department, department));

  const [notifications, [{ total }]] = await Promise.all([
    db
      .select()
      .from(notificationsTable)
      .where(and(...conditions))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(notificationsTable)
      .where(and(...conditions)),
  ]);

  return res.json({ notifications, total, limit, offset });
});

router.get("/notifications/unread-count", async (req, res) => {
  const userId = req.appUser.id;
  const [{ total }] = await db
    .select({ total: count() })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));
  return res.json({ count: total });
});

router.patch("/notifications/:id/read", async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.appUser.id;

  const [updated] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)))
    .returning();

  if (!updated) return res.status(404).json({ error: "Notification not found" });
  return res.json(updated);
});

router.patch("/notifications/mark-all-read", async (req, res) => {
  const userId = req.appUser.id;
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));
  return res.json({ success: true });
});

router.delete("/notifications/:id", async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.appUser.id;
  await db
    .delete(notificationsTable)
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
  return res.json({ success: true });
});

router.get("/notifications/preferences", async (req, res) => {
  const prefs = await getPreferences(req.appUser.id);
  return res.json({
    ...prefs,
    departmentSubscriptions: JSON.parse(prefs.departmentSubscriptions ?? "[]"),
  });
});

router.patch("/notifications/preferences", async (req, res) => {
  const userId = req.appUser.id;
  const { emailEnabled, inAppEnabled, urgentOnly, departmentSubscriptions } = req.body;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof emailEnabled === "boolean") updates.emailEnabled = emailEnabled;
  if (typeof inAppEnabled === "boolean") updates.inAppEnabled = inAppEnabled;
  if (typeof urgentOnly === "boolean") updates.urgentOnly = urgentOnly;
  if (Array.isArray(departmentSubscriptions)) {
    updates.departmentSubscriptions = JSON.stringify(departmentSubscriptions);
  }

  const existing = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId))
    .then((r) => r[0]);

  let result;
  if (existing) {
    [result] = await db
      .update(notificationPreferencesTable)
      .set(updates)
      .where(eq(notificationPreferencesTable.userId, userId))
      .returning();
  } else {
    [result] = await db
      .insert(notificationPreferencesTable)
      .values({
        userId,
        emailEnabled: emailEnabled ?? true,
        inAppEnabled: inAppEnabled ?? true,
        urgentOnly: urgentOnly ?? false,
        departmentSubscriptions: JSON.stringify(departmentSubscriptions ?? []),
      })
      .returning();
  }

  return res.json({
    ...result,
    departmentSubscriptions: JSON.parse(result.departmentSubscriptions ?? "[]"),
  });
});

export default router;
