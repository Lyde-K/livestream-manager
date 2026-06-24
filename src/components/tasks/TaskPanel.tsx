"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, Calendar, CheckCircle2, ChevronDown, Circle,
  Clock, ExternalLink, Link2, MessageSquare, Plus, RefreshCw,
  Send, Trash2, Users, X, ClipboardList,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TaskUser { id: string; name: string; email?: string; }
interface TeamMember { userId: string; role: string; user: TaskUser; }
interface Team { id: string; name: string; description?: string | null; members: TeamMember[]; }
interface TaskAssignee { userId: string; user: TaskUser; }
interface Task {
  id: string;
  title: string;
  description?: string | null;
  link?: string | null;
  status: string;
  priority: string;
  dueDate?: string | null;
  createdBy?: TaskUser | null;
  assignees: TaskAssignee[];
  team?: { id: string; name: string } | null;
  _count: { comments: number };
}
interface Comment { id: string; content: string; createdAt: string; user?: TaskUser | null; }

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  todo:        { label: "To Do",       color: "#64748b", bg: "rgba(100,116,139,.15)", Icon: Circle },
  in_progress: { label: "In Progress", color: "#F97316", bg: "rgba(249,115,22,.15)",  Icon: RefreshCw },
  in_review:   { label: "In Review",   color: "#8B5CF6", bg: "rgba(139,92,246,.15)",  Icon: Clock },
  done:        { label: "Done",        color: "#10b981", bg: "rgba(16,185,129,.15)",   Icon: CheckCircle2 },
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

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", fontSize: "12px", padding: "6px 10px", borderRadius: "8px",
  border: "1px solid var(--border)", background: "var(--bg-subtle)",
  color: "var(--text-primary)", outline: "none", fontFamily: "inherit",
  boxSizing: "border-box",
};

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

// ── Task Card ─────────────────────────────────────────────────────────────────

function TaskCard({
  task, onStatusChange, onDelete, onSelect, selected,
}: {
  task: Task;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const sm = STATUS_META[task.status] ?? STATUS_META.todo;
  const pm = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;
  const isOverdue = task.dueDate && task.status !== "done" && new Date(task.dueDate) < new Date();
  const NEXT: Record<string, string> = { todo: "in_progress", in_progress: "in_review", in_review: "done", done: "todo" };

  return (
    <div
      onClick={() => onSelect(task.id)}
      style={{
        background: selected ? "var(--bg-elevated)" : "var(--bg-card)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "10px", padding: "10px 12px", cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s", marginBottom: "6px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
        <button
          onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, NEXT[task.status] ?? "todo"); }}
          title={`Mark as ${NEXT[task.status]}`}
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
            {task.team && PILL(`🏷 ${task.team.name}`, "#8B5CF6", "rgba(139,92,246,.12)")}
            {task.dueDate && (
              <span style={{ fontSize: "10px", color: isOverdue ? "#ef4444" : "var(--text-muted)", display: "flex", alignItems: "center", gap: "3px" }}>
                {isOverdue && <AlertTriangle size={9} />}<Calendar size={9} />
                {new Date(task.dueDate).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
              </span>
            )}
            {task._count.comments > 0 && (
              <span style={{ fontSize: "10px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "3px" }}>
                <MessageSquare size={9} /> {task._count.comments}
              </span>
            )}
            {task.link && <Link2 size={9} style={{ color: "var(--accent)" }} />}
          </div>

          {task.assignees.length > 0 && (
            <div style={{ display: "flex", gap: "3px", marginTop: "6px", alignItems: "center" }}>
              {task.assignees.slice(0, 5).map((a) => <Avatar key={a.userId} name={a.user.name} size={18} />)}
              {task.assignees.length > 5 && <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>+{task.assignees.length - 5}</span>}
            </div>
          )}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px", flexShrink: 0, opacity: 0.6 }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Add Task Form ─────────────────────────────────────────────────────────────

function AddTaskForm({
  users, currentUserId, teams, onAdd, onCancel,
}: {
  users: TaskUser[];
  currentUserId: string;
  teams: Team[];
  onAdd: (data: { title: string; description: string; link: string; priority: string; dueDate: string; assigneeIds: string[]; teamId: string }) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
}) {
  const [title, setTitle]           = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink]             = useState("");
  const [priority, setPriority]     = useState("medium");
  const [dueDate, setDueDate]       = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([currentUserId]);
  const [teamId, setTeamId]         = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function submit() {
    if (!title.trim() || loading) return;
    setLoading(true);
    setError("");
    const result = await onAdd({ title, description, link, priority, dueDate, assigneeIds, teamId });
    setLoading(false);
    if (!result.ok) setError(result.error ?? "Failed to add task. Please run the database migration first.");
  }

  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px", marginBottom: "8px" }}>
      {/* Title */}
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title…"
        onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) submit(); if (e.key === "Escape") onCancel(); }}
        style={{ ...INPUT_STYLE, border: "none", background: "none", fontSize: "13px", fontWeight: 500, padding: "0 0 8px 0", marginBottom: "8px", borderBottom: "1px solid var(--border)", borderRadius: 0 }}
      />

      {/* Description */}
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Add a remark or description… (optional)"
        rows={2}
        style={{ ...INPUT_STYLE, resize: "none", marginBottom: "8px" }}
      />

      {/* Link */}
      <div style={{ position: "relative", marginBottom: "8px" }}>
        <Link2 size={12} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Relevant link… (optional)"
          style={{ ...INPUT_STYLE, paddingLeft: "28px" }}
        />
      </div>

      {/* Priority + Date */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}
          style={{ fontSize: "11px", padding: "4px 7px", borderRadius: "7px", border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--text-secondary)", fontFamily: "inherit" }}>
          {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
          style={{ fontSize: "11px", padding: "4px 7px", borderRadius: "7px", border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--text-secondary)", fontFamily: "inherit" }} />
        {teams.length > 0 && (
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}
            style={{ fontSize: "11px", padding: "4px 7px", borderRadius: "7px", border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--text-secondary)", fontFamily: "inherit" }}>
            <option value="">No team</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {/* Assignees */}
      <div style={{ marginBottom: "10px" }}>
        <p style={{ margin: "0 0 5px", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Assign to</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            const active = assigneeIds.includes(u.id);
            return (
              <button key={u.id} onClick={() => toggleAssignee(u.id)}
                style={{
                  fontSize: "11px", padding: "3px 8px", borderRadius: "20px",
                  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                  background: active ? "var(--accent-light)" : "none",
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                {isSelf ? "Me" : u.name}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p style={{ margin: "0 0 8px", fontSize: "11px", color: "#ef4444" }}>{error}</p>}

      <div style={{ display: "flex", gap: "6px" }}>
        <button onClick={submit} disabled={!title.trim() || loading}
          style={{
            fontSize: "12px", padding: "5px 12px", borderRadius: "7px", border: "none",
            background: title.trim() && !loading ? "var(--accent)" : "var(--bg-subtle)",
            color: title.trim() && !loading ? "#fff" : "var(--text-muted)",
            cursor: title.trim() && !loading ? "pointer" : "default", fontFamily: "inherit", fontWeight: 600,
          }}>
          {loading ? "Adding…" : "Add Task"}
        </button>
        <button onClick={onCancel}
          style={{ fontSize: "12px", padding: "5px 10px", borderRadius: "7px", border: "1px solid var(--border)", background: "none", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Task Detail ───────────────────────────────────────────────────────────────

function TaskDetail({
  task, onClose, onUpdate,
}: {
  task: Task;
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
        <h3 style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", flex: 1, lineHeight: 1.4 }}>{task.title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px" }}><X size={14} /></button>
      </div>

      {task.description && (
        <p style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, background: "var(--bg-subtle)", borderRadius: "7px", padding: "7px 10px" }}>
          {task.description}
        </p>
      )}

      {task.link && (
        <a href={task.link} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--accent)", marginBottom: "10px", textDecoration: "none" }}>
          <ExternalLink size={11} /> {task.link.length > 50 ? task.link.slice(0, 47) + "…" : task.link}
        </a>
      )}

      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "10px" }}>
        {Object.entries(STATUS_META).map(([k, v]) => (
          <button key={k} onClick={() => changeStatus(k)}
            style={{
              fontSize: "11px", padding: "3px 8px", borderRadius: "20px",
              border: `1px solid ${task.status === k ? v.color : "var(--border)"}`,
              background: task.status === k ? v.bg : "none",
              color: task.status === k ? v.color : "var(--text-muted)",
              cursor: "pointer", fontFamily: "inherit",
            }}>
            {v.label}
          </button>
        ))}
      </div>

      {task.assignees.length > 0 && (
        <div style={{ marginBottom: "10px" }}>
          <p style={{ margin: "0 0 5px", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Assigned to</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {task.assignees.map((a) => (
              <div key={a.userId} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <Avatar name={a.user.name} size={20} />
                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{a.user.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Comments {comments.length > 0 && `(${comments.length})`}
      </p>
      <div style={{ maxHeight: "160px", overflowY: "auto", marginBottom: "8px" }}>
        {comments.length === 0 && <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>No comments yet.</p>}
        {comments.map((c) => (
          <div key={c.id} style={{ marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "3px" }}>
              {c.user && <Avatar name={c.user.name} size={16} />}
              <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-secondary)" }}>{c.user?.name ?? "User"}</span>
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{new Date(c.createdAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}</span>
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
          style={INPUT_STYLE}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
        />
        <button onClick={sendComment} disabled={!commentText.trim() || sending}
          style={{
            width: "32px", height: "32px", borderRadius: "50%", border: "none",
            background: commentText.trim() ? "var(--accent)" : "var(--bg-subtle)",
            color: commentText.trim() ? "#fff" : "var(--text-muted)",
            cursor: commentText.trim() ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Team Manager ──────────────────────────────────────────────────────────────

function TeamManager({ currentUserId, allUsers, teams, onTeamsChange }: {
  currentUserId: string;
  allUsers: TaskUser[];
  teams: Team[];
  onTeamsChange: (teams: Team[]) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamDesc, setTeamDesc] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function createTeam() {
    if (!teamName.trim() || loading) return;
    setLoading(true);
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: teamName, description: teamDesc, memberIds }),
    });
    if (res.ok) {
      const d = await res.json();
      onTeamsChange([...teams, d.team]);
      setCreating(false);
      setTeamName("");
      setTeamDesc("");
      setMemberIds([]);
    }
    setLoading(false);
  }

  async function deleteTeam(id: string) {
    if (!confirm("Delete this team?")) return;
    const res = await fetch(`/api/teams/${id}`, { method: "DELETE" });
    if (res.ok) onTeamsChange(teams.filter((t) => t.id !== id));
  }

  async function removeMember(teamId: string, userId: string) {
    const res = await fetch(`/api/teams/${teamId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      onTeamsChange(teams.map((t) => t.id === teamId
        ? { ...t, members: t.members.filter((m) => m.userId !== userId) }
        : t));
    }
  }

  async function addMember(teamId: string, userId: string) {
    const res = await fetch(`/api/teams/${teamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const d = await res.json();
      onTeamsChange(teams.map((t) => t.id === teamId ? d.team : t));
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <p style={{ margin: 0, fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)" }}>Teams</p>
        <button onClick={() => setCreating((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", padding: "3px 8px", borderRadius: "7px", border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
          <Plus size={11} /> New Team
        </button>
      </div>

      {creating && (
        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px", marginBottom: "10px" }}>
          <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name…"
            style={{ ...INPUT_STYLE, marginBottom: "6px" }} />
          <input value={teamDesc} onChange={(e) => setTeamDesc(e.target.value)} placeholder="Description… (optional)"
            style={{ ...INPUT_STYLE, marginBottom: "8px" }} />
          <p style={{ margin: "0 0 5px", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Add Members</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "10px" }}>
            {allUsers.filter((u) => u.id !== currentUserId).map((u) => (
              <button key={u.id} onClick={() => setMemberIds((p) => p.includes(u.id) ? p.filter((x) => x !== u.id) : [...p, u.id])}
                style={{
                  fontSize: "11px", padding: "3px 8px", borderRadius: "20px",
                  border: `1px solid ${memberIds.includes(u.id) ? "var(--accent)" : "var(--border)"}`,
                  background: memberIds.includes(u.id) ? "var(--accent-light)" : "none",
                  color: memberIds.includes(u.id) ? "var(--accent)" : "var(--text-secondary)",
                  cursor: "pointer", fontFamily: "inherit",
                }}>{u.name}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={createTeam} disabled={!teamName.trim() || loading}
              style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "7px", border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
              {loading ? "Creating…" : "Create"}
            </button>
            <button onClick={() => setCreating(false)}
              style={{ fontSize: "12px", padding: "5px 10px", borderRadius: "7px", border: "1px solid var(--border)", background: "none", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {teams.length === 0 && !creating && (
        <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 10px" }}>No teams yet. Create one to collaborate with your colleagues.</p>
      )}

      {teams.map((team) => {
        const isOwner = team.members.some((m) => m.userId === currentUserId && m.role === "owner");
        const otherUsers = allUsers.filter((u) => !team.members.some((m) => m.userId === u.id));
        return (
          <div key={team.id} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px", marginBottom: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
              <div>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{team.name}</span>
                {team.description && <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--text-muted)" }}>{team.description}</p>}
              </div>
              {isOwner && (
                <button onClick={() => deleteTeam(team.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px" }}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: isOwner && otherUsers.length > 0 ? "6px" : 0 }}>
              {team.members.map((m) => (
                <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", padding: "2px 8px", borderRadius: "20px", background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
                  <Avatar name={m.user.name} size={14} />
                  <span style={{ color: "var(--text-secondary)" }}>{m.userId === currentUserId ? "Me" : m.user.name}</span>
                  {m.role === "owner" && <span style={{ color: "var(--accent)", fontSize: "9px" }}>owner</span>}
                  {isOwner && m.userId !== currentUserId && (
                    <button onClick={() => removeMember(team.id, m.userId)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "0 0 0 2px", display: "flex" }}>
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {isOwner && otherUsers.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Add:</span>
                {otherUsers.slice(0, 6).map((u) => (
                  <button key={u.id} onClick={() => addMember(team.id, u.id)}
                    style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "20px", border: "1px dashed var(--border)", background: "none", color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" }}>
                    + {u.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main TaskPanel ─────────────────────────────────────────────────────────────

interface Props { userId: string; userRole: string; }

export function TaskPanel({ userId, userRole }: Props) {
  const [mounted, setMounted]           = useState(false);
  const [open, setOpen]                 = useState(false);
  const [tab, setTab]                   = useState<"mine" | "all" | "teams">("mine");
  const [tasks, setTasks]               = useState<Task[]>([]);
  const [loading, setLoading]           = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [teamFilter, setTeamFilter]     = useState("all");
  const [showAdd, setShowAdd]           = useState(false);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [users, setUsers]               = useState<TaskUser[]>([]);
  const [teams, setTeams]               = useState<Team[]>([]);

  useEffect(() => { setMounted(true); }, []);

  // Listen for sidebar toggle event
  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("toggle-task-panel", handler);
    return () => window.removeEventListener("toggle-task-panel", handler);
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tab === "mine") params.set("mine", "true");
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    if (teamFilter !== "all") params.set("teamId", teamFilter);
    const res = await fetch(`/api/tasks?${params}`);
    if (res.ok) { const d = await res.json(); setTasks(d.tasks ?? []); }
    setLoading(false);
  }, [tab, statusFilter, priorityFilter, teamFilter]);

  useEffect(() => {
    if (open && tab !== "teams") fetchTasks();
  }, [open, fetchTasks, tab]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []));
    fetch("/api/teams")
      .then((r) => r.json())
      .then((d) => setTeams(d.teams ?? []));
  }, [open]);

  async function handleAddTask(data: { title: string; description: string; link: string; priority: string; dueDate: string; assigneeIds: string[]; teamId: string }) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title,
        description: data.description || null,
        link: data.link || null,
        priority: data.priority,
        dueDate: data.dueDate || null,
        assigneeIds: data.assigneeIds,
        teamId: data.teamId || null,
      }),
    });
    if (res.ok) {
      setShowAdd(false);
      fetchTasks();
      return { ok: true };
    }
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.error ?? `Server error ${res.status}` };
  }

  async function handleStatusChange(id: string, status: string) {
    const res = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (res.ok) { const d = await res.json(); setTasks((prev) => prev.map((t) => t.id === id ? d.task : t)); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this task?")) return;
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (res.ok) { setTasks((prev) => prev.filter((t) => t.id !== id)); setSelectedId(null); }
  }

  const openCount = tasks.filter((t) => t.status !== "done").length;
  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;

  if (!mounted) return null;

  const TABS: { key: "mine" | "all" | "teams"; label: string }[] = [
    { key: "mine",  label: "My Tasks" },
    { key: "all",   label: "All Tasks" },
    { key: "teams", label: "Teams" },
  ];

  const panel = (
    <>
      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,0,0,0.2)" }} />
      )}

      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 9991,
        width: "380px", maxWidth: "95vw",
        background: "var(--bg-card)", borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.34,1.06,0.64,1)",
        boxShadow: open ? "-8px 0 32px rgba(0,0,0,0.18)" : "none",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 16px 0", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <ClipboardList size={16} style={{ color: "var(--accent)" }} />
              <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>Tasks</span>
              {openCount > 0 && (
                <span style={{ fontSize: "10px", fontWeight: 600, padding: "1px 6px", borderRadius: "20px", background: "var(--accent-light)", color: "var(--accent)" }}>
                  {openCount} open
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              {tab !== "teams" && (
                <button onClick={() => setShowAdd((s) => !s)}
                  style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", padding: "4px 10px", borderRadius: "7px", border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                  <Plus size={12} /> Add
                </button>
              )}
              <button onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginBottom: "-1px" }}>
            {TABS.map((t) => (
              <button key={t.key} onClick={() => { setTab(t.key); setSelectedId(null); setShowAdd(false); }}
                style={{
                  fontSize: "12px", padding: "6px 12px", border: "none", background: "none",
                  cursor: "pointer", fontFamily: "inherit", fontWeight: tab === t.key ? 600 : 400,
                  color: tab === t.key ? "var(--accent)" : "var(--text-muted)",
                  borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {/* Teams tab */}
          {tab === "teams" && (
            <TeamManager
              currentUserId={userId}
              allUsers={users}
              teams={teams}
              onTeamsChange={setTeams}
            />
          )}

          {/* Task tabs */}
          {tab !== "teams" && (
            <>
              {/* Filters */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ fontSize: "11px", padding: "3px 6px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--text-secondary)", fontFamily: "inherit" }}>
                  <option value="all">All status</option>
                  {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}
                  style={{ fontSize: "11px", padding: "3px 6px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--text-secondary)", fontFamily: "inherit" }}>
                  <option value="all">All priority</option>
                  {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                {teams.length > 0 && (
                  <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}
                    style={{ fontSize: "11px", padding: "3px 6px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--text-secondary)", fontFamily: "inherit" }}>
                    <option value="all">All teams</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                <button onClick={fetchTasks}
                  style={{ background: "none", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", padding: "3px 8px", color: "var(--text-muted)" }}>
                  <RefreshCw size={11} />
                </button>
              </div>

              {/* Add form */}
              {showAdd && (
                <AddTaskForm
                  users={users}
                  currentUserId={userId}
                  teams={teams}
                  onAdd={handleAddTask}
                  onCancel={() => setShowAdd(false)}
                />
              )}

              {/* Task list */}
              {loading ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)" }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: "0 auto 6px", display: "block" }} />
                  <span style={{ fontSize: "12px" }}>Loading…</span>
                </div>
              ) : tasks.length === 0 ? (
                <p style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", padding: "24px 0" }}>
                  {tab === "mine" ? "No tasks assigned to you." : "No tasks found."}
                </p>
              ) : (
                tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                    onSelect={(id) => setSelectedId((prev) => prev === id ? null : id)}
                    selected={selectedId === task.id}
                  />
                ))
              )}

              {/* Task detail */}
              {selectedTask && (
                <TaskDetail
                  task={selectedTask}
                  onClose={() => setSelectedId(null)}
                  onUpdate={(updated) => setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t))}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(panel, document.body);
}
