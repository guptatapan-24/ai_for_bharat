import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { clerkClient } from "@clerk/express";

export type UserRole = "admin" | "reviewer" | "viewer";

declare global {
  namespace Express {
    interface Request {
      appUser: {
        id: number;
        clerkId: string;
        role: UserRole;
        email: string;
        fullName: string | null;
      };
    }
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

export const ensureUserExists = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const auth = getAuth(req);
  if (!auth?.userId) return next();

  try {
    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, auth.userId))
      .then((r) => r[0]);

    if (existing) {
      req.appUser = {
        id: existing.id,
        clerkId: existing.clerkId,
        role: existing.role as UserRole,
        email: existing.email,
        fullName: existing.fullName ?? null,
      };
      return next();
    }

    const [totalResult] = await db.select({ count: count() }).from(usersTable);
    const isFirst = (totalResult?.count ?? 0) === 0;

    const clerkUser = await clerkClient.users.getUser(auth.userId);
    const email =
      clerkUser.emailAddresses[0]?.emailAddress ?? `${auth.userId}@unknown.local`;
    const fullName = [clerkUser.firstName, clerkUser.lastName]
      .filter(Boolean)
      .join(" ") || null;

    const [newUser] = await db
      .insert(usersTable)
      .values({
        clerkId: auth.userId,
        email,
        fullName,
        role: isFirst ? "admin" : "viewer",
      })
      .returning();

    req.appUser = {
      id: newUser.id,
      clerkId: newUser.clerkId,
      role: newUser.role as UserRole,
      email: newUser.email,
      fullName: newUser.fullName ?? null,
    };

    return next();
  } catch (err) {
    return next(err);
  }
};

export const requireRole = (roles: UserRole[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.appUser || !roles.includes(req.appUser.role)) {
    res.status(403).json({ error: "Forbidden: insufficient role" });
    return;
  }
  next();
};
