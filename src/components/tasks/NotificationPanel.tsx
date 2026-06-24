"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Bell, CheckCheck, Clock, RefreshCw, X } from "lucide-react";

interface TaskRef { id: string; title: string; }
interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  task?: TaskRef | null;
}

interface AlertTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string | null;
  team?: { id: string; name: string } | null;
}

export function NotificationPanel() {
  const [mounted, setMounted]             = useState(false);
  const [open, setOpen]                   = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [loading, setLoading]             = useState(false);
  const [activeAlerts, setActiveAlerts]   = useState<{ task: AlertTask; reason: "review" | "overdue" | "due_today" }[]>([]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("toggle-notification-panel", handler);
    return () => window.removeEventListener("toggle-notification-panel", handler);
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/notifications");
    if (res.ok) {
      const d = await res.json();
      setNotifications(d.notifications ?? []);
      setUnreadCount(d.unreadCount ?? 0);
      window.dispatchEvent(new CustomEvent("notification-unread-count", { detail: { count: d.unreadCount ?? 0 } }));
    }
    setLoading(false);
  }, []);

  const fetchActiveAlerts = useCallback(async () => {
    const res = await fetch("/api/tasks/alerts");
    if (!res.ok) return;
    const tasks: AlertTask[] = (await res.json()).tasks ?? [];

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const alerts: { task: AlertTask; reason: "review" | "overdue" | "due_today" }[] = [];
    const seen = new Set<string>();

    for (const t of tasks) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      if (t.status === "in_review") {
        alerts.push({ task: t, reason: "review" });
      } else if (t.dueDate) {
        const due = new Date(t.dueDate);
        if (due < todayStart)       alerts.push({ task: t, reason: "overdue" });
        else if (due <= todayEnd)   alerts.push({ task: t, reason: "due_today" });
      }
    }

    setActiveAlerts(alerts);
  }, []);

  // Initial load + 30s poll
  useEffect(() => {
    fetchNotifications();
    fetchActiveAlerts();
    const interval = setInterval(() => {
      fetch("/api/notifications")
        .then((r) => r.json())
        .then((d) => {
          setUnreadCount(d.unreadCount ?? 0);
          window.dispatchEvent(new CustomEvent("notification-unread-count", { detail: { count: d.unreadCount ?? 0 } }));
          if (open) setNotifications(d.notifications ?? []);
        })
        .catch(() => {});
      fetchActiveAlerts();
    }, 60_000);
    return () => clearInterval(interval);
  }, [open, fetchNotifications, fetchActiveAlerts]);

  useEffect(() => {
    if (open) { fetchNotifications(); fetchActiveAlerts(); }
  }, [open, fetchNotifications, fetchActiveAlerts]);

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAllRead: true }) });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  function goToTask(taskId: string) {
    window.dispatchEvent(new CustomEvent("open-task", { detail: { taskId } }));
    setOpen(false);
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function typeIcon(type: string) {
    const icons: Record<string, string> = {
      task_assigned:  "📋",
      task_comment:   "💬",
      task_updated:   "✏️",
      task_due_today: "⏰",
      task_review:    "👁️",
    };
    return icons[type] ?? "🔔";
  }

  function alertMeta(reason: "review" | "overdue" | "due_today") {
    if (reason === "review")    return { icon: "👁️", label: "In Review",  color: "#8B5CF6", bg: "rgba(139,92,246,.08)" };
    if (reason === "overdue")   return { icon: "🔴", label: "Overdue",    color: "#ef4444", bg: "rgba(239,68,68,.08)" };
    return                             { icon: "⏰", label: "Due Today",  color: "#F97316", bg: "rgba(249,115,22,.08)" };
  }

  if (!mounted) return null;

  const panel = (
    <>
      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,0,0,0.2)" }} />
      )}

      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 9991,
        width: "360px", maxWidth: "95vw",
        background: "var(--bg-card)", borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.34,1.06,0.64,1)",
        boxShadow: open ? "-8px 0 32px rgba(0,0,0,0.18)" : "none",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Bell size={16} style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>Notifications</span>
            {unreadCount > 0 && (
              <span style={{ fontSize: "10px", fontWeight: 600, padding: "1px 6px", borderRadius: "20px", background: "rgba(239,68,68,.15)", color: "#ef4444" }}>
                {unreadCount} new
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {unreadCount > 0 && (
              <button onClick={markAllRead} title="Mark all as read"
                style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", padding: "4px 10px", borderRadius: "7px", border: "none", background: "var(--bg-subtle)", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit" }}>
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>

          {/* Active Alerts */}
          {activeAlerts.length > 0 && (
            <div style={{ borderBottom: "2px solid var(--border)" }}>
              <div style={{ padding: "8px 16px 5px", display: "flex", alignItems: "center", gap: "6px" }}>
                <AlertTriangle size={11} style={{ color: "#ef4444" }} />
                <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#ef4444" }}>
                  Active Alerts ({activeAlerts.length})
                </span>
              </div>
              {activeAlerts.map(({ task, reason }) => {
                const m = alertMeta(reason);
                return (
                  <div key={`${task.id}-${reason}`}
                    style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", background: m.bg }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                      <span style={{ fontSize: "16px", flexShrink: 0 }}>{m.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                          <span style={{ fontSize: "10px", fontWeight: 700, color: m.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.label}</span>
                          {task.team && <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>· {task.team.name}</span>}
                        </div>
                        <p style={{ margin: "0 0 5px", fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {task.title}
                        </p>
                        {task.dueDate && reason !== "review" && (
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "6px" }}>
                            <Clock size={10} style={{ color: m.color }} />
                            <span style={{ fontSize: "10px", color: m.color, fontWeight: 600 }}>
                              {new Date(task.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </span>
                          </div>
                        )}
                        <button
                          onClick={() => goToTask(task.id)}
                          style={{
                            fontSize: "11px", fontWeight: 600, padding: "4px 10px", borderRadius: "7px",
                            border: `1px solid ${m.color}`, background: "none",
                            color: m.color, cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          Go to task →
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Regular notifications */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
              <RefreshCw size={18} className="animate-spin" style={{ margin: "0 auto 6px", display: "block" }} />
              <span style={{ fontSize: "12px" }}>Loading…</span>
            </div>
          ) : notifications.length === 0 && activeAlerts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-muted)" }}>
              <Bell size={32} style={{ margin: "0 auto 10px", display: "block", opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: "13px" }}>You're all caught up!</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => { if (!n.read) markRead(n.id); }}
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border)",
                  background: n.read ? "transparent" : "var(--accent-light)",
                  cursor: n.read ? "default" : "pointer",
                  display: "flex", gap: "10px", alignItems: "flex-start",
                  transition: "background 0.15s",
                }}
              >
                <span style={{ fontSize: "18px", flexShrink: 0, marginTop: "2px" }}>{typeIcon(n.type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                    <p style={{ margin: "0 0 3px", fontSize: "12px", fontWeight: n.read ? 400 : 600, color: "var(--text-primary)", lineHeight: 1.4 }}>
                      {n.title}
                    </p>
                    {!n.read && (
                      <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--accent)", flexShrink: 0, marginTop: "4px" }} />
                    )}
                  </div>
                  <p style={{ margin: "0 0 4px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.4 }}>{n.message}</p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{timeAgo(n.createdAt)}</span>
                    {n.task?.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); goToTask(n.task!.id); }}
                        style={{
                          fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "6px",
                          border: "1px solid var(--border)", background: "none",
                          color: "var(--accent)", cursor: "pointer", fontFamily: "inherit",
                          flexShrink: 0,
                        }}
                      >
                        Go to task →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );

  return createPortal(panel, document.body);
}
