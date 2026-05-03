import { useParams, Link, useLocation } from "wouter";
import { 
  useGetCase, 
  useProcessCase, 
  getGetCaseQueryKey, 
  useListDirectives,
  useGetActionPlan,
  useGetComplianceTimeline,
  useGetAuditLog
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, Clock, Cpu, FileText, Loader2, PlayCircle, ShieldAlert, History, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const caseId = parseInt(id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: caseData, isLoading } = useGetCase(caseId, {
    query: { enabled: !!caseId, queryKey: getGetCaseQueryKey(caseId) }
  });

  const { data: directives, isLoading: isDirectivesLoading } = useListDirectives(caseId, {}, {
    query: { enabled: !!caseId }
  });

  const { data: actionPlan, isLoading: isActionPlanLoading } = useGetActionPlan(caseId, {
    query: { enabled: !!caseId }
  });

  const { data: timeline, isLoading: isTimelineLoading } = useGetComplianceTimeline(caseId, {
    query: { enabled: !!caseId }
  });

  const { data: auditLog, isLoading: isAuditLoading } = useGetAuditLog({ caseId, limit: 50 }, {
    query: { enabled: !!caseId }
  });

  const processCase = useProcessCase();

  const handleProcess = () => {
    processCase.mutate({ id: caseId }, {
      onSuccess: () => {
        toast({
          title: "Processing Started",
          description: "AI extraction is analyzing the judgment. This may take a few minutes."
        });
        queryClient.invalidateQueries({ queryKey: getGetCaseQueryKey(caseId) });
      }
    });
  };

  if (isLoading) {
    return <div className="p-8"><Skeleton className="w-full h-[500px]" /></div>;
  }

  if (!caseData) return <div className="p-8 text-center">Case not found</div>;

  const canVerify = caseData.status === "under_review" || caseData.status === "verified";

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/cases">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Cases
          </Link>
        </Button>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-3">
              {caseData.caseNumber}
              {caseData.urgencyLevel && (
                <Badge variant={caseData.urgencyLevel === 'critical' ? 'destructive' : 'secondary'} className="text-xs uppercase">
                  {caseData.urgencyLevel}
                </Badge>
              )}
            </h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              <FileText className="w-4 h-4" /> {caseData.court}
              {caseData.dateOfOrder && ` • ${new Date(caseData.dateOfOrder).toLocaleDateString()}`}
            </p>
          </div>

          <div className="flex gap-2">
            {caseData.status === "pending" && (
              <Button onClick={handleProcess} disabled={processCase.isPending} className="bg-amber-600 hover:bg-amber-700 text-white">
                {processCase.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cpu className="w-4 h-4 mr-2" />}
                Extract Directives (AI)
              </Button>
            )}
            {canVerify && (
              <Button asChild className="bg-primary text-primary-foreground shadow-md font-medium">
                <Link href={`/cases/${caseId}/verify`}>
                  <ShieldAlert className="w-4 h-4 mr-2" />
                  Verify Directives
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="md:col-span-3">
          <Tabs defaultValue="directives" className="w-full">
            <div className="border-b px-6 py-2">
              <TabsList className="bg-transparent h-auto p-0 space-x-6">
                <TabsTrigger value="directives" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 font-medium">
                  Directives 
                  {caseData.totalDirectives ? <Badge variant="secondary" className="ml-2 rounded-full px-1.5 py-0.5 text-[10px]">{caseData.totalDirectives}</Badge> : null}
                </TabsTrigger>
                <TabsTrigger value="action-plan" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 font-medium">
                  Action Plan
                </TabsTrigger>
                <TabsTrigger value="timeline" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 font-medium">
                  Compliance Timeline
                </TabsTrigger>
                <TabsTrigger value="audit-trail" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 font-medium">
                  Audit Trail
                </TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="directives" className="p-6">
              {caseData.status === "pending" ? (
                <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/20">
                  <PlayCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium">Ready for Processing</h3>
                  <p className="text-muted-foreground max-w-md mx-auto mt-2 mb-6">
                    The case is registered. Click "Extract Directives" to use AI to read the judgment and identify compliance requirements.
                  </p>
                  <Button onClick={handleProcess} disabled={processCase.isPending}>
                    Start Extraction
                  </Button>
                </div>
              ) : caseData.status === "processing" ? (
                <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/20">
                  <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
                  <h3 className="text-lg font-medium">Processing Judgment...</h3>
                  <p className="text-muted-foreground max-w-md mx-auto mt-2">
                    The system is currently extracting and classifying directives. This may take a minute or two.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-semibold">Extracted Directives</h3>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{caseData.pendingVerificationCount || 0} Pending Review</Badge>
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{caseData.verifiedCount || 0} Verified</Badge>
                    </div>
                  </div>

                  {isDirectivesLoading ? (
                    <Skeleton className="h-40 w-full" />
                  ) : directives && directives.length > 0 ? (
                    <div className="space-y-4">
                      {directives.map((directive) => (
                        <Card key={directive.id} className={`overflow-hidden ${directive.verificationStatus === 'pending' ? 'border-amber-200 bg-amber-50/10' : ''}`}>
                          <div className={`h-1 w-full ${directive.classification === 'mandatory' ? 'bg-red-500' : 'bg-blue-500'}`} />
                          <CardContent className="p-5">
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex gap-2 items-center">
                                <Badge variant={directive.classification === 'mandatory' ? 'destructive' : 'secondary'} className="uppercase text-[10px]">
                                  {directive.classification}
                                </Badge>
                                <span className="text-sm font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                  Page {directive.pageNumber}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                {directive.verificationStatus === 'pending' ? (
                                  <span className="flex items-center text-amber-600 font-medium text-xs bg-amber-100 px-2 py-1 rounded-full"><Clock className="w-3 h-3 mr-1" /> Pending</span>
                                ) : (
                                  <span className="flex items-center text-emerald-600 font-medium text-xs bg-emerald-100 px-2 py-1 rounded-full"><CheckCircle2 className="w-3 h-3 mr-1" /> Verified</span>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-foreground font-medium mb-3 italic border-l-2 pl-3 py-1">"{directive.sourceText}"</p>
                            
                            <div className="grid grid-cols-2 gap-4 text-sm mt-4 bg-muted/40 p-3 rounded">
                              <div>
                                <span className="text-muted-foreground block text-xs uppercase font-semibold tracking-wider">Action Required</span>
                                <span className="font-medium">{directive.actionRequired}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block text-xs uppercase font-semibold tracking-wider">Department</span>
                                <span className="font-medium">{directive.responsibleDepartment || "Unassigned"}</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">No directives found.</div>
                  )}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="action-plan" className="p-6">
              {isActionPlanLoading ? (
                <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
              ) : actionPlan && actionPlan.length > 0 ? (
                <div className="space-y-4">
                  {actionPlan.map(item => (
                    <div key={item.id} className="p-4 border rounded-md flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={item.priority === 'critical' ? 'destructive' : 'default'} className="uppercase text-[10px]">{item.priority}</Badge>
                          <span className="text-sm font-medium">{item.department}</span>
                        </div>
                        <h4 className="font-medium">{item.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                        {item.deadline && (
                          <div className="mt-2 text-xs font-medium flex items-center text-amber-700">
                            <Clock className="w-3 h-3 mr-1" /> Due: {new Date(item.deadline).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <div>
                        <Badge variant="outline" className={item.status === 'completed' ? 'border-emerald-500 text-emerald-700' : ''}>
                          {item.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/20">
                  Action plan generation will be available once directives are verified.
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="timeline" className="p-6">
              {isTimelineLoading ? (
                <div className="space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
              ) : timeline && timeline.length > 0 ? (
                <div className="relative border-l-2 border-muted ml-4 space-y-8 pl-6">
                  {timeline.map((event, i) => (
                    <div key={i} className="relative">
                      <div className={`absolute w-4 h-4 rounded-full -left-[31px] top-1 outline outline-4 outline-card ${event.isOverdue ? 'bg-red-500' : 'bg-primary'}`} />
                      <div className="text-sm font-semibold flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        {new Date(event.date).toLocaleDateString()}
                        {event.isOverdue && <Badge variant="destructive" className="text-[10px]">OVERDUE</Badge>}
                      </div>
                      <h4 className="font-medium mt-1">{event.title}</h4>
                      <p className="text-sm text-muted-foreground">{event.description}</p>
                      <div className="text-xs mt-2 font-medium text-muted-foreground">Department: {event.department}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/20">
                  Timeline visualization requires verified deadlines.
                </div>
              )}
            </TabsContent>

            <TabsContent value="audit-trail" className="p-6">
              {isAuditLoading ? (
                <div className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
              ) : auditLog && auditLog.length > 0 ? (
                <div className="space-y-4">
                  {auditLog.map(entry => (
                    <div key={entry.id} className="text-sm border-b pb-4 last:border-0 flex items-start gap-3">
                      <History className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <div className="flex items-center gap-2 font-medium mb-1">
                          <span className="uppercase text-xs tracking-wider bg-muted px-2 py-0.5 rounded">{entry.eventType}</span>
                          <span className="text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</span>
                        </div>
                        {entry.reviewerName && (
                          <div className="text-muted-foreground mb-1">By: {entry.reviewerName}</div>
                        )}
                        {entry.reviewerDecision && (
                          <div className="font-medium">Decision: {entry.reviewerDecision}</div>
                        )}
                        {entry.statedReason && (
                          <div className="text-muted-foreground mt-1 italic">"{entry.statedReason}"</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/20">
                  No audit entries found.
                </div>
              )}
            </TabsContent>
          </Tabs>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="bg-muted/30 pb-4">
              <CardTitle className="text-sm">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 text-sm">
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">Bench</div>
                <div className="font-medium">{caseData.benchType} • {caseData.bench || "N/A"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">Parties</div>
                <div className="font-medium">P: {caseData.petitioner || "N/A"}</div>
                <div className="font-medium mt-1">R: {caseData.respondent || "N/A"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">Govt Role</div>
                <div className="font-medium capitalize">{caseData.governmentRole}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}