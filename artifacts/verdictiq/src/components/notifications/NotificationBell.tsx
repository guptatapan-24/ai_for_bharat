import { useState, useEffect, useRef } from "react";
import { Bell, Check, CheckCheck, Trash2, AlertCircle, Info, Clock, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQueryClient } from "@tanstack/react-query";

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  priority: string;
  isRead: boolean;
  caseId: number | null;
  department: string | null;
  createdAt: string;
}

const PRIORITY_CONFIG = {
  critical: { color: "text-red-600", bg: "bg-red-50 border-red-200", icon: AlertCircle },
  high: { color: "text-orange-600", bg: "bg-orange-50 border-orange-200", icon: TrendingUp },
  medium: { color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: Clock },
  low: { color: "text-blue-600", bg: "bg-blue-50 border-blue-200", icon: Info },
};

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const fetchUnread = async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch {}
  };

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=20", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const markAsRead = async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" });
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications/mark-all-read", { method: "PATCH", credentials: "include" });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {}
  };

  const deleteNotification = async (id: number, isRead: boolean) => {
    try {
      await fetch(`/api/notifications/${id}`, { method: "DELETE", credentials: "include" });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (!isRead) setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-md hover:bg-sidebar-accent transition-colors text-sidebar-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs bg-red-100 text-red-700 border-0">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500 hover:text-slate-900" onClick={markAllRead}>
                  <CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark all read
                </Button>
              )}
            </div>
          </div>

          {/* List */}
          <ScrollArea className="max-h-[420px]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-500 border-t-transparent" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No notifications yet</p>
              </div>
            ) : (
              <div>
                {notifications.map((n, i) => {
                  const cfg = PRIORITY_CONFIG[n.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;
                  const Icon = cfg.icon;
                  return (
                    <div key={n.id}>
                      <div
                        className={`relative px-4 py-3 hover:bg-slate-50 transition-colors group ${!n.isRead ? "bg-amber-50/40" : ""}`}
                      >
                        {!n.isRead && (
                          <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-500" />
                        )}
                        <div className="flex gap-3 pl-2">
                          <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${n.priority === "critical" ? "bg-red-100" : n.priority === "high" ? "bg-orange-100" : "bg-amber-100"}`}>
                            <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${n.isRead ? "text-slate-600" : "text-slate-900"}`}>{n.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{n.message}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
                              {n.department && (
                                <span className="text-[11px] text-slate-400 truncate max-w-[160px]">· {n.department}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0 flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!n.isRead && (
                              <button
                                onClick={() => markAsRead(n.id)}
                                className="p-1 rounded hover:bg-slate-200 transition-colors"
                                title="Mark as read"
                              >
                                <Check className="h-3 w-3 text-slate-500" />
                              </button>
                            )}
                            <button
                              onClick={() => deleteNotification(n.id, n.isRead)}
                              className="p-1 rounded hover:bg-red-100 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3 text-slate-400 hover:text-red-500" />
                            </button>
                          </div>
                        </div>
                      </div>
                      {i < notifications.length - 1 && <Separator className="my-0" />}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <div className="border-t border-slate-100 px-4 py-2.5 flex justify-center">
            <Link href="/notifications" onClick={() => setOpen(false)}>
              <button className="text-xs text-amber-600 hover:text-amber-700 font-medium transition-colors">
                View all notifications →
              </button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
