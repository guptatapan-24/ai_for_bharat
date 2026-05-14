import { useState } from "react";
import { Link } from "wouter";
import { useListCases, useDeleteCase } from "@workspace/api-client-react";
import { useUserRole } from "@/contexts/UserRoleContext";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, Search, Filter, AlertCircle, Clock, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { ListCasesStatus } from "@workspace/api-client-react";
import { DEPARTMENT_LIST } from "@/lib/departments";

export default function CaseList() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ListCasesStatus | "all">("all");
  const [department, setDepartment] = useState<string | "all">("all");
  const [deletingCase, setDeletingCase] = useState<{ id: number; caseNumber: string } | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, isViewer } = useUserRole();

  const { data: cases, isLoading } = useListCases({
    search: search || undefined,
    status: status === "all" ? undefined : status,
    department: department === "all" ? undefined : department,
  });

  const { mutate: deleteCase, isPending: isDeleting } = useDeleteCase({
    mutation: {
      onSuccess: (_, id) => {
        toast({ title: "Case Deleted", description: `${deletingCase?.caseNumber ?? "Case"} and all related data have been removed.` });
        queryClient.invalidateQueries({ queryKey: ["listCases"] });
        queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("case") });
        setDeletingCase(null);
      },
      onError: () => {
        toast({ title: "Delete Failed", description: "Could not delete the case. Please try again.", variant: "destructive" });
        setDeletingCase(null);
      },
    },
  });

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Court Cases</h1>
          <p className="text-muted-foreground mt-1">Manage and track intelligence extracted from judgments.</p>
        </div>
        {!isViewer && (
          <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium">
            <Link href="/cases/new">Register New Case</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by case number, court..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>
        <div className="w-full sm:w-48">
          <Select value={status} onValueChange={(val) => setStatus(val as ListCasesStatus | "all")}>
            <SelectTrigger className="bg-card">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-64">
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger className="bg-card">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All Departments</SelectItem>
              {DEPARTMENT_LIST.map((d) => (
                <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : cases && cases.length > 0 ? (
          <div className="space-y-4 pb-12">
            {cases.map(c => (
              <Card key={c.id} className="hover:border-primary/50 transition-colors overflow-hidden group">
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row">
                    <div className="p-6 flex-1 flex flex-col justify-center">
                      <div className="flex items-center gap-3 mb-2">
                        <Link href={`/cases/${c.id}`} className="text-lg font-semibold text-primary hover:underline">
                          {c.caseNumber}
                        </Link>
                        <StatusBadge status={c.status} />
                        {c.urgencyLevel && (
                          <Badge variant={c.urgencyLevel === 'critical' ? 'destructive' : 'outline'} className="uppercase text-[10px] tracking-wider font-bold">
                            {c.urgencyLevel}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="flex items-center"><FileText className="w-3.5 h-3.5 mr-1" /> {c.court}</span>
                        {c.dateOfOrder && (
                          <span className="flex items-center"><Clock className="w-3.5 h-3.5 mr-1" /> Order: {new Date(c.dateOfOrder).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="bg-muted/30 p-6 flex flex-row sm:flex-col items-center justify-center gap-4 sm:border-l min-w-[200px] relative">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-foreground">{c.totalDirectives || 0}</div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Directives</div>
                      </div>
                      <div className="w-px h-8 sm:w-full sm:h-px bg-border" />
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-amber-600 font-bold">
                          {c.pendingVerificationCount && c.pendingVerificationCount > 0 ? (
                            <><AlertCircle className="w-4 h-4" /> {c.pendingVerificationCount}</>
                          ) : (
                            <span className="text-muted-foreground font-normal">0</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium mt-1">Pending Review</div>
                      </div>

                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.preventDefault();
                            setDeletingCase({ id: c.id, caseNumber: c.caseNumber });
                          }}
                          title="Delete case"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed rounded-lg bg-card">
            <FileText className="h-12 w-12 text-muted-foreground opacity-50 mb-4" />
            <h3 className="text-lg font-medium">No cases found</h3>
            <p className="text-muted-foreground">Adjust your search or register a new case.</p>
            <Button asChild className="mt-4" variant="outline">
              <Link href="/cases/new">Register Case</Link>
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={!!deletingCase} onOpenChange={(open) => { if (!open) setDeletingCase(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Case?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-semibold text-foreground">{deletingCase?.caseNumber}</span> along with all extracted directives, action items, audit logs, and uploaded judgment data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={() => deletingCase && deleteCase({ id: deletingCase.id })}
            >
              {isDeleting ? "Deleting…" : "Delete Case"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
    processing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    under_review: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
    verified: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
    completed: "border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400",
  };
  
  const labels: Record<string, string> = {
    pending: "Pending",
    processing: "Processing AI",
    under_review: "Under Review",
    verified: "Verified",
    completed: "Completed",
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[status] || colors.pending}`}>
      {labels[status] || status}
    </span>
  );
}
