import { createHash, randomInt } from "crypto";
import { db, otpVerificationsTable } from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";
import { sendEmail, buildOtpEmail } from "./emailService";

const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_SEND_PER_MINUTE = 3;

const recentSends = new Map<string, number[]>();

function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

function checkRateLimit(email: string): boolean {
  const now = Date.now();
  const times = (recentSends.get(email) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (times.length >= MAX_SEND_PER_MINUTE) return false;
  times.push(now);
  recentSends.set(email, times);
  return true;
}

async function purgeExpired(): Promise<void> {
  try {
    await db.delete(otpVerificationsTable).where(lt(otpVerificationsTable.expiresAt, new Date()));
  } catch {}
}

export async function sendOtp(email: string): Promise<{ success: boolean; message: string }> {
  if (!checkRateLimit(email)) {
    return { success: false, message: "Too many OTP requests. Please wait before trying again." };
  }

  await purgeExpired();

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await db
    .delete(otpVerificationsTable)
    .where(eq(otpVerificationsTable.email, email));

  await db.insert(otpVerificationsTable).values({
    email,
    otpHash,
    expiresAt,
    attempts: 0,
    verified: false,
  });

  await sendEmail({
    to: email,
    subject: "Your VerdictIQ Verification Code",
    html: buildOtpEmail({ otp, email }),
  });

  return { success: true, message: "OTP sent successfully." };
}

export async function verifyOtp(
  email: string,
  otp: string,
): Promise<{ success: boolean; message: string }> {
  await purgeExpired();

  const record = await db
    .select()
    .from(otpVerificationsTable)
    .where(
      and(
        eq(otpVerificationsTable.email, email),
        eq(otpVerificationsTable.verified, false),
      ),
    )
    .orderBy(otpVerificationsTable.createdAt)
    .then((r) => r[r.length - 1]);

  if (!record) {
    return { success: false, message: "No active OTP found. Please request a new one." };
  }

  if (record.expiresAt < new Date()) {
    await db.delete(otpVerificationsTable).where(eq(otpVerificationsTable.id, record.id));
    return { success: false, message: "OTP has expired. Please request a new one." };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await db.delete(otpVerificationsTable).where(eq(otpVerificationsTable.id, record.id));
    return { success: false, message: "Too many failed attempts. Please request a new OTP." };
  }

  const inputHash = hashOtp(otp.trim());

  if (inputHash !== record.otpHash) {
    await db
      .update(otpVerificationsTable)
      .set({ attempts: record.attempts + 1 })
      .where(eq(otpVerificationsTable.id, record.id));
    const remaining = MAX_ATTEMPTS - record.attempts - 1;
    return {
      success: false,
      message: `Invalid OTP. ${remaining} attempt(s) remaining.`,
    };
  }

  await db
    .update(otpVerificationsTable)
    .set({ verified: true })
    .where(eq(otpVerificationsTable.id, record.id));

  return { success: true, message: "OTP verified successfully." };
}
