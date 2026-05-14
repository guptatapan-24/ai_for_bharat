import nodemailer from "nodemailer";
import { db, emailLogsTable } from "@workspace/db";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  relatedCaseId?: number;
}

/** Send via Resend REST API — returns true on success */
async function sendViaResend(payload: EmailPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from = process.env.EMAIL_FROM ?? "VerdictIQ <noreply@verdictiq.gov.in>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
  return true;
}

/** Send via nodemailer SMTP — returns true on success */
async function sendViaSmtp(payload: EmailPayload): Promise<boolean> {
  if (!process.env.SMTP_HOST) return false;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@verdictiq.gov.in";
  await transporter.sendMail({ from, to: payload.to, subject: payload.subject, html: payload.html });
  return true;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const hasResend = !!process.env.RESEND_API_KEY;
  const hasSmtp = !!process.env.SMTP_HOST;

  if (!hasResend && !hasSmtp) {
    console.info(`[EmailService] No email provider configured — skipping email to ${payload.to}`);
    await logEmail(payload.to, payload.subject, "skipped", "No email provider configured", payload.relatedCaseId);
    return;
  }

  try {
    // Prefer Resend; fall back to SMTP
    if (hasResend) {
      await sendViaResend(payload);
    } else {
      await sendViaSmtp(payload);
    }
    await logEmail(payload.to, payload.subject, "sent", undefined, payload.relatedCaseId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[EmailService] Failed to send email to ${payload.to}:`, msg);
    await logEmail(payload.to, payload.subject, "failed", msg, payload.relatedCaseId);
  }
}

async function logEmail(
  recipient: string,
  subject: string,
  status: "sent" | "failed" | "skipped",
  providerResponse?: string,
  relatedCaseId?: number,
) {
  try {
    await db.insert(emailLogsTable).values({
      recipient,
      subject,
      status,
      providerResponse: providerResponse ?? null,
      relatedCaseId: relatedCaseId ?? null,
    });
  } catch {
    // Non-fatal
  }
}

const DEPT_COLORS: Record<string, string> = {
  central: "#1e3a5f",
  state: "#2d6a4f",
  enforcement: "#7b2d00",
  other: "#4a4a4a",
};

const DEPT_BADGE_COLORS: Record<string, string> = {
  central: "#dbeafe",
  state: "#d1fae5",
  enforcement: "#fee2e2",
  other: "#f3f4f6",
};

function departmentColor(dept: string): string {
  if (dept.includes("Ministry") || dept.includes("Central")) return DEPT_COLORS.central;
  if (dept.includes("State") || dept.includes("District") || dept.includes("Municipal")) return DEPT_COLORS.state;
  if (dept.includes("CBI") || dept.includes("Enforcement") || dept.includes("Tax") || dept.includes("Court")) return DEPT_COLORS.enforcement;
  return DEPT_COLORS.other;
}

function departmentBadgeBg(dept: string): string {
  if (dept.includes("Ministry") || dept.includes("Central")) return DEPT_BADGE_COLORS.central;
  if (dept.includes("State") || dept.includes("District") || dept.includes("Municipal")) return DEPT_BADGE_COLORS.state;
  if (dept.includes("CBI") || dept.includes("Enforcement") || dept.includes("Tax") || dept.includes("Court")) return DEPT_BADGE_COLORS.enforcement;
  return DEPT_BADGE_COLORS.other;
}

function baseTemplate(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr><td style="background:#1e293b;padding:24px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td><span style="display:inline-block;width:32px;height:32px;background:#f59e0b;border-radius:6px;text-align:center;line-height:32px;font-weight:bold;color:#1e293b;font-size:16px;vertical-align:middle;">V</span>
            <span style="font-size:20px;font-weight:bold;color:#fff;margin-left:10px;vertical-align:middle;font-family:Georgia,serif;">VerdictIQ</span></td>
            <td align="right"><span style="font-size:12px;color:#94a3b8;">Court Compliance Intelligence</span></td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:32px;">${bodyHtml}</td></tr>
      <tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
          VerdictIQ — Government Court Compliance System<br>
          This is an automated notification. Do not reply to this email.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function priorityBadge(priority: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    critical: { bg: "#fee2e2", text: "#991b1b" },
    high: { bg: "#ffedd5", text: "#9a3412" },
    medium: { bg: "#fef3c7", text: "#92400e" },
    low: { bg: "#d1fae5", text: "#065f46" },
  };
  const c = colors[priority] ?? colors.medium;
  return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;background:${c.bg};color:${c.text};">${priority}</span>`;
}

export function buildDirectiveAssignedEmail(opts: {
  recipientName: string;
  department: string;
  caseNumber: string;
  court: string;
  directiveSummary: string;
  priority: string;
  deadline?: string | null;
  actionRequired: string;
  caseId: number;
}): string {
  const deptColor = departmentColor(opts.department);
  const badgeBg = departmentBadgeBg(opts.department);
  const deadlineHtml = opts.deadline
    ? `<tr><td style="padding:8px 12px;font-size:13px;color:#64748b;width:40%;">Deadline</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#dc2626;">${opts.deadline}</td></tr>`
    : "";

  return baseTemplate("New Directive Assigned — VerdictIQ", `
    <h1 style="margin:0 0 8px;font-size:22px;color:#1e293b;font-family:Georgia,serif;">New Directive Assigned</h1>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;">A court directive has been assigned to your department requiring action.</p>

    <div style="background:${badgeBg};border-left:4px solid ${deptColor};border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;font-weight:700;color:${deptColor};text-transform:uppercase;letter-spacing:0.05em;">${opts.department}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
      <tr style="background:#f8fafc;"><td colspan="2" style="padding:10px 12px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Case Information</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;width:40%;">Case Number</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#1e293b;">${opts.caseNumber}</td></tr>
      <tr style="background:#f8fafc;"><td style="padding:8px 12px;font-size:13px;color:#64748b;">Court</td><td style="padding:8px 12px;font-size:13px;color:#1e293b;">${opts.court}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;">Priority</td><td style="padding:8px 12px;">${priorityBadge(opts.priority)}</td></tr>
      ${deadlineHtml}
    </table>

    <div style="background:#fafafa;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Directive Summary</p>
      <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.6;font-style:italic;">"${opts.directiveSummary}"</p>
    </div>

    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.05em;">Action Required</p>
      <p style="margin:0;font-size:14px;color:#78350f;line-height:1.5;">${opts.actionRequired}</p>
    </div>

    <p style="margin:0;font-size:13px;color:#64748b;">Log in to VerdictIQ to review the full directive details and update the action plan status.</p>
  `);
}

export function buildActionPlanEmail(opts: {
  recipientName: string;
  caseNumber: string;
  court: string;
  totalItems: number;
  mandatoryCount: number;
  departments: string[];
  caseId: number;
}): string {
  const deptList = opts.departments
    .map((d) => `<li style="padding:4px 0;font-size:13px;color:#1e293b;">${d}</li>`)
    .join("");

  return baseTemplate("Action Plan Generated — VerdictIQ", `
    <h1 style="margin:0 0 8px;font-size:22px;color:#1e293b;font-family:Georgia,serif;">Action Plan Generated</h1>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;">An action plan has been generated and is ready for departmental execution.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
      <tr style="background:#f8fafc;"><td colspan="2" style="padding:10px 12px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Case Summary</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;width:40%;">Case Number</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#1e293b;">${opts.caseNumber}</td></tr>
      <tr style="background:#f8fafc;"><td style="padding:8px 12px;font-size:13px;color:#64748b;">Court</td><td style="padding:8px 12px;font-size:13px;color:#1e293b;">${opts.court}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;">Total Action Items</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#1e293b;">${opts.totalItems}</td></tr>
      <tr style="background:#f8fafc;"><td style="padding:8px 12px;font-size:13px;color:#64748b;">Mandatory Items</td><td style="padding:8px 12px;"><span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;">${opts.mandatoryCount}</span></td></tr>
    </table>

    <div style="margin-bottom:24px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#374151;">Departments Assigned</p>
      <ul style="margin:0;padding-left:20px;">${deptList}</ul>
    </div>

    <p style="margin:0;font-size:13px;color:#64748b;">Log in to VerdictIQ to view the full action plan and assign tasks to officers.</p>
  `);
}

export function buildDeadlineReminderEmail(opts: {
  recipientName: string;
  caseNumber: string;
  court: string;
  title: string;
  department: string;
  deadline: string;
  daysRemaining: number;
  priority: string;
}): string {
  const urgencyColor = opts.daysRemaining <= 3 ? "#dc2626" : opts.daysRemaining <= 7 ? "#d97706" : "#2563eb";
  return baseTemplate("Deadline Reminder — VerdictIQ", `
    <h1 style="margin:0 0 8px;font-size:22px;color:#1e293b;font-family:Georgia,serif;">Deadline Approaching</h1>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;">A compliance deadline requires your attention.</p>

    <div style="background:#fff7ed;border:2px solid ${urgencyColor};border-radius:8px;padding:20px;margin-bottom:24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:36px;font-weight:800;color:${urgencyColor};">${opts.daysRemaining}</p>
      <p style="margin:0;font-size:14px;color:#92400e;font-weight:600;">days remaining</p>
      <p style="margin:6px 0 0;font-size:13px;color:#78350f;">Due: ${opts.deadline}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;width:40%;">Action Item</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#1e293b;">${opts.title}</td></tr>
      <tr style="background:#f8fafc;"><td style="padding:8px 12px;font-size:13px;color:#64748b;">Case</td><td style="padding:8px 12px;font-size:13px;color:#1e293b;">${opts.caseNumber}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;">Department</td><td style="padding:8px 12px;font-size:13px;color:#1e293b;">${opts.department}</td></tr>
      <tr style="background:#f8fafc;"><td style="padding:8px 12px;font-size:13px;color:#64748b;">Priority</td><td style="padding:8px 12px;">${priorityBadge(opts.priority)}</td></tr>
    </table>

    <p style="margin:0;font-size:13px;color:#64748b;">Log in to VerdictIQ immediately to update the status and prevent escalation.</p>
  `);
}

export function buildEscalationEmail(opts: {
  recipientName: string;
  caseNumber: string;
  court: string;
  title: string;
  department: string;
  deadline: string;
  daysOverdue: number;
}): string {
  return baseTemplate("Escalation Alert — VerdictIQ", `
    <div style="background:#fef2f2;border:2px solid #dc2626;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;font-weight:700;color:#991b1b;">⚠ ESCALATION ALERT — Overdue Compliance Directive</p>
    </div>

    <h1 style="margin:0 0 8px;font-size:22px;color:#1e293b;font-family:Georgia,serif;">Overdue Directive</h1>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;">A compliance directive has passed its deadline without resolution.</p>

    <div style="background:#fef2f2;border-radius:8px;padding:20px;margin-bottom:24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:36px;font-weight:800;color:#dc2626;">${opts.daysOverdue}</p>
      <p style="margin:0;font-size:14px;color:#991b1b;font-weight:600;">days overdue</p>
      <p style="margin:6px 0 0;font-size:13px;color:#7f1d1d;">Deadline was: ${opts.deadline}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #fecaca;border-radius:8px;margin-bottom:24px;">
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;width:40%;">Action Item</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#1e293b;">${opts.title}</td></tr>
      <tr style="background:#fef2f2;"><td style="padding:8px 12px;font-size:13px;color:#64748b;">Case</td><td style="padding:8px 12px;font-size:13px;color:#1e293b;">${opts.caseNumber}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;">Department</td><td style="padding:8px 12px;font-size:13px;color:#1e293b;">${opts.department}</td></tr>
    </table>

    <p style="margin:0;font-size:13px;color:#64748b;">Immediate action is required. Log in to VerdictIQ to resolve this overdue directive.</p>
  `);
}

export function buildOtpEmail(opts: { otp: string; email: string }): string {
  return baseTemplate("Verification Code — VerdictIQ", `
    <h1 style="margin:0 0 8px;font-size:22px;color:#1e293b;font-family:Georgia,serif;">Your Verification Code</h1>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;">Use this code to verify your identity. It expires in 5 minutes.</p>

    <div style="background:#f8fafc;border:2px dashed #e2e8f0;border-radius:12px;padding:32px;text-align:center;margin-bottom:24px;">
      <p style="margin:0;font-size:48px;font-weight:800;color:#1e293b;letter-spacing:0.3em;font-family:monospace;">${opts.otp}</p>
    </div>

    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:14px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#92400e;"><strong>Security Notice:</strong> Never share this code with anyone. VerdictIQ will never ask for your OTP via phone or chat. If you did not request this code, ignore this email.</p>
    </div>

    <p style="margin:0;font-size:12px;color:#94a3b8;">This code expires in 5 minutes and can only be used once.</p>
  `);
}

export function buildLoginAlertEmail(opts: { name: string; email: string; timestamp: string }): string {
  return baseTemplate("Login Alert — VerdictIQ", `
    <h1 style="margin:0 0 8px;font-size:22px;color:#1e293b;font-family:Georgia,serif;">New Login Detected</h1>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;">A new login was recorded for your VerdictIQ account.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
      <tr><td style="padding:8px 12px;font-size:13px;color:#64748b;width:40%;">Account</td><td style="padding:8px 12px;font-size:13px;color:#1e293b;">${opts.email}</td></tr>
      <tr style="background:#f8fafc;"><td style="padding:8px 12px;font-size:13px;color:#64748b;">Time</td><td style="padding:8px 12px;font-size:13px;color:#1e293b;">${opts.timestamp}</td></tr>
    </table>

    <p style="margin:0;font-size:13px;color:#64748b;">If this was not you, contact your administrator immediately.</p>
  `);
}
