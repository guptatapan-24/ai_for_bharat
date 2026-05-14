import { useParams, Link, useLocation } from "wouter";
import { useState, useRef, useCallback } from "react";
import { useUserRole } from "@/contexts/UserRoleContext";
import { 
  useGetCase, 
  getGetCaseQueryKey, 
  useListDirectives,
  useGetActionPlan,
  useGetComplianceTimeline,
  useGetAuditLog,
  useDeleteCase,
  useListCaseComments,
  useCreateCaseComment,
  getListCaseCommentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import { ArrowLeft, CheckCircle2, Clock, Cpu, FileText, Loader2, Upload, ShieldAlert, History, Calendar, AlertTriangle, ScanLine, FileCheck, Trash2, RefreshCw, MessageSquare, Download, Filter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getDepartmentStyle } from "@/lib/departments";

interface UploadResult {
  pageCount: number;
  parseError: string | null;
  isScanned: boolean;
  ocrConfidence: number | null;
  lowConfidencePages: number[];
  hasExtractedText: boolean;
  textPreview: string | null;
  textForExtraction: string | null;
}

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const caseId = parseInt(id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const [showReprocessDialog, setShowReprocessDialog] = useState(false);

  const { data: caseData, isLoading } = useGetCase(caseId, {
    query: { enabled: !!caseId, queryKey: getGetCaseQueryKey(caseId) }
  });

  const { data: directives, isLoading: isDirectivesLoading } = useListDirectives(caseId, {}, {
    query: { enabled: !!caseId, queryKey: ["directives", caseId] }
  });

  const { data: actionPlan, isLoading: isActionPlanLoading } = useGetActionPlan(caseId, {
    query: { enabled: !!caseId, queryKey: ["action-plan", caseId] }
  });

  const { data: timeline, isLoading: isTimelineLoading } = useGetComplianceTimeline(caseId, {
    query: { enabled: !!caseId, queryKey: ["timeline", caseId] }
  });

  const [auditEventType, setAuditEventType] = useState("");
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");

  const { data: auditLog, isLoading: isAuditLoading } = useGetAuditLog(
    { caseId, limit: 100, ...(auditEventType ? { eventType: auditEventType } : {}), ...(auditDateFrom ? { dateFrom: auditDateFrom } : {}), ...(auditDateTo ? { dateTo: auditDateTo } : {}) },
    { query: { enabled: !!caseId, queryKey: ["audit-log", caseId, auditEventType, auditDateFrom, auditDateTo] } }
  );

  const [commentText, setCommentText] = useState("");
  const { data: comments, isLoading: isCommentsLoading } = useListCaseComments(caseId, {
    query: { enabled: !!caseId, queryKey: getListCaseCommentsQueryKey(caseId) }
  });
  const { mutate: addComment, isPending: isAddingComment } = useCreateCaseComment({
    mutation: {
      onSuccess: () => {
        setCommentText("");
        queryClient.invalidateQueries({ queryKey: getListCaseCommentsQueryKey(caseId) });
      },
      onError: () => toast({ title: "Failed to post comment", variant: "destructive" }),
    }
  });

  const handleUploadFile = useCallback(async (file: File) => {
    if (!file || file.type !== "application/pdf") {
      toast({ title: "Invalid file", description: "Only PDF files are accepted.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    setUploadProgress(10);
    try {
      const formData = new FormData();
      formData.append("pdf", file);
      setUploadProgress(30);
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/cases/${caseId}/upload`, { method: "POST", body: formData });
      setUploadProgress(80);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Upload failed");
      }
      const data: UploadResult = await res.json();
      setUploadProgress(100);
      setUploadResult(data);
      queryClient.invalidateQueries({ queryKey: getGetCaseQueryKey(caseId) });
      toast({
        title: `PDF Uploaded — ${data.pageCount} pages`,
        description: data.isScanned
          ? `Scanned document detected. OCR confidence: ${Math.round((data.ocrConfidence ?? 0) * 100)}%. Ready for AI extraction.`
          : `Digital PDF parsed. ${data.hasExtractedText ? "Full text extracted." : "Limited text found."} Ready for AI extraction.`,
      });
    } catch (err) {
      toast({ title: "Upload Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }, [caseId, queryClient, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUploadFile(file);
  }, [handleUploadFile]);

  const [, navigate] = useLocation();
  const { isAdmin, isReviewer } = useUserRole();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractElapsed, setExtractElapsed] = useState(0);

  const { mutate: deleteCase, isPending: isDeleting } = useDeleteCase({
    mutation: {
      onSuccess: () => {
        toast({ title: "Case Deleted", description: `${caseData?.caseNumber ?? "Case"} and all related data have been removed.` });
        queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes("case") });
        navigate("/cases");
      },
      onError: () => {
        toast({ title: "Delete Failed", description: "Could not delete the case. Please try again.", variant: "destructive" });
      },
    },
  });

  const handleProcess = async () => {
    setIsExtracting(true);
    setExtractElapsed(0);
    const start = Date.now();
    const timer = setInterval(() => setExtractElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      // No need to pass judgment text — it is stored server-side after upload
      const res = await fetch(`${base}/api/cases/${caseId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Extraction failed");
      const result = await res.json();
      const count = result.directivesExtracted ?? 0;
      toast({
        title: count > 0 ? `${count} Directives Extracted` : "Processing Complete",
        description: count > 0
          ? `AI extracted ${count} directives from the full judgment. Review and verify each one below.`
          : "No directives found — the AI may need more context. Try adding case notes.",
      });
      queryClient.invalidateQueries({ queryKey: getGetCaseQueryKey(caseId) });
      queryClient.invalidateQueries({ queryKey: ["directives", caseId] });
      queryClient.invalidateQueries({ queryKey: ["action-plan", caseId] });
      queryClient.invalidateQueries({ queryKey: ["timeline", caseId] });
      queryClient.invalidateQueries({ queryKey: ["audit-log", caseId] });
      setUploadResult(null);
    } catch {
      toast({ title: "Extraction Failed", description: "AI processing encountered an error. Please try again.", variant: "destructive" });
    } finally {
      clearInterval(timer);
      setIsExtracting(false);
    }
  };

  const handleReplaceAndReprocess = useCallback(async (file: File) => {
    if (!file || file.type !== "application/pdf") {
      toast({ title: "Invalid file", description: "Only PDF files are accepted.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    setUploadProgress(10);
    try {
      const formData = new FormData();
      formData.append("pdf", file);
      setUploadProgress(30);
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/cases/${caseId}/upload`, { method: "POST", body: formData });
      setUploadProgress(80);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Upload failed");
      }
      const data: UploadResult = await res.json();
      setUploadProgress(100);
      toast({
        title: `PDF Replaced — ${data.pageCount} pages`,
        description: "New PDF uploaded. Starting AI re-extraction…",
      });
      queryClient.invalidateQueries({ queryKey: getGetCaseQueryKey(caseId) });
    } catch (err) {
      toast({ title: "Upload Failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      setIsUploading(false);
      setUploadProgress(0);
      return;
    }
    setIsUploading(false);
    setUploadProgress(0);
    await handleProcess();
  }, [caseId, queryClient, toast]);

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

          <div className="flex gap-2 items-center">
            {caseData.status === "pending" && isAdmin && (
              <Button onClick={() => handleProcess()} disabled={isExtracting} className="bg-amber-600 hover:bg-amber-700 text-white">
                {isExtracting
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Extracting{extractElapsed > 0 ? ` (${extractElapsed}s)` : "…"}</>
                  : <><Cpu className="w-4 h-4 mr-2" />Extract Directives (AI)</>}
              </Button>
            )}
            {canVerify && !isExtracting && !isUploading && isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setShowReprocessDialog(true)}
                title="Replace PDF and re-extract directives"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Replace PDF
              </Button>
            )}
            {(isExtracting || isUploading) && canVerify && (
              <Button variant="outline" size="sm" disabled className="text-muted-foreground">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isUploading ? `Uploading… (${uploadProgress}%)` : `Re-extracting${extractElapsed > 0 ? ` (${extractElapsed}s)` : "…"}`}
              </Button>
            )}
            {canVerify && isReviewer && (
              <Button asChild className="bg-primary text-primary-foreground shadow-md font-medium">
                <Link href={`/cases/${caseId}/verify`}>
                  <ShieldAlert className="w-4 h-4 mr-2" />
                  Verify Directives
                </Link>
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                size="icon"
                className="text-muted-foreground hover:text-destructive hover:border-destructive/50"
                onClick={() => setShowDeleteDialog(true)}
                title="Delete case"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Hidden file input for PDF replacement */}
          <input
            ref={replaceFileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleReplaceAndReprocess(file);
              e.target.value = "";
            }}
          />
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
                <TabsTrigger value="comments" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 font-medium">
                  Comments
                  {comments && comments.length > 0 && (
                    <Badge variant="secondary" className="ml-2 rounded-full px-1.5 py-0.5 text-[10px]">{comments.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="directives" className="p-6">
              {caseData.status === "pending" ? (
                <div className="space-y-5">
                  {/* PDF Upload Zone */}
                  {!uploadResult ? (
                    <div
                      data-testid="pdf-drop-zone"
                      className={`relative border-2 border-dashed rounded-xl transition-all duration-200 cursor-pointer ${
                        isDragging
                          ? "border-primary bg-primary/5 scale-[1.01]"
                          : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/20"
                      }`}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        data-testid="input-pdf-file"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadFile(file);
                        }}
                      />
                      <div className="py-14 px-8 text-center">
                        {isUploading ? (
                          <div className="space-y-4 max-w-xs mx-auto">
                            <Loader2 className="w-10 h-10 text-primary mx-auto animate-spin" />
                            <p className="font-medium text-sm">Uploading and parsing PDF...</p>
                            <Progress value={uploadProgress} className="h-1.5" />
                          </div>
                        ) : (
                          <>
                            <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-60" />
                            <p className="font-semibold text-foreground">Drop judgment PDF here</p>
                            <p className="text-sm text-muted-foreground mt-1.5">or click to browse — digital and scanned PDFs accepted, up to 200 MB</p>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Upload Complete — Show Parsed Metadata */
                    <div className="rounded-xl border bg-card p-5 space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${uploadResult.parseError ? "bg-amber-100 dark:bg-amber-950/30" : "bg-primary/10"}`}>
                            <FileCheck className={`w-5 h-5 ${uploadResult.parseError ? "text-amber-600" : "text-primary"}`} />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">
                              {uploadResult.parseError ? "PDF Uploaded (text extraction limited)" : "PDF Parsed Successfully"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {uploadResult.pageCount > 0 ? `${uploadResult.pageCount} pages` : "Page count unavailable"} · {uploadResult.isScanned ? "Scanned document" : "Digital text"}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground text-xs"
                          onClick={() => setUploadResult(null)}
                        >
                          Replace
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div className="bg-muted/40 rounded-lg p-3">
                          <div className="text-muted-foreground text-xs uppercase tracking-wider font-medium mb-1">Pages</div>
                          <div className={`font-bold text-xl ${uploadResult.pageCount === 0 ? "text-muted-foreground" : ""}`}>
                            {uploadResult.pageCount > 0 ? uploadResult.pageCount : "—"}
                          </div>
                        </div>
                        <div className={`rounded-lg p-3 ${uploadResult.isScanned ? "bg-amber-50 dark:bg-amber-950/20" : "bg-muted/40"}`}>
                          <div className="text-muted-foreground text-xs uppercase tracking-wider font-medium mb-1">Type</div>
                          <div className="font-semibold flex items-center gap-1.5">
                            {uploadResult.isScanned
                              ? <><ScanLine className="w-3.5 h-3.5 text-amber-600" /><span className="text-amber-700">Scanned</span></>
                              : <><FileText className="w-3.5 h-3.5 text-emerald-600" /><span className="text-emerald-700">Digital</span></>
                            }
                          </div>
                        </div>
                        <div className={`rounded-lg p-3 ${uploadResult.ocrConfidence !== null && uploadResult.ocrConfidence < 0.7 ? "bg-amber-50 dark:bg-amber-950/20" : "bg-muted/40"}`}>
                          <div className="text-muted-foreground text-xs uppercase tracking-wider font-medium mb-1">Confidence</div>
                          <div className={`font-bold text-xl ${uploadResult.ocrConfidence !== null && uploadResult.ocrConfidence < 0.7 ? "text-amber-600" : "text-emerald-600"}`}>
                            {uploadResult.ocrConfidence !== null ? `${Math.round(uploadResult.ocrConfidence * 100)}%` : "—"}
                          </div>
                        </div>
                      </div>

                      {uploadResult.isScanned && uploadResult.ocrConfidence !== null && uploadResult.ocrConfidence < 0.7 && (
                        <div className="flex items-start gap-2.5 text-sm rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
                          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-semibold text-amber-800 dark:text-amber-400">Low OCR confidence</span>
                            <span className="text-amber-700 dark:text-amber-500 ml-1">
                              {uploadResult.lowConfidencePages.length > 0
                                ? `Pages ${uploadResult.lowConfidencePages.slice(0, 5).join(", ")} may be misread. Reviewer should cross-check source text.`
                                : "Some pages may be misread. Reviewer should cross-check extracted source text."}
                            </span>
                          </div>
                        </div>
                      )}

                      {uploadResult.textPreview && (
                        <div className="bg-muted/30 rounded-lg p-3 text-xs font-mono text-muted-foreground border leading-relaxed max-h-24 overflow-hidden relative">
                          {uploadResult.textPreview}
                          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-muted/30 to-transparent rounded-b-lg" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Extract Button */}
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => handleProcess()}
                      disabled={isExtracting}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6"
                      data-testid="button-extract-directives"
                    >
                      {isExtracting
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Extracting{extractElapsed > 0 ? ` (${extractElapsed}s)` : "…"}</>
                        : <><Cpu className="w-4 h-4 mr-2" />{uploadResult ? "Extract Directives from Full PDF" : "Extract Directives (from case metadata)"}</>
                      }
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {uploadResult
                        ? uploadResult.pageCount > 30
                          ? `AI will scan all ${uploadResult.pageCount} pages in chunks — may take 1–3 minutes for large judgments.`
                          : "AI will read the full judgment to identify all directives, deadlines, and compliance obligations."
                        : "No PDF uploaded. AI will extract based on case metadata and notes."}
                    </p>
                  </div>
                </div>
              ) : caseData.status === "processing" ? (
                <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/20">
                  <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
                  <h3 className="text-lg font-medium">Extracting Directives…</h3>
                  <p className="text-muted-foreground max-w-md mx-auto mt-2">
                    The AI is reading the judgment in chunks and extracting compliance directives from every page. Large documents (100+ pages) may take 1–3 minutes — please keep this tab open.
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
                                <DepartmentBadge name={directive.responsibleDepartment} />
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
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const header = "Title,Description,Department,Priority,Status,Deadline";
                        const rows = actionPlan.map(item =>
                          [
                            `"${(item.title ?? "").replace(/"/g, '""')}"`,
                            `"${(item.description ?? "").replace(/"/g, '""')}"`,
                            `"${(item.department ?? "").replace(/"/g, '""')}"`,
                            item.priority ?? "",
                            item.status ?? "",
                            item.deadline ? new Date(item.deadline).toLocaleDateString() : "",
                          ].join(",")
                        );
                        const csv = [header, ...rows].join("\n");
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `action-plan-${caseData?.caseNumber ?? caseId}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" /> Export CSV
                    </Button>
                  </div>
                  {actionPlan.map(item => (
                    <div key={item.id} className="p-4 border rounded-md flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={item.priority === 'critical' ? 'destructive' : 'default'} className="uppercase text-[10px]">{item.priority}</Badge>
                          <DepartmentBadge name={item.department} />
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

            <TabsContent value="audit-trail" className="p-6 space-y-4">
              <div className="flex flex-wrap gap-3 items-end p-3 bg-muted/30 rounded-lg border">
                <Filter className="w-4 h-4 text-muted-foreground self-center shrink-0" />
                <div className="flex flex-col gap-1 min-w-[160px]">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Event Type</label>
                  <select
                    value={auditEventType}
                    onChange={(e) => setAuditEventType(e.target.value)}
                    className="text-sm border rounded-md px-2 py-1.5 bg-background h-9"
                  >
                    <option value="">All events</option>
                    <option value="pdf_uploaded">PDF Uploaded</option>
                    <option value="extraction_started">Extraction Started</option>
                    <option value="extraction_complete">Extraction Complete</option>
                    <option value="directive_verified">Directive Verified</option>
                    <option value="directive_edited">Directive Edited</option>
                    <option value="directive_rejected">Directive Rejected</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">From</label>
                  <input
                    type="date"
                    value={auditDateFrom}
                    onChange={(e) => setAuditDateFrom(e.target.value)}
                    className="text-sm border rounded-md px-2 py-1.5 bg-background h-9"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">To</label>
                  <input
                    type="date"
                    value={auditDateTo}
                    onChange={(e) => setAuditDateTo(e.target.value)}
                    className="text-sm border rounded-md px-2 py-1.5 bg-background h-9"
                  />
                </div>
                {(auditEventType || auditDateFrom || auditDateTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setAuditEventType(""); setAuditDateFrom(""); setAuditDateTo(""); }}
                    className="text-xs self-end"
                  >
                    Clear filters
                  </Button>
                )}
              </div>
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
                  No audit entries found{auditEventType || auditDateFrom || auditDateTo ? " matching these filters" : ""}.
                </div>
              )}
            </TabsContent>
            <TabsContent value="comments" className="p-6 space-y-4">
              <div className="space-y-3">
                <Textarea
                  placeholder="Add a comment or internal note about this case…"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="resize-none min-h-[80px]"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={!commentText.trim() || isAddingComment}
                    onClick={() => addComment({ id: caseId, data: { content: commentText } })}
                  >
                    {isAddingComment ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-2" />}
                    Post Comment
                  </Button>
                </div>
              </div>
              {isCommentsLoading ? (
                <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
              ) : comments && comments.length > 0 ? (
                <div className="space-y-4 border-t pt-4">
                  {comments.map(comment => (
                    <div key={comment.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-semibold text-xs flex-shrink-0 mt-1">
                        {comment.authorName[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">{comment.authorName}</span>
                          <Badge variant="outline" className="text-[10px] capitalize py-0">{comment.authorRole}</Badge>
                          <span className="text-xs text-muted-foreground">{new Date(comment.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{comment.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/20">
                  <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  No comments yet. Add the first internal note.
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

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this case?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-semibold text-foreground">{caseData.caseNumber}</span> along with all extracted directives, action items, audit logs, and uploaded judgment data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={() => deleteCase({ id: caseId })}
            >
              {isDeleting ? "Deleting…" : "Delete Case"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showReprocessDialog} onOpenChange={setShowReprocessDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-amber-600" />
              Replace PDF and re-extract?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Uploading a new PDF for <span className="font-semibold text-foreground">{caseData.caseNumber}</span> will:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Delete all <span className="font-semibold text-foreground">{caseData.totalDirectives ?? 0} existing directives</span> and their action items</li>
                  <li>Re-run AI extraction on the new PDF from scratch</li>
                  <li>Reset the case to "Under Review" status</li>
                </ul>
                <p className="text-amber-700 dark:text-amber-400 font-medium pt-1">
                  Any reviewer approvals or edits made to existing directives will be lost.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                setShowReprocessDialog(false);
                replaceFileInputRef.current?.click();
              }}
            >
              <Upload className="w-4 h-4 mr-2" />
              Choose New PDF
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DepartmentBadge({ name }: { name: string | null | undefined }) {
  const style = getDepartmentStyle(name);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
      {name || "Unassigned"}
    </span>
  );
}