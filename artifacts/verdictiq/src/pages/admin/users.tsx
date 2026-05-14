import { useListUsers, useUpdateUserRole, getListUsersQueryKey, useListRoleChanges, getListRoleChangesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUserRole } from "@/contexts/UserRoleContext";
import { Redirect } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Users, Shield, Eye, Edit3, History, ArrowRight } from "lucide-react";
import type { UserRole } from "@/contexts/UserRoleContext";

const ROLE_META: Record<UserRole, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  admin: { label: "Admin", icon: Shield },
  department_officer: { label: "Department Officer", icon: Edit3 },
  viewer: { label: "Viewer", icon: Eye },
};

export default function AdminUsers() {
  const { isAdmin, isLoaded, clerkId: currentClerkId } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useListUsers({
    query: { queryKey: getListUsersQueryKey(), enabled: isLoaded && isAdmin },
  });

  const { data: roleChanges, isLoading: isRoleChangesLoading } = useListRoleChanges({
    query: { queryKey: getListRoleChangesQueryKey(), enabled: isLoaded && isAdmin },
  });

  const { mutate: updateRole, isPending } = useUpdateUserRole({
    mutation: {
      onSuccess: () => {
        toast({ title: "Role updated" });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["role-change-log"] });
      },
      onError: () => {
        toast({ title: "Update failed", variant: "destructive" });
      },
    },
  });

  if (isLoaded && !isAdmin) return <Redirect to="/dashboard" />;

  return (
    <div className="p-8 max-w-4xl mx-auto w-full space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-7 w-7 text-foreground" />
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground mt-0.5">Manage team access and roles for VerdictIQ.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(["admin", "department_officer", "viewer"] as UserRole[]).map((role) => {
          const meta = ROLE_META[role];
          const roleCount = users?.filter((u) => u.role === role).length ?? 0;
          return (
            <Card key={role}>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 mb-1">
                  <meta.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium capitalize">{meta.label}s</span>
                </div>
                <p className="text-2xl font-bold">{isLoading ? "—" : roleCount}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            Admins can create and delete cases. Department Officers can verify directives. Viewers have read-only access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {users?.map((user) => {
                const meta = ROLE_META[user.role as UserRole];
                const isCurrentUser = user.clerkId === currentClerkId;
                return (
                  <div key={user.clerkId} className="flex items-center justify-between py-3 gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-semibold text-sm flex-shrink-0">
                        {user.fullName?.[0] ?? user.email[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{user.fullName ?? user.email}</p>
                          {isCurrentUser && (
                            <Badge variant="outline" className="text-xs py-0">You</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </div>
                    <Select
                      value={user.role}
                      disabled={isPending || isCurrentUser}
                      onValueChange={(newRole) =>
                        updateRole({ clerkId: user.clerkId, data: { role: newRole as UserRole } })
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue>
                          <div className="flex items-center gap-1.5">
                            <meta.icon className="h-3 w-3" />
                            <span>{meta.label}</span>
                          </div>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(["admin", "department_officer", "viewer"] as UserRole[]).map((r) => {
                          const m = ROLE_META[r];
                          return (
                            <SelectItem key={r} value={r}>
                              <div className="flex items-center gap-2">
                                <m.icon className="h-3.5 w-3.5" />
                                <span>{m.label}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Role Change History
          </CardTitle>
          <CardDescription>Recent role assignments made by administrators.</CardDescription>
        </CardHeader>
        <CardContent>
          {isRoleChangesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : roleChanges && roleChanges.length > 0 ? (
            <div className="divide-y divide-border">
              {roleChanges.map((change) => {
                const OldIcon = ROLE_META[change.oldRole as UserRole]?.icon ?? Eye;
                const NewIcon = ROLE_META[change.newRole as UserRole]?.icon ?? Eye;
                return (
                  <div key={change.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {(change.targetName ?? "?")[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium">{change.targetName ?? change.targetClerkId}</span>
                        <span className="text-muted-foreground ml-1.5">by {change.actorName ?? change.actorClerkId}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="flex items-center gap-1 text-muted-foreground text-xs">
                        <OldIcon className="h-3 w-3" />
                        <span>{ROLE_META[change.oldRole as UserRole]?.label ?? change.oldRole}</span>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <div className="flex items-center gap-1 text-xs font-medium">
                        <NewIcon className="h-3 w-3" />
                        <span>{ROLE_META[change.newRole as UserRole]?.label ?? change.newRole}</span>
                      </div>
                      <span className="text-xs text-muted-foreground ml-2">
                        {new Date(change.changedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
              No role changes recorded yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
