"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, CheckCheck, RefreshCw, X } from "lucide-react";

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

export function NotificationPanel() {
  const [mounted, setMounted]           = useState(false);
  const [open, setOpen]                 = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount]   = useState(0);
  const [loading, setLoading]           = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Listen for sidebar toggle event
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
    }
    setLoading(false);
  }, []);

  // Poll unread count every 30s
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => {
      fetch("/api/notifications")
        .then((r) => r.json())
        .then((d) => {
          setUnreadCount(d.unreadCount ?? 0);
          if (open) { setNotifications(d.notifications ?? []); }
        })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, [open, fetchNotifications]);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

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
      task_assigned: "📋",
      task_comment:  "💬",
      task_updated:  "✏️",
    };
    return icons[type] ?? "🔔";
  }

  if (!mounted) return null;

  const panel = (
    <>
      {/* Bell button — fixed top-right, left of task button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          top: "14px",
          right: open ? "420px" : "58px",
          zIndex: 9993,
          width: "36px",
          height: "36px",
          borderRadius: "10px",
          border: "1px solid var(--border)",
          background: open ? "var(--accent)" : "var(--bg-card)",
          color: open ? "#fff" : "var(--text-primary)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          transition: "right 0.28s cubic-bezier(0.34,1.06,0.64,1), background 0.15s, color 0.15s",
        }}
        title="Notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: "-5px", right: "-5px",
            minWidth: "16px", height: "16px", borderRadius: "8px",
            background: "#ef4444", color: "#fff",
            fontSize: "9px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px", border: "2px solid var(--bg-card)",
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Overlay */}
      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,0,0,0.2)" }} />
      )}

      {/* Drawer */}
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
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
              <RefreshCw size={18} className="animate-spin" style={{ margin: "0 auto 6px", display: "block" }} />
              <span style={{ fontSize: "12px" }}>Loading…</span>
            </div>
          ) : notifications.length === 0 ? (
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
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{timeAgo(n.createdAt)}</span>
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
