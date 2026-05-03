import { useState, useMemo } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useGetCase, useListDirectives, useVerifyDirective, getGetCaseQueryKey, getListDirectivesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ShieldAlert, Check, X, Edit2, ArrowLeft, Loader2, HelpCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { Directive } from "@workspace/api-client-react";

export default function VerifyInterface() {
  const { id } = useParams<{ id: string }>();
  const caseId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: caseData, isLoading: isCaseLoading } = useGetCase(caseId, {
    query: { enabled: !!caseId, queryKey: getGetCaseQueryKey(caseId) }
  });

  const { data: directives, isLoading: isDirectivesLoading } = useListDirectives(caseId, {}, {
    query: { enabled: !!caseId, queryKey: getListDirectivesQueryKey(caseId) }
  });

  const verifyMutation = useVerifyDirective();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  
  // Edit form state
  const [editedAction, setEditedAction] = useState("");
  const [editedClass, setEditedClass] = useState<"mandatory" | "advisory" | null>(null);
  const [editReason, setEditReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const pendingDirectives = useMemo(() => {
    return directives?.filter(d => d.verificationStatus === "pending") || [];
  }, [directives]);

  const currentDirective = pendingDirectives[currentIndex];

  const handleApprove = () => {
    if (!currentDirective) return;
    
    verifyMutation.mutate({
      id: caseId,
      directiveId: currentDirective.id,
      data: {
        decision: "approved",
        reviewerName: "Current User", // Mocked for now
      }
    }, {
      onSuccess: () => {
        toast({ title: "Directive Approved" });
        moveToNext();
      }
    });
  };

  const handleEditSubmit = () => {
    if (!currentDirective) return;
    if (!editReason.trim()) {
      toast({ variant: "destructive", title: "Reason required for edits" });
      return;
    }

    verifyMutation.mutate({
      id: caseId,
      directiveId: currentDirective.id,
      data: {
        decision: "edited",
        reviewerName: "Current User",
        correctedValue: editedAction,
        correctedClassification: editedClass,
        reason: editReason
      }
    }, {
      onSuccess: () => {
        toast({ title: "Directive Edited & Approved" });
        setEditMode(false);
        moveToNext();
      }
    });
  };

  const handleRejectSubmit = () => {
    if (!currentDirective) return;
    if (!rejectReason.trim()) {
      toast({ variant: "destructive", title: "Reason required for rejection" });
      return;
    }

    verifyMutation.mutate({
      id: caseId,
      directiveId: currentDirective.id,
      data: {
        decision: "rejected",
        reviewerName: "Current User",
        reason: rejectReason
      }
    }, {
      onSuccess: () => {
        toast({ title: "Directive Rejected" });
        setRejectMode(false);
        moveToNext();
      }
    });
  };

  const moveToNext = () => {
    queryClient.invalidateQueries({ queryKey: getListDirectivesQueryKey(caseId) });
    queryClient.invalidateQueries({ queryKey: getGetCaseQueryKey(caseId) });
    
    if (currentIndex < pendingDirectives.length - 1) {
      // Just keep index, as the current one will be filtered out on refetch
      // Actually since it's filtered, keeping index 0 is correct to get the "next" pending item
      setCurrentIndex(0); 
      resetModes();
    } else {
      // Done with all
      setLocation(`/cases/${caseId}`);
    }
  };

  const resetModes = () => {
    setEditMode(false);
    setRejectMode(false);
    setEditReason("");
    setRejectReason("");
    if (currentDirective) {
      setEditedAction(currentDirective.actionRequired);
      setEditedClass(currentDirective.classification as any);
    }
  };

  // Sync edit state when directive changes
  if (currentDirective && !editedAction && !editMode && !rejectMode) {
    setEditedAction(currentDirective.actionRequired);
    setEditedClass(currentDirective.classification as any);
  }

  if (isCaseLoading || isDirectivesLoading) {
    return <div className="p-8 max-w-5xl mx-auto"><Skeleton className="h-[600px] w-full" /></div>;
  }

  if (!currentDirective) {
    return (
      <div className="p-8 max-w-5xl mx-auto flex flex-col items-center justify-center min-h-[60vh]">
        <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-4" />
        <h2 className="text-2xl font-serif font-bold mb-2">Verification Complete</h2>
        <p className="text-muted-foreground mb-6">All directives for this case have been reviewed.</p>
        <Button asChild><Link href={`/cases/${caseId}`}>Return to Case</Link></Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-background">
      <header className="bg-primary text-primary-foreground p-4 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild className="text-primary-foreground hover:bg-primary-foreground/20">
            <Link href={`/cases/${caseId}`}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Link>
          </Button>
          <div>
            <h1 className="font-serif font-bold text-lg leading-tight">Human-in-the-Loop Verification</h1>
            <p className="text-xs opacity-80 leading-tight">Case {caseData?.caseNumber}</p>
          </div>
        </div>
        <div className="text-sm font-medium bg-primary-foreground/10 px-3 py-1 rounded-full">
          {pendingDirectives.length} remaining
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex">
        {/* Source Text Panel */}
        <div className="w-1/2 border-r bg-white dark:bg-card p-6 overflow-y-auto flex flex-col">
          <div className="flex items-center gap-2 mb-4 shrink-0">
            <Badge variant="outline" className="font-mono bg-muted/50">Page {currentDirective.pageNumber}</Badge>
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Source Document Text</span>
          </div>
          
          <div className="bg-slate-50 dark:bg-muted/20 p-6 rounded-md border text-lg leading-relaxed font-serif shadow-inner flex-1">
            <span className="bg-amber-200/50 dark:bg-amber-900/40 text-foreground rounded py-1 px-1 -mx-1">
              {currentDirective.sourceText}
            </span>
            <div className="mt-8 text-sm text-muted-foreground border-t pt-4 flex items-center gap-2">
              <HelpCircle className="w-4 h-4" /> 
              Context from surrounding paragraphs is omitted for focus. Verify the highlighted extraction.
            </div>
          </div>
        </div>

        {/* Verification Panel */}
        <div className="w-1/2 p-6 overflow-y-auto bg-slate-50 dark:bg-background">
          <Card className="border-primary/20 shadow-lg">
            <CardHeader className="bg-muted/30 border-b">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl">AI Extraction</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Review and approve the generated action item.</p>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Confidence</div>
                  <div className={`text-lg font-bold ${currentDirective.confidenceScore > 0.8 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {(currentDirective.confidenceScore * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-6 space-y-6">
              {!editMode && !rejectMode ? (
                // View Mode
                <>
                  <div className="space-y-2">
                    <div className="text-sm uppercase tracking-wider font-semibold text-muted-foreground">Classification</div>
                    <Badge 
                      variant={currentDirective.classification === 'mandatory' ? 'destructive' : 'default'} 
                      className={`text-sm px-3 py-1 ${currentDirective.classification === 'mandatory' ? 'bg-red-600' : 'bg-blue-600'}`}
                    >
                      {currentDirective.classification.toUpperCase()} DIRECTIVE
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-sm uppercase tracking-wider font-semibold text-muted-foreground">Action Required</div>
                    <div className="text-base font-medium p-4 bg-card border rounded-md shadow-sm">
                      {currentDirective.actionRequired}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Department</div>
                      <div className="font-medium">{currentDirective.responsibleDepartment || "N/A"}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Deadline</div>
                      <div className="font-medium flex items-center gap-2">
                        {currentDirective.deadline || "No deadline stated"}
                        {currentDirective.deadlineInferred && <Badge variant="outline" className="text-[10px]">Inferred</Badge>}
                      </div>
                    </div>
                  </div>
                </>
              ) : editMode ? (
                // Edit Mode
                <div className="space-y-4 animate-in fade-in">
                  <h3 className="font-medium flex items-center gap-2 text-amber-700 dark:text-amber-500 mb-4">
                    <Edit2 className="w-4 h-4" /> Correcting Extraction
                  </h3>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Classification</label>
                    <Select value={editedClass || ""} onValueChange={(v: any) => setEditedClass(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mandatory">Mandatory</SelectItem>
                        <SelectItem value="advisory">Advisory</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Action Required</label>
                    <Textarea 
                      value={editedAction} 
                      onChange={(e) => setEditedAction(e.target.value)}
                      className="min-h-[100px]"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Reason for edit <span className="text-red-500">*</span></label>
                    <Input 
                      value={editReason} 
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="e.g. AI missed the specific deadline condition"
                      required
                    />
                  </div>
                </div>
              ) : (
                // Reject Mode
                <div className="space-y-4 animate-in fade-in">
                  <h3 className="font-medium flex items-center gap-2 text-red-600 mb-4">
                    <X className="w-4 h-4" /> Rejecting Extraction
                  </h3>
                  <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded text-sm text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900 mb-4">
                    Rejecting this directive will remove it from the final action plan. It will still be logged in the audit trail.
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Reason for rejection <span className="text-red-500">*</span></label>
                    <Textarea 
                      value={rejectReason} 
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="e.g. This is merely a summary of arguments, not a directive."
                      className="min-h-[100px]"
                      required
                    />
                  </div>
                </div>
              )}
            </CardContent>
            
            <CardFooter className="bg-muted/30 border-t p-6 flex gap-3 justify-end">
              {verifyMutation.isPending && <Loader2 className="w-5 h-5 animate-spin mr-2 text-muted-foreground" />}
              
              {!editMode && !rejectMode ? (
                <>
                  <Button variant="outline" onClick={() => setRejectMode(true)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                    <X className="w-4 h-4 mr-2" /> Reject
                  </Button>
                  <Button variant="outline" onClick={() => setEditMode(true)}>
                    <Edit2 className="w-4 h-4 mr-2" /> Edit
                  </Button>
                  <Button onClick={handleApprove} className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium min-w-[120px]">
                    <Check className="w-4 h-4 mr-2" /> Approve
                  </Button>
                </>
              ) : editMode ? (
                <>
                  <Button variant="ghost" onClick={resetModes}>Cancel</Button>
                  <Button onClick={handleEditSubmit} className="bg-primary text-primary-foreground">Save & Approve</Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={resetModes}>Cancel</Button>
                  <Button variant="destructive" onClick={handleRejectSubmit}>Confirm Rejection</Button>
                </>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}