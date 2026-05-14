import { useState, useEffect } from "react";
import { AlertCircle, Bell, Check, CheckCheck, Clock, Filter, Info, Trash2, TrendingUp, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  priority: "critical" | "high" | "medium" | "low";
  isRead: boolean;
  caseId: number | null;
  department: string | null;
  createdAt: string;
}

const PRIORITY_CONFIG = {
  critical: { label: "Critical", color: "text-red-600", bg: "bg-red-50", border: "border-red-200", badge: "bg-red-100 text-red-700", icon: AlertCircle },
  high: { label: "High", color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200", badge: "bg-orange-100 text-orange-700", icon: TrendingUp },
  medium: { label: "Medium", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-100 text-amber-700", icon: Clock },
  low: { label: "Low", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-100 text-blue-700", icon: Info },
};

const TYPE_LABELS: Record<string, string> = {
  case_uploaded: "Case Uploaded",
  directive_assigned: "Directive Assigned",
  action_plan_generated: "Action Plan",
  case_status_updated: "Status Update",
  deadline_approaching: "Deadline",
  escalation_overdue: "Escalation",
};

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const LIMIT = 20;

  const fetchNotifications = async (reset = false) => {
    setLoading(true);
    const currentPage = reset ? 0 : page;
    const params = new URLSearchParams({
      limit: String(LIMIT),
      offset: String(currentPage * LIMIT),
      ...(tab === "unread" ? { unread: "true" } : {}),
      ...(typeFilter !== "all" ? { type: typeFilter } : {}),
    });

    try {
      const res = await fetch(`/api/notifications?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setTotal(data.total);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    setPage(0);
    fetchNotifications(true);
  }, [tab, typeFilter, priorityFilter]);

  useEffect(() => {
    fetchNotifications();
  }, [page]);

  const markAsRead = async (id: number) => {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllRead = async () => {
    await fetch("/api/notifications/mark-all-read", { method: "PATCH", credentials: "include" });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const deleteNotification = async (id: number) => {
    await fetch(`/api/notifications/${id}`, { method: "DELETE", credentials: "include" });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setTotal((t) => t - 1);
  };

  const displayed = priorityFilter === "all"
    ? notifications
    : notifications.filter((n) => n.priority === priorityFilter);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-500" />
              Notifications
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{total} total notification{total !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={markAllRead}>
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </Button>
            )}
            <Link href="/notifications/preferences">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                Preferences
              </Button>
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "unread")}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs h-6 px-3">All</TabsTrigger>
              <TabsTrigger value="unread" className="text-xs h-6 px-3">
                Unread {unreadCount > 0 && <Badge className="ml-1 h-4 min-w-4 text-[10px] bg-amber-500 text-white border-0">{unreadCount}</Badge>}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 text-xs w-[160px]">
              <Filter className="h-3 w-3 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(TYPE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-8 text-xs w-[160px]">
              <SelectValue placeholder="Filter by priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Bell className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">No notifications found</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {displayed.map((n) => {
              const cfg = PRIORITY_CONFIG[n.priority] ?? PRIORITY_CONFIG.medium;
              const Icon = cfg.icon;
              return (
                <div
                  key={n.id}
                  className={`relative px-6 py-4 hover:bg-muted/30 transition-colors group ${!n.isRead ? "bg-amber-50/30" : ""}`}
                >
                  {!n.isRead && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-500" />
                  )}
                  <div className="flex gap-4 pl-2">
                    <div className={`mt-1 flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${cfg.bg}`}>
                      <Icon className={`h-4 w-4 ${cfg.color}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <p className={`text-sm font-semibold ${n.isRead ? "text-foreground/70" : "text-foreground"}`}>
                              {n.title}
                            </p>
                            <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
                              {cfg.label}
                            </span>
                            {n.type && (
                              <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted">
                                {TYPE_LABELS[n.type] ?? n.type}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">{n.message}</p>
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            <span className="text-xs text-muted-foreground/70">{timeAgo(n.createdAt)}</span>
                            {n.department && (
                              <span className="text-xs text-muted-foreground/70 truncate max-w-[200px]">· {n.department}</span>
                            )}
                            {n.caseId && (
                              <Link href={`/cases/${n.caseId}`}>
                                <span className="text-xs text-amber-600 hover:text-amber-700 font-medium transition-colors">View case →</span>
                              </Link>
                            )}
                          </div>
                        </div>

                        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!n.isRead && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 hover:bg-green-100"
                              title="Mark as read"
                              onClick={() => markAsRead(n.id)}
                            >
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 hover:bg-red-100"
                            title="Delete"
                            onClick={() => deleteNotification(n.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-border px-6 py-3 flex items-center justify-between bg-card">
          <p className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
