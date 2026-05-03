import { useState } from "react";
import { Link } from "wouter";
import { useListCases } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Search, Filter, AlertCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ListCasesStatus } from "@workspace/api-client-react";

export default function CaseList() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ListCasesStatus | "all">("all");

  const { data: cases, isLoading } = useListCases({
    search: search || undefined,
    status: status === "all" ? undefined : status,
  });

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Court Cases</h1>
          <p className="text-muted-foreground mt-1">Manage and track intelligence extracted from judgments.</p>
        </div>
        <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium">
          <Link href="/cases/new">Register New Case</Link>
        </Button>
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
          <Select value={status} onValueChange={(val) => setStatus(val as any)}>
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
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : cases && cases.length > 0 ? (
          <div className="space-y-4 pb-12">
            {cases.map(c => (
              <Card key={c.id} className="hover:border-primary/50 transition-colors overflow-hidden">
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
                    
                    <div className="bg-muted/30 p-6 flex flex-row sm:flex-col items-center justify-center gap-4 sm:border-l min-w-[200px]">
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
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    pending: "secondary",
    processing: "secondary",
    under_review: "destructive",
    verified: "default",
    completed: "outline",
  };
  
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