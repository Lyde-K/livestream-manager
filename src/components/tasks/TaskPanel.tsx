"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, Calendar, CheckCircle2, ChevronDown, Circle,
  Clock, MessageSquare, Plus, RefreshCw, Send, Trash2, X,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TaskUser { id: string; name: string; email?: string; }
interface TaskAssignee { userId: string; user: TaskUser; }
interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate?: string | null;
  createdBy?: TaskUser | null;
  assignees: TaskAssignee[];
  _count: { comments: number };
}
interface Comment { id: string; content: string; createdAt: string; user?: TaskUser | null; }

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  todo:        { label: "To Do",      color: "#64748b", bg: "rgba(100,116,139,.15)", Icon: Circle },
  in_progress: { label: "In Progress",color: "#F97316", bg: "rgba(249,115,22,.15)",  Icon: RefreshCw },
  in_review:   { label: "In Review",  color: "#8B5CF6", bg: "rgba(139,92,246,.15)",  Icon: Clock },
  done:        { label: "Done",       color: "#10b981", bg: "rgba(16,185,129,.15)",   Icon: CheckCircle2 },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  low:    { label: "Low",    color: "#64748b" },
  medium: { label: "Medium", color: "#f59e0b" },
  high:   { label: "High",   color: "#f97316" },
  urgent: { label: "Urgent", color: "#ef4444" },
};

const PILL = (text: string, color: string, bg: string) => (
  <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "20px", background: bg, color, letterSpacing: "0.03em", whiteSpace: "nowrap" as const }}>
    {text}
  </span>
);

// ── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const hue = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `hsl(${hue},55%,45%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 600, color: "#fff", flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

// ── Task card ─────────────────────────────────────────────────────────────────

function TaskCard({
  task, currentUserId, onStatusChange, onDelete, onSelect, selected,
}: {
  task: Task;
  currentUserId: string;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const sm = STATUS_META[task.status] ?? STATUS_META.todo;
  const pm = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;
  const isOverdue = task.dueDate && task.status !== "done" && new Date(task.dueDate) < new Date();

  const NEXT_STATUS: Record<string, string> = { todo: "in_progress", in_progress: "in_review", in_review: "done", done: "todo" };

  return (
    <div
      onClick={() => onSelect(task.id)}
      style={{
        background: selected ? "var(--bg-elevated)" : "var(--bg-card)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "10px", padding: "10px 12px", cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
        marginBottom: "6px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
        {/* Status toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, NEXT_STATUS[task.status] ?? "todo"); }}
          title={`Mark as ${NEXT_STATUS[task.status]}`}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: sm.color, flexShrink: 0, marginTop: "1px" }}
        >
          <sm.Icon size={15} />
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: "0 0 5px", fontSize: "13px", fontWeight: 500,
            color: task.status === "done" ? "var(--text-muted)" : "var(--text-primary)",
            textDecoration: task.status === "done" ? "line-through" : "none",
            lineHeight: 1.4, wordBreak: "break-word",
          }}>
            {task.title}
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "center" }}>
            {PILL(sm.label, sm.color, sm.bg)}
            {PILL(pm.label, pm.color, `${pm.color}22`)}
            {task.dueDate && (
              <span style={{ fontSize: "10px", color: isOverdue ? "#ef4444" : "var(--text-muted)", display: "flex", alignItems: "center", gap: "3px" }}>
                {isOverdue && <AlertTriangle size={9} />}
                <Calendar size={9} />
                {new Date(task.dueDate).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
              </span>
            )}
            {task._count.comments > 0 && (
              <span style={{ fontSize: "10px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "3px" }}>
                <MessageSquare size={9} /> {task._count.comments}
              </span>
            )}
          </div>

          {task.assignees.length > 0 && (
            <div style={{ display: "flex", gap: "3px", marginTop: "6px", alignItems: "center" }}>
              {task.assignees.slice(0, 5).map((a) => (
                <Avatar key={a.userId} name={a.user.name} size={18} />
              ))}
              {task.assignees.length > 5 && (
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>+{task.assignees.length - 5}</span>
              )}
            </div>
          )}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px", flexShrink: 0, opacity: 0.6 }}
          title="Delete task"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Add Task Form ─────────────────────────────────────────────────────────────

function AddTaskForm({
  users, currentUserId, onAdd, onCancel,
}: {
  users: TaskUser[];
  currentUserId: string;
  onAdd: (data: { title: string; priority: string; dueDate: string; assigneeIds: string[] }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([currentUserId]);

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px", marginBottom: "8px" }}>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title…"
        onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) onAdd({ title, priority, dueDate, assigneeIds }); if (e.key === "Escape") onCancel(); }}
        style={{
          width: "100%", background: "none", border: "none", outline: "none",
          fontSize: "13px", color: "var(--text-primary)", fontFamily: "inherit",
          marginBottom: "10px", padding: 0, boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          style={{ fontSize: "11px", padding: "3px 6px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--text-secondary)", fontFamily: "inherit" }}
        >
          {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          style={{ fontSize: "11px", padding: "3px 6px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--text-secondary)", fontFamily: "inherit" }}
        />
      </div>

      {users.length > 0 && (
        <div style={{ marginBottom: "10px" }}>
          <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Assign to</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => toggleAssignee(u.id)}
                style={{
                  fontSize: "11px", padding: "3px 8px", borderRadius: "20px",
                  border: `1px solid ${assigneeIds.includes(u.id) ? "var(--accent)" : "var(--border)"}`,
                  background: assigneeIds.includes(u.id) ? "var(--accent-light)" : "none",
                  color: assigneeIds.includes(u.id) ? "var(--accent)" : "var(--text-secondary)",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {u.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "6px" }}>
        <button
          onClick={() => { if (title.trim()) onAdd({ title, priority, dueDate, assigneeIds }); }}
          disabled={!title.trim()}
          style={{
            fontSize: "12px", padding: "5px 12px", borderRadius: "7px", border: "none",
            background: title.trim() ? "var(--accent)" : "var(--bg-subtle)",
            color: title.trim() ? "#fff" : "var(--text-muted)",
            cursor: title.trim() ? "pointer" : "default", fontFamily: "inherit", fontWeight: 600,
          }}
        >
          Add Task
        </button>
        <button
          onClick={onCancel}
          style={{ fontSize: "12px", padding: "5px 10px", borderRadius: "7px", border: "1px solid var(--border)", background: "none", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Task Detail ───────────────────────────────────────────────────────────────

function TaskDetail({
  task, currentUserId, onClose, onUpdate,
}: {
  task: Task;
  currentUserId: string;
  onClose: () => void;
  onUpdate: (updated: Task) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const sm = STATUS_META[task.status] ?? STATUS_META.todo;

  useEffect(() => {
    fetch(`/api/tasks/${task.id}/comments`)
      .then((r) => r.json())
      .then((d) => setComments(d.comments ?? []));
  }, [task.id]);

  async function changeStatus(status: string) {
    const res = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (res.ok) { const d = await res.json(); onUpdate(d.task); }
  }

  async function sendComment() {
    if (!commentText.trim() || sending) return;
    setSending(true);
    const res = await fetch(`/api/tasks/${task.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: commentText }) });
    if (res.ok) {
      const d = await res.json();
      setComments((c) => [...c, d.comment]);
      setCommentText("");
    }
    setSending(false);
  }

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginTop: "6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <h3 style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", flex: 1, lineHeight: 1.4 }}>{task.title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px" }}>
          <X size={14} />
        </button>
      </div>

      {task.description && (
        <p style={{ margin: "0 0 10px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{task.description}</p>
      )}

      <div style={{ marginBottom: "10px" }}>
        <p style={{ margin: "0 0 5px", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</p>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <button
              key={k}
              onClick={() => changeStatus(k)}
              style={{
                fontSize: "11px", padding: "3px 8px", borderRadius: "20px",
                border: `1px solid ${task.status === k ? v.color : "var(--border)"}`,
                background: task.status === k ? v.bg : "none",
                color: task.status === k ? v.color : "var(--text-muted)",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: "12px" }}>
        <p style={{ margin: "0 0 5px", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Assigned to</p>
        {task.assignees.length > 0 ? (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {task.assignees.map((a) => (
              <div key={a.userId} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <Avatar name={a.user.name} size={20} />
                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{a.user.name}</span>
              </div>
            ))}
          </div>
        ) : <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>No assignees</span>}
      </div>

      {/* Comments */}
      <p style={{ margin: "0 0 8px", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Comments {comments.length > 0 && `(${comments.length})`}
      </p>
      <div style={{ maxHeight: "160px", overflowY: "auto", marginBottom: "8px" }}>
        {comments.length === 0 && (
          <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>No comments yet.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} style={{ marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "3px" }}>
              {c.user && <Avatar name={c.user.name} size={16} />}
              <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-secondary)" }}>{c.user?.name ?? "User"}</span>
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                {new Date(c.createdAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)", paddingLeft: "21px", lineHeight: 1.4 }}>{c.content}</p>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "6px" }}>
        <input
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") sendComment(); }}
          placeholder="Add a comment…"
          style={{
            flex: 1, fontSize: "12px", padding: "6px 10px", borderRadius: "8px",
            border: "1px solid var(--border)", background: "var(--bg-subtle)",
            color: "var(--text-primary)", outline: "none", fontFamily: "inherit",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
        />
        <button
          onClick={sendComment}
          disabled={!commentText.trim() || sending}
          style={{
            width: "30px", height: "30px", borderRadius: "50%", border: "none",
            background: commentText.trim() ? "var(--accent)" : "var(--bg-subtle)",
            color: commentText.trim() ? "#fff" : "var(--text-muted)",
            cursor: commentText.trim() ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Main TaskPanel ─────────────────────────────────────────────────────────────

interface Props { userId: string; userRole: string; }

export function TaskPanel({ userId, userRole }: Props) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [users, setUsers] = useState<TaskUser[]>([]);

  useEffect(() => { setMounted(true); }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tab === "mine") params.set("mine", "true");
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    const res = await fetch(`/api/tasks?${params}`);
    if (res.ok) { const d = await res.json(); setTasks(d.tasks ?? []); }
    setLoading(false);
  }, [tab, statusFilter, priorityFilter]);

  useEffect(() => {
    if (open) fetchTasks();
  }, [open, fetchTasks]);

  useEffect(() => {
    if (open && userRole === "ADMIN") {
      fetch("/api/admin/users")
        .then((r) => r.json())
        .then((d) => setUsers((d.users ?? []).map((u: { id: string; name: string; email: string }) => ({ id: u.id, name: u.name, email: u.email }))));
    }
  }, [open, userRole]);

  async function handleAddTask(data: { title: string; priority: string; dueDate: string; assigneeIds: string[] }) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title,
        priority: data.priority,
        dueDate: data.dueDate || null,
        assigneeIds: data.assigneeIds,
      }),
    });
    if (res.ok) { setShowAdd(false); fetchTasks(); }
  }

  async function handleStatusChange(id: string, status: string) {
    const res = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (res.ok) {
      const d = await res.json();
      setTasks((prev) => prev.map((t) => t.id === id ? d.task : t));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this task?")) return;
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (res.ok) { setTasks((prev) => prev.filter((t) => t.id !== id)); setSelectedId(null); }
  }

  const openCount = tasks.filter((t) => t.status !== "done").length;
  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;

  if (!mounted) return null;

  const panel = (
    <>
      {/* Overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,0,0,0.2)" }}
        />
      )}

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 9991,
        width: "360px", maxWidth: "90vw",
        background: "var(--bg-card)",
        borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.34,1.06,0.64,1)",
        boxShadow: open ? "-8px 0 32px rgba(0,0,0,0.18)" : "none",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 16px 0", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <div>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>Tasks</span>
              {openCount > 0 && (
                <span style={{ marginLeft: "7px", fontSize: "10px", fontWeight: 600, padding: "1px 6px", borderRadius: "20px", background: "var(--accent-light)", color: "var(--accent)" }}>
                  {openCount} open
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => setShowAdd((s) => !s)}
                style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", padding: "4px 10px", borderRadius: "7px", border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
              >
                <Plus size={12} /> Add
              </button>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0 }}>
            {([["mine", "My Tasks"], ["all", "All Tasks"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  fontSize: "12px", fontWeight: 500, padding: "6px 12px", background: "none",
                  border: "none", borderBottom: `2px solid ${tab === key ? "var(--accent)" : "transparent"}`,
                  color: tab === key ? "var(--accent)" : "var(--text-secondary)",
                  cursor: "pointer", fontFamily: "inherit", transition: "color 0.15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ display: "flex", gap: "6px", padding: "10px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ flex: 1, fontSize: "11px", padding: "4px 6px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--text-secondary)", fontFamily: "inherit" }}
          >
            <option value="all">All statuses</option>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            style={{ flex: 1, fontSize: "11px", padding: "4px 6px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--text-secondary)", fontFamily: "inherit" }}
          >
            <option value="all">All priorities</option>
            {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={fetchTasks} style={{ background: "none", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", color: "var(--text-muted)", padding: "4px 6px" }}>
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
          {showAdd && (
            <AddTaskForm
              users={users}
              currentUserId={userId}
              onAdd={handleAddTask}
              onCancel={() => setShowAdd(false)}
            />
          )}

          {loading && tasks.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)", fontSize: "12px" }}>Loading…</div>
          )}

          {!loading && tasks.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <CheckCircle2 size={28} style={{ color: "var(--text-muted)", opacity: 0.3, margin: "0 auto 8px" }} />
              <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>No tasks here</p>
              <button onClick={() => setShowAdd(true)} style={{ marginTop: "8px", fontSize: "11px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                + Add a task
              </button>
            </div>
          )}

          {tasks.map((task) => (
            <div key={task.id}>
              <TaskCard
                task={task}
                currentUserId={userId}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
                selected={selectedId === task.id}
              />
              {selectedId === task.id && (
                <div style={{ background: "var(--bg-subtle)", borderRadius: "10px", padding: "10px 12px", marginBottom: "6px", border: "1px solid var(--border)" }}>
                  <TaskDetail
                    task={task}
                    currentUserId={userId}
                    onClose={() => setSelectedId(null)}
                    onUpdate={(updated) => setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t))}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Toggle trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Task Manager"
        aria-label="Toggle task panel"
        style={{
          position: "fixed",
          top: "14px",
          right: open ? "374px" : "16px",
          zIndex: 9992,
          display: "flex", alignItems: "center", gap: "6px",
          padding: "7px 12px",
          borderRadius: "8px",
          border: "1px solid var(--border)",
          background: "var(--bg-elevated)",
          color: "var(--text-secondary)",
          cursor: "pointer", fontSize: "12px", fontWeight: 600,
          fontFamily: "inherit",
          boxShadow: "var(--shadow-sm)",
          transition: "right 0.28s cubic-bezier(0.34,1.06,0.64,1), background 0.15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
      >
        <CheckCircle2 size={14} />
        Tasks
        {openCount > 0 && (
          <span style={{ fontSize: "10px", fontWeight: 700, padding: "1px 5px", borderRadius: "20px", background: "var(--accent)", color: "#fff", marginLeft: "2px" }}>
            {openCount}
          </span>
        )}
      </button>
    </>
  );

  return createPortal(panel, document.body);
}
