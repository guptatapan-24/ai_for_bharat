import { db, notificationsTable, notificationPreferencesTable, usersTable, emailLogsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import type { InsertNotification } from "@workspace/db";
import {
  sendEmail,
  buildDirectiveAssignedEmail,
  buildActionPlanEmail,
  buildDeadlineReminderEmail,
  buildEscalationEmail,
} from "./emailService";

export type NotificationType =
  | "case_uploaded"
  | "directive_assigned"
  | "action_plan_generated"
  | "case_status_updated"
  | "deadline_approaching"
  | "escalation_overdue";

export type NotificationPriority = "critical" | "high" | "medium" | "low";

export interface NotifyPayload {
  userId: number;
  caseId?: number;
  directiveId?: number;
  department?: string;
  title: string;
  message: string;
  type: NotificationType;
  priority?: NotificationPriority;
}

export async function createNotification(payload: NotifyPayload): Promise<void> {
  try {
    await db.insert(notificationsTable).values({
      userId: payload.userId,
      caseId: payload.caseId ?? null,
      directiveId: payload.directiveId ?? null,
      department: payload.department ?? null,
      title: payload.title,
      message: payload.message,
      type: payload.type,
      priority: payload.priority ?? "medium",
      isRead: false,
      deliveryStatus: "delivered",
    });
  } catch (err) {
    console.error("[NotificationService] Failed to create notification:", err);
  }
}

export async function getPreferences(userId: number) {
  const prefs = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId))
    .then((r) => r[0]);

  if (!prefs) {
    const [created] = await db
      .insert(notificationPreferencesTable)
      .values({ userId, emailEnabled: true, inAppEnabled: true, urgentOnly: false, departmentSubscriptions: "[]" })
      .returning();
    return created;
  }
  return prefs;
}

async function getAllAdmins(): Promise<typeof usersTable.$inferSelect[]> {
  return db.select().from(usersTable).where(eq(usersTable.role, "admin"));
}

async function getUsersByDepartment(department: string): Promise<typeof usersTable.$inferSelect[]> {
  return db.select().from(usersTable).where(eq(usersTable.role, "department_officer"));
}

async function shouldSendEmail(userId: number, priority: NotificationPriority): Promise<boolean> {
  const prefs = await getPreferences(userId);
  if (!prefs.emailEnabled) return false;
  if (prefs.urgentOnly && priority !== "critical" && priority !== "high") return false;
  return true;
}

export async function notifyCaseUploaded(opts: {
  caseId: number;
  caseNumber: string;
  court: string;
  uploadedBy: string;
}): Promise<void> {
  const admins = await getAllAdmins();

  for (const admin of admins) {
    await createNotification({
      userId: admin.id,
      caseId: opts.caseId,
      title: "New Case Uploaded",
      message: `Case ${opts.caseNumber} from ${opts.court} has been uploaded and is ready for processing.`,
      type: "case_uploaded",
      priority: "medium",
    });

    if (await shouldSendEmail(admin.id, "medium")) {
      await sendEmail({
        to: admin.email,
        subject: `New Case Uploaded: ${opts.caseNumber}`,
        html: buildActionPlanEmail({
          recipientName: admin.fullName ?? admin.email,
          caseNumber: opts.caseNumber,
          court: opts.court,
          totalItems: 0,
          mandatoryCount: 0,
          departments: [],
          caseId: opts.caseId,
        }),
        relatedCaseId: opts.caseId,
      });
    }
  }
}

export async function notifyDirectiveAssigned(opts: {
  caseId: number;
  caseNumber: string;
  court: string;
  directiveId: number;
  department: string;
  directiveSummary: string;
  actionRequired: string;
  priority: NotificationPriority;
  deadline?: string | null;
}): Promise<void> {
  const officers = await getUsersByDepartment(opts.department);
  const admins = await getAllAdmins();
  const allTargets = [...officers, ...admins.filter((a) => !officers.find((o) => o.id === a.id))];

  for (const user of allTargets) {
    const prefs = await getPreferences(user.id);

    if (prefs.inAppEnabled) {
      await createNotification({
        userId: user.id,
        caseId: opts.caseId,
        directiveId: opts.directiveId,
        department: opts.department,
        title: "Directive Assigned",
        message: `${opts.department}: ${opts.actionRequired.slice(0, 120)}`,
        type: "directive_assigned",
        priority: opts.priority,
      });
    }

    if (await shouldSendEmail(user.id, opts.priority)) {
      await sendEmail({
        to: user.email,
        subject: `[${opts.priority.toUpperCase()}] Directive Assigned — ${opts.caseNumber}`,
        html: buildDirectiveAssignedEmail({
          recipientName: user.fullName ?? user.email,
          department: opts.department,
          caseNumber: opts.caseNumber,
          court: opts.court,
          directiveSummary: opts.directiveSummary,
          priority: opts.priority,
          deadline: opts.deadline,
          actionRequired: opts.actionRequired,
          caseId: opts.caseId,
        }),
        relatedCaseId: opts.caseId,
      });
    }
  }
}

export async function notifyActionPlanGenerated(opts: {
  caseId: number;
  caseNumber: string;
  court: string;
  totalItems: number;
  mandatoryCount: number;
  departments: string[];
}): Promise<void> {
  const admins = await getAllAdmins();
  const officers = await getUsersByDepartment("");

  const allTargets = [...admins, ...officers.filter((o) => !admins.find((a) => a.id === o.id))];

  for (const user of allTargets) {
    const prefs = await getPreferences(user.id);

    if (prefs.inAppEnabled) {
      await createNotification({
        userId: user.id,
        caseId: opts.caseId,
        title: "Action Plan Generated",
        message: `Action plan for case ${opts.caseNumber} is ready. ${opts.totalItems} items across ${opts.departments.length} departments.`,
        type: "action_plan_generated",
        priority: "high",
      });
    }

    if (await shouldSendEmail(user.id, "high")) {
      await sendEmail({
        to: user.email,
        subject: `Action Plan Ready — ${opts.caseNumber}`,
        html: buildActionPlanEmail({
          recipientName: user.fullName ?? user.email,
          caseNumber: opts.caseNumber,
          court: opts.court,
          totalItems: opts.totalItems,
          mandatoryCount: opts.mandatoryCount,
          departments: opts.departments,
          caseId: opts.caseId,
        }),
        relatedCaseId: opts.caseId,
      });
    }
  }
}

export async function notifyCaseStatusUpdated(opts: {
  caseId: number;
  caseNumber: string;
  oldStatus: string;
  newStatus: string;
  triggeredByUserId: number;
}): Promise<void> {
  const admins = await getAllAdmins();

  for (const admin of admins) {
    if (admin.id === opts.triggeredByUserId) continue;
    await createNotification({
      userId: admin.id,
      caseId: opts.caseId,
      title: "Case Status Updated",
      message: `Case ${opts.caseNumber} moved from ${opts.oldStatus.replace(/_/g, " ")} to ${opts.newStatus.replace(/_/g, " ")}.`,
      type: "case_status_updated",
      priority: "low",
    });
  }
}

export async function notifyDeadlineApproaching(opts: {
  userId: number;
  caseId: number;
  caseNumber: string;
  court: string;
  title: string;
  department: string;
  deadline: string;
  daysRemaining: number;
  priority: NotificationPriority;
}): Promise<void> {
  await createNotification({
    userId: opts.userId,
    caseId: opts.caseId,
    title: "Deadline Approaching",
    message: `"${opts.title}" — due in ${opts.daysRemaining} day(s) on ${opts.deadline}`,
    type: "deadline_approaching",
    priority: opts.priority,
  });

  if (await shouldSendEmail(opts.userId, opts.priority)) {
    const user = await db.select().from(usersTable).where(eq(usersTable.id, opts.userId)).then((r) => r[0]);
    if (user) {
      await sendEmail({
        to: user.email,
        subject: `Deadline Reminder: ${opts.daysRemaining} day(s) left — ${opts.caseNumber}`,
        html: buildDeadlineReminderEmail({
          recipientName: user.fullName ?? user.email,
          caseNumber: opts.caseNumber,
          court: opts.court,
          title: opts.title,
          department: opts.department,
          deadline: opts.deadline,
          daysRemaining: opts.daysRemaining,
          priority: opts.priority,
        }),
        relatedCaseId: opts.caseId,
      });
    }
  }
}

export async function notifyEscalation(opts: {
  userId: number;
  caseId: number;
  caseNumber: string;
  court: string;
  title: string;
  department: string;
  deadline: string;
  daysOverdue: number;
}): Promise<void> {
  await createNotification({
    userId: opts.userId,
    caseId: opts.caseId,
    title: "Escalation: Overdue Directive",
    message: `"${opts.title}" is ${opts.daysOverdue} day(s) overdue. Immediate action required.`,
    type: "escalation_overdue",
    priority: "critical",
  });

  if (await shouldSendEmail(opts.userId, "critical")) {
    const user = await db.select().from(usersTable).where(eq(usersTable.id, opts.userId)).then((r) => r[0]);
    if (user) {
      await sendEmail({
        to: user.email,
        subject: `[ESCALATION] Overdue Directive — ${opts.caseNumber}`,
        html: buildEscalationEmail({
          recipientName: user.fullName ?? user.email,
          caseNumber: opts.caseNumber,
          court: opts.court,
          title: opts.title,
          department: opts.department,
          deadline: opts.deadline,
          daysOverdue: opts.daysOverdue,
        }),
        relatedCaseId: opts.caseId,
      });
    }
  }
}
