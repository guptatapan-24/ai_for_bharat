import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { userRoleEnum } from "./users";

export const roleChangeLogTable = pgTable("role_change_log", {
  id: serial("id").primaryKey(),
  actorClerkId: text("actor_clerk_id").notNull(),
  actorName: text("actor_name"),
  targetClerkId: text("target_clerk_id").notNull(),
  targetName: text("target_name"),
  oldRole: userRoleEnum("old_role").notNull(),
  newRole: userRoleEnum("new_role").notNull(),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
});
