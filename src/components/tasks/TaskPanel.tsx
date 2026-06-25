"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, Calendar, CheckCircle2, Circle, Clock,
  ExternalLink, Link2, MessageSquare, Plus, RefreshCw,
  Send, Trash2, X, ClipboardList, Eye, UserCheck,
  Maximize2, Minimize2, Search, Tag, Pencil, Check, RotateCcw,
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
  labels?: string;
  parentId?: string | null;
  recurrence?: string | null;
  nextRecurAt?: string | null;
  createdBy?: TaskUser | null;
  assignees: TaskAssignee[];
  team?: { id: string; name: string } | null;
  _count: { comments: number; children?: number };
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

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", fontSize: "12px", padding: "6px 10px", borderRadius: "8px",
  border: "1px solid var(--border-strong)", background: "var(--bg-subtle)",
  color: "var(--text-primary)", outline: "none", fontFamily: "inherit",
  boxSizing: "border-box",
};

function parseLabels(labels?: string | null): string[] {
  try { return JSON.parse(labels || "[]"); } catch { return []; }
}

function labelColor(label: string): string {
  const colors = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];
  return colors[label.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length];
}

const STATUS_NEXT: Record<string, string> = { todo: "in_progress", in_progress: "in_review", in_review: "done", done: "todo" };

const PILL = (text: string, color: string, bg: string) => (
  <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "20px", background: bg, color, letterSpacing: "0.03em", whiteSpace: "nowrap" as const }}>
    {text}
  </span>
);

// ── ReviewChoiceModal ─────────────────────────────────────────────────────────

function ReviewChoiceModal({ taskTitle, onReview, onDone, onCancel }: {
  taskTitle: string;
  onReview: () => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  return createPortal(
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 360, background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 16, padding: "24px", boxShadow: "0 24px 80px rgba(0,0,0,0.4)" }}>
        <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>Complete Task</p>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          How would you like to progress <strong style={{ color: "var(--text-primary)" }}>&ldquo;{taskTitle}&rdquo;</strong>?
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={onReview} style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid rgba(139,92,246,0.4)", background: "rgba(139,92,246,0.10)", color: "#a78bfa", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={14} />
            <div>
              <div>Send for Review</div>
              <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>Notify the team owner to review this task</div>
            </div>
          </button>
          <button onClick={onDone} style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.10)", color: "#34d399", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={14} />
            <div>
              <div>Mark as Done</div>
              <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>Skip review and complete immediately</div>
            </div>
          </button>
          <button onClick={onCancel} style={{ padding: "8px", borderRadius: 8, border: "none", background: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const hue = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: `hsl(${hue},55%,45%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 600, color: "#fff", flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({
  task, currentUserId, teams, onStatusChange, onDelete, onSelect, selected, compact = false, draggable: isDraggable = false,
}: {
  task: Task; currentUserId: string; teams: Team[];
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  selected: boolean; compact?: boolean; draggable?: boolean;
}) {
  const [showReviewChoice, setShowReviewChoice] = useState(false);
  const sm = STATUS_META[task.status] ?? STATUS_META.todo;
  const pm = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;
  const isDone    = task.status === "done";
  const isOverdue = task.dueDate && !isDone && task.status !== "in_review" && new Date(task.dueDate) < new Date();
  const labels = parseLabels(task.labels);
  const isAssignee  = task.assignees.some((a) => a.userId === currentUserId);
  const isCreator   = task.createdBy?.id === currentUserId;
  const isTeamOwner = task.team
    ? teams.some((t) => t.id === task.team?.id && t.members.some((m) => m.userId === currentUserId && m.role === "owner"))
    : false;
  const canChange   = isAssignee || isCreator || isTeamOwner;

  function handleStatusClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canChange) return;
    if (task.status === "in_progress") {
      setShowReviewChoice(true);
    } else {
      onStatusChange(task.id, STATUS_NEXT[task.status] ?? "todo");
    }
  }
  const subtaskTotal = task._count.children ?? 0;

  return (
    <div
      draggable={isDraggable}
      onDragStart={(e) => { e.dataTransfer.setData("taskId", task.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={() => onSelect(task.id)}
      style={{
        background: selected ? "var(--accent-light)" : "var(--panel-card-bg)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "10px", padding: compact ? "8px 10px" : "10px 12px",
        cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
        marginBottom: "6px", userSelect: "none",
        opacity: isDone ? 0.45 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
        {showReviewChoice && (
          <ReviewChoiceModal
            taskTitle={task.title}
            onReview={() => { setShowReviewChoice(false); onStatusChange(task.id, "in_review"); }}
            onDone={() => { setShowReviewChoice(false); onStatusChange(task.id, "done"); }}
            onCancel={() => setShowReviewChoice(false)}
          />
        )}
        <button
          onClick={handleStatusClick}
          title={canChange ? (task.status === "in_progress" ? "Complete task…" : `Mark as ${STATUS_NEXT[task.status]}`) : "Only assignees or owner can change status"}
          style={{ background: "none", border: "none", cursor: canChange ? "pointer" : "not-allowed", padding: "2px", color: sm.color, flexShrink: 0, marginTop: "1px", opacity: canChange ? 1 : 0.4 }}
        >
          <sm.Icon size={15} />
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: "0 0 5px", fontSize: compact ? "12px" : "13px", fontWeight: 500,
            color: task.status === "done" ? "var(--text-muted)" : "var(--text-primary)",
            textDecoration: task.status === "done" ? "line-through" : "none",
            lineHeight: 1.4, wordBreak: "break-word",
          }}>
            {task.title}
          </p>

          {!compact && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "center" }}>
              {PILL(sm.label, sm.color, sm.bg)}
              {PILL(pm.label, pm.color, `${pm.color}22`)}
              {task.team && PILL(`🏷 ${task.team.name}`, "#8B5CF6", "rgba(139,92,246,.12)")}
              {labels.map((l) => {
                const c = labelColor(l);
                return <span key={l} style={{ fontSize: "10px", fontWeight: 600, padding: "1px 6px", borderRadius: "20px", background: `${c}22`, color: c }}>#{l}</span>;
              })}
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
              {subtaskTotal > 0 && (
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>✓ {subtaskTotal}</span>
              )}
              {task.link && <Link2 size={9} style={{ color: "var(--accent)" }} />}
              {task.recurrence && <RotateCcw size={9} style={{ color: "var(--accent)" }} />}
            </div>
          )}

          {compact && (
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "10px", fontWeight: 600, color: pm.color }}>{pm.label}</span>
              {task.dueDate && (
                <span style={{ fontSize: "10px", color: isOverdue ? "#ef4444" : "var(--text-muted)" }}>
                  · {new Date(task.dueDate).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
                </span>
              )}
              {labels.slice(0, 2).map((l) => {
                const c = labelColor(l);
                return <span key={l} style={{ fontSize: "10px", padding: "0 5px", borderRadius: "10px", background: `${c}22`, color: c }}>#{l}</span>;
              })}
            </div>
          )}

          {task.assignees.length > 0 && (
            <div style={{ display: "flex", gap: "2px", marginTop: compact ? "4px" : "6px" }}>
              {task.assignees.slice(0, compact ? 3 : 5).map((a) => <Avatar key={a.userId} name={a.user.name} size={compact ? 14 : 18} />)}
              {!compact && task.assignees.length > 5 && <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>+{task.assignees.length - 5}</span>}
            </div>
          )}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px", flexShrink: 0, opacity: 0.5 }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ── KanbanBoard ───────────────────────────────────────────────────────────────

function KanbanBoard({ tasks, currentUserId, teams, onStatusChange, onDelete, onSelect, selectedId }: {
  tasks: Task[]; currentUserId: string; teams: Team[];
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const COLUMNS = ["todo", "in_progress", "in_review", "done"] as const;

  function onDrop(e: React.DragEvent, status: string) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== status) onStatusChange(taskId, status);
    setDragOver(null);
  }

  return (
    <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "8px", minHeight: "300px" }}>
      {COLUMNS.map((status) => {
        const sm = STATUS_META[status];
        const colTasks = tasks.filter((t) => t.status === status);
        const isOver = dragOver === status;
        return (
          <div key={status}
            onDragOver={(e) => { e.preventDefault(); setDragOver(status); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null); }}
            onDrop={(e) => onDrop(e, status)}
            style={{
              flex: "0 0 185px",
              background: isOver ? "var(--bg-elevated)" : "var(--bg-subtle)",
              borderRadius: "10px", padding: "8px",
              border: `1.5px solid ${isOver ? "var(--accent)" : "var(--border)"}`,
              transition: "border-color 0.15s, background 0.15s", minHeight: "200px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "8px" }}>
              <sm.Icon size={11} style={{ color: sm.color }} />
              <span style={{ fontSize: "10px", fontWeight: 700, color: sm.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{sm.label}</span>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "auto", background: "var(--bg-card)", padding: "1px 6px", borderRadius: "10px" }}>{colTasks.length}</span>
            </div>
            {colTasks.map((task) => (
              <TaskCard
                key={task.id} task={task} currentUserId={currentUserId} teams={teams}
                onStatusChange={onStatusChange} onDelete={onDelete}
                onSelect={onSelect} selected={selectedId === task.id} compact draggable
              />
            ))}
            {colTasks.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px 8px", color: "var(--text-muted)", fontSize: "11px", border: "1.5px dashed var(--border)", borderRadius: "8px", opacity: 0.6 }}>
                Drop tasks here
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── SearchOverlay ─────────────────────────────────────────────────────────────

function SearchOverlay({ tasks, onSelect, onClose }: {
  tasks: Task[]; onSelect: (id: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = query.trim()
    ? tasks.filter((t) =>
        t.title.toLowerCase().includes(query.toLowerCase()) ||
        t.description?.toLowerCase().includes(query.toLowerCase()) ||
        parseLabels(t.labels).some((l) => l.includes(query.toLowerCase()))
      ).slice(0, 12)
    : [];

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "14vh" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "540px", maxWidth: "92vw", background: "var(--bg-card)", borderRadius: "14px", border: "1px solid var(--border)", boxShadow: "0 24px 80px rgba(0,0,0,0.45)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <Search size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks…"
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
            style={{ flex: 1, border: "none", outline: "none", background: "none", fontSize: "15px", color: "var(--text-primary)", fontFamily: "inherit" }}
          />
          <kbd style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", border: "1px solid var(--border)", color: "var(--text-muted)", background: "var(--bg-subtle)", fontFamily: "inherit" }}>esc</kbd>
        </div>
        <div style={{ maxHeight: "420px", overflowY: "auto" }}>
          {!query.trim() && (
            <div style={{ padding: "28px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
              Start typing to search tasks…
            </div>
          )}
          {query.trim() && results.length === 0 && (
            <div style={{ padding: "28px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
              No tasks found for "<strong>{query}</strong>"
            </div>
          )}
          {results.map((task) => {
            const sm = STATUS_META[task.status] ?? STATUS_META.todo;
            const pm = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;
            const labels = parseLabels(task.labels);
            return (
              <button key={task.id} onClick={() => { onSelect(task.id); onClose(); }}
                style={{ width: "100%", textAlign: "left", padding: "11px 16px", border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "10px" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
              >
                <sm.Icon size={14} style={{ color: sm.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "13px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</p>
                  <p style={{ margin: 0, fontSize: "11px", color: "var(--text-muted)" }}>
                    {sm.label} · {pm.label}
                    {task.team ? ` · ${task.team.name}` : ""}
                    {task.dueDate ? ` · ${new Date(task.dueDate).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}` : ""}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                  {labels.slice(0, 2).map((l) => {
                    const c = labelColor(l);
                    return <span key={l} style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "10px", background: `${c}22`, color: c }}>#{l}</span>;
                  })}
                  {task.assignees.slice(0, 3).map((a) => <Avatar key={a.userId} name={a.user.name} size={18} />)}
                </div>
              </button>
            );
          })}
        </div>
        {query.trim() && results.length > 0 && (
          <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", fontSize: "11px", color: "var(--text-muted)" }}>
            {results.length} result{results.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── LabelInput ────────────────────────────────────────────────────────────────

function LabelInput({ labels, onChange }: { labels: string[]; onChange: (labels: string[]) => void }) {
  const [input, setInput] = useState("");

  function addLabel() {
    const tag = input.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (tag && !labels.includes(tag)) onChange([...labels, tag]);
    setInput("");
  }

  return (
    <div style={{ marginBottom: "8px" }}>
      {labels.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "5px" }}>
          {labels.map((l) => {
            const c = labelColor(l);
            return (
              <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "11px", padding: "2px 7px", borderRadius: "20px", background: `${c}20`, color: c, border: `1px solid ${c}50` }}>
                #{l}
                <button onClick={() => onChange(labels.filter((x) => x !== l))} style={{ background: "none", border: "none", cursor: "pointer", color: c, padding: 0, display: "flex", lineHeight: 1 }}>
                  <X size={9} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <Tag size={11} style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addLabel(); } }}
          placeholder="Add label… (press Enter)"
          style={{ ...INPUT_STYLE, paddingLeft: "26px", fontSize: "11px" }}
        />
      </div>
    </div>
  );
}

// ── DatePicker ────────────────────────────────────────────────────────────────

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_LABELS = ["Mo","Tu","We","Th","Fr","Sa","Su"];

function DatePicker({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const [open, setOpen]         = useState(false);
  const [viewDate, setViewDate] = useState(() => value ? new Date(value + "T00:00:00") : new Date());
  const [theme, setTheme]       = useState("dark");
  const [pos, setPos]           = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setTheme(document.documentElement.getAttribute("data-theme") ?? "dark");
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    function reposition() {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const openUp = spaceBelow < 380 && r.top > spaceBelow;
      setPos({ top: openUp ? r.top - 380 - 8 : r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - 308)) });
    }
    function onClose(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    reposition();
    window.addEventListener("mousedown", onClose);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("mousedown", onClose);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const selected = value ? new Date(value + "T00:00:00") : null;
  const today    = new Date();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const startOffset     = (firstDayOfMonth + 6) % 7; // Mon = 0
  const daysInMonth     = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { day: number; current: boolean }[] = [];
  for (let i = startOffset - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, current: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, current: true });
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - daysInMonth - startOffset + 1, current: false });

  function selectDate(day: number) {
    const d   = new Date(year, month, day);
    const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    onChange(str);
    setOpen(false);
  }

  const isToday    = (d: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
  const isSelected = (d: number) => selected?.getFullYear() === year && selected?.getMonth() === month && selected?.getDate() === d;

  const displayLabel = value
    ? new Date(value + "T00:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
    : "Set due date";

  return (
    <div ref={triggerRef} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: "7px", width: "100%",
          fontSize: "12px", padding: "7px 10px", borderRadius: "8px",
          border: "1px solid var(--border)", background: "var(--bg-subtle)",
          color: value ? "var(--text-primary)" : "var(--text-muted)",
          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        }}>
        <Calendar size={13} style={{ color: value ? "var(--accent)" : "var(--text-muted)", flexShrink: 0 }} />
        {displayLabel}
      </button>

      {typeof document !== "undefined" && createPortal(open ? (
        <div ref={dropRef} data-theme={theme} onMouseDown={e => e.stopPropagation()}
          style={{
          position: "fixed", top: pos.top, left: pos.left, zIndex: 9999,
          background: theme !== "light" ? "rgba(13,27,48,0.99)" : "#ffffff",
          borderRadius: 20,
          padding: "20px 20px 16px",
          width: 300,
          boxShadow: theme !== "light" ? "0 20px 60px rgba(0,0,0,0.6)" : "0 8px 40px rgba(0,0,0,0.14)",
          border: theme !== "light" ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.08)",
        }}>
          {/* Month / year nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))}
              style={{ width: 36, height: 36, borderRadius: "50%", background: theme !== "light" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", border: "none", cursor: "pointer", color: theme !== "light" ? "#94a3b8" : "#475569", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
            <span style={{ fontSize: "15px", fontWeight: 700, color: theme !== "light" ? "#f8fafc" : "#07111f", letterSpacing: "-0.01em" }}>{MONTHS[month]} {year}</span>
            <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))}
              style={{ width: 36, height: 36, borderRadius: "50%", background: theme !== "light" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", border: "none", cursor: "pointer", color: theme !== "light" ? "#94a3b8" : "#475569", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
          </div>

          {/* Weekday headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: "6px" }}>
            {DAY_LABELS.map((d, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: "12px", fontWeight: 600, color: theme !== "light" ? "#64748b" : "#94a3b8", padding: "4px 0" }}>{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px 0" }}>
            {cells.map((cell, i) => (
              <button key={i} type="button" onClick={() => cell.current && selectDate(cell.day)}
                style={{
                  height: 38, width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "14px", borderRadius: "50%", border: cell.current && isToday(cell.day) && !isSelected(cell.day) ? "1.5px solid #1677ff" : "none",
                  background: cell.current && isSelected(cell.day) ? "#1677ff" : "transparent",
                  color: !cell.current ? "transparent"
                    : isSelected(cell.day) ? "#fff"
                    : theme !== "light" ? "#f8fafc" : "#07111f",
                  cursor: cell.current ? "pointer" : "default",
                  fontFamily: "inherit", fontWeight: isSelected(cell.day) || isToday(cell.day) ? 700 : 400,
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => { if (cell.current && !isSelected(cell.day)) (e.currentTarget as HTMLElement).style.background = theme !== "light" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"; }}
                onMouseLeave={(e) => { if (cell.current && !isSelected(cell.day)) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                {cell.current ? cell.day : ""}
              </button>
            ))}
          </div>
        </div>
      ) : null, document.body)}
    </div>
  );
}

const FIELD_LABEL = (text: string) => (
  <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{text}</p>
);

// ── RecurrencePicker ──────────────────────────────────────────────────────────

// Preset options — covers 95% of use cases in one dropdown
const RECUR_PRESETS = [
  { label: "No repeat",     value: "" },
  { label: "Daily",         value: JSON.stringify({ freq: "daily",   interval: 1 }) },
  { label: "Weekly",        value: JSON.stringify({ freq: "weekly",  interval: 1 }) },
  { label: "Biweekly",      value: JSON.stringify({ freq: "weekly",  interval: 2 }) },
  { label: "Monthly",       value: JSON.stringify({ freq: "monthly", interval: 1 }) },
  { label: "Quarterly",     value: JSON.stringify({ freq: "monthly", interval: 3 }) },
  { label: "Yearly",        value: JSON.stringify({ freq: "yearly",  interval: 1 }) },
  { label: "Custom…",       value: "__custom__" },
];

function RecurrencePicker({ value, onChange }: {
  value: string;
  onChange: (v: string) => void;
}) {
  const isCustom  = value !== "" && !RECUR_PRESETS.some((p) => p.value === value);
  const parsed    = value && value !== "__custom__" ? (() => { try { return JSON.parse(value); } catch { return null; } })() : null;
  const customFreq     = parsed?.freq     ?? "weekly";
  const customInterval = parsed?.interval ?? 1;

  const selectValue = isCustom ? "__custom__" : value;

  function handleSelect(v: string) {
    if (v === "__custom__") {
      onChange(JSON.stringify({ freq: "weekly", interval: 1 }));
    } else {
      onChange(v);
    }
  }

  const FREQ_UNITS = [
    { value: "daily",   label: "days" },
    { value: "weekly",  label: "weeks" },
    { value: "monthly", label: "months" },
    { value: "yearly",  label: "years" },
  ];

  return (
    <div style={{ marginBottom: "10px" }}>
      {FIELD_LABEL("Repeat")}
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <div style={{ position: "relative", flex: isCustom ? "0 0 auto" : 1 }}>
          <RotateCcw size={11} style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", color: value ? "var(--accent)" : "var(--text-muted)", pointerEvents: "none" }} />
          <select
            value={selectValue}
            onChange={(e) => handleSelect(e.target.value)}
            style={{
              ...INPUT_STYLE,
              paddingLeft: "26px",
              color: value ? "var(--accent)" : "var(--text-secondary)",
              fontWeight: value ? 600 : 400,
              borderColor: value ? "var(--accent)" : "var(--border-strong)",
            }}
          >
            {RECUR_PRESETS.map((p) => <option key={p.label} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {isCustom && (
          <>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>every</span>
            <input
              type="number" min={1} max={99} value={customInterval}
              onChange={(e) => onChange(JSON.stringify({ freq: customFreq, interval: Math.max(1, parseInt(e.target.value) || 1) }))}
              style={{ ...INPUT_STYLE, width: "48px", textAlign: "center", padding: "6px 4px" }}
            />
            <select
              value={customFreq}
              onChange={(e) => onChange(JSON.stringify({ freq: e.target.value, interval: customInterval }))}
              style={{ ...INPUT_STYLE, width: "auto" }}
            >
              {FREQ_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </>
        )}
      </div>
    </div>
  );
}

// ── AddTaskForm ───────────────────────────────────────────────────────────────

function AddTaskForm({ users, currentUserId, teams, onAdd, onCancel }: {
  users: TaskUser[]; currentUserId: string; teams: Team[];
  onAdd: (data: { title: string; description: string; link: string; priority: string; dueDate: string; assigneeIds: string[]; teamId: string; labels: string[]; recurrence: string; isPersonal: boolean }) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
}) {
  const [title, setTitle]               = useState("");
  const [description, setDescription]   = useState("");
  const [link, setLink]                 = useState("");
  const [priority, setPriority]         = useState("medium");
  const [dueDate, setDueDate]           = useState("");
  const [assigneeIds, setAssigneeIds]   = useState<string[]>([currentUserId]);
  const [teamId, setTeamId]             = useState("");
  const [labels, setLabels]             = useState<string[]>([]);
  const [recurrence, setRecurrence]     = useState("");
  const [userSearch, setUserSearch]     = useState("");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [isPersonal, setIsPersonal]     = useState(false);

  function handleTeamChange(id: string) { setTeamId(id); setAssigneeIds([currentUserId]); setUserSearch(""); }
  function handlePersonalToggle(personal: boolean) {
    setIsPersonal(personal);
    if (personal) { setTeamId(""); setAssigneeIds([]); }
    else { setAssigneeIds([currentUserId]); }
  }

  const selectedTeam  = teams.find((t) => t.id === teamId);
  const scopedUsers   = selectedTeam ? users.filter((u) => selectedTeam.members.some((m) => m.userId === u.id)) : users;
  const visibleUsers  = scopedUsers.filter((u) => !userSearch || u.name.toLowerCase().includes(userSearch.toLowerCase()));

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function submit() {
    if (!title.trim() || loading) return;
    setLoading(true); setError("");
    const result = await onAdd({ title, description, link, priority, dueDate, assigneeIds, teamId, labels, recurrence, isPersonal });
    setLoading(false);
    if (!result.ok) setError(result.error ?? "Failed to add task.");
  }

  return (
    <div style={{ background: "var(--panel-card-bg)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px", marginBottom: "10px", boxShadow: "var(--shadow-sm)" }}>
      {/* Personal / Team toggle */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
        {(["personal", "team"] as const).map((mode) => {
          const active = (mode === "personal") === isPersonal;
          return (
            <button key={mode} type="button" onClick={() => handlePersonalToggle(mode === "personal")}
              style={{ fontSize: "12px", fontWeight: 600, padding: "5px 14px", borderRadius: "20px", border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`, background: active ? "var(--accent-light)" : "transparent", color: active ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
              {mode === "personal" ? "Personal" : "Team"}
            </button>
          );
        })}
        <span style={{ fontSize: "11px", color: "var(--text-muted)", alignSelf: "center", marginLeft: 4 }}>
          {isPersonal ? "Only visible to you" : "Visible to team members"}
        </span>
      </div>

      {/* Title */}
      {FIELD_LABEL("Title")}
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?"
        onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) submit(); if (e.key === "Escape") onCancel(); }}
        style={{ ...INPUT_STYLE, fontSize: "13px", fontWeight: 500, marginBottom: "10px" }}
      />

      {/* Description */}
      {FIELD_LABEL("Description")}
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add more detail… (optional)" rows={2}
        style={{ ...INPUT_STYLE, resize: "none", marginBottom: "10px" }} />

      {/* Link */}
      {FIELD_LABEL("Relevant link")}
      <div style={{ position: "relative", marginBottom: "10px" }}>
        <Link2 size={12} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… (optional)"
          style={{ ...INPUT_STYLE, paddingLeft: "28px" }} />
      </div>

      {/* Labels */}
      {FIELD_LABEL("Labels")}
      <div style={{ marginBottom: "10px" }}>
        <LabelInput labels={labels} onChange={setLabels} />
      </div>

      {/* Priority + Due date + Team */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
        <div>
          {FIELD_LABEL("Due date")}
          <DatePicker value={dueDate} onChange={setDueDate} />
        </div>
        <div>
          {FIELD_LABEL("Priority")}
          <select value={priority} onChange={(e) => setPriority(e.target.value)}
            style={{ ...INPUT_STYLE, fontSize: "12px", padding: "7px 10px" }}>
            {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      {/* Recurrence */}
      <RecurrencePicker value={recurrence} onChange={setRecurrence} />

      {!isPersonal && teams.length > 0 && (
        <div style={{ marginBottom: "10px" }}>
          {FIELD_LABEL("Team")}
          <select value={teamId} onChange={(e) => handleTeamChange(e.target.value)}
            style={{ ...INPUT_STYLE, fontSize: "12px", padding: "7px 10px" }}>
            <option value="">No team</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      {!isPersonal && <div style={{ marginBottom: "10px" }}>
        {FIELD_LABEL(`Assign to${selectedTeam ? ` · ${selectedTeam.name}` : ""}`)}
        {assigneeIds.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
            {assigneeIds.map((id) => {
              const u = scopedUsers.find((u) => u.id === id);
              return (
                <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", padding: "2px 8px", borderRadius: "20px", background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--accent)" }}>
                  {id === currentUserId ? "Me" : (u?.name ?? id)}
                  <button onClick={() => toggleAssignee(id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", padding: 0, display: "flex", lineHeight: 1 }}><X size={10} /></button>
                </span>
              );
            })}
          </div>
        )}
        <div style={{ position: "relative" }}>
          <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search to assign…"
            style={{ ...INPUT_STYLE, fontSize: "11px", padding: "5px 8px" }} />
          {userSearch.trim() && visibleUsers.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", maxHeight: "160px", overflowY: "auto" }}>
              {visibleUsers.map((u) => {
                const isSelf = u.id === currentUserId; const active = assigneeIds.includes(u.id);
                return (
                  <button key={u.id} onClick={() => { toggleAssignee(u.id); setUserSearch(""); }}
                    style={{ width: "100%", textAlign: "left", padding: "7px 10px", border: "none", background: active ? "var(--accent-light)" : "none", color: active ? "var(--accent)" : "var(--text-primary)", cursor: "pointer", fontFamily: "inherit", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                    onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)"; }}
                    onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "none"; }}
                  >
                    <span>{isSelf ? "Me" : u.name}</span>
                    {active && <CheckCircle2 size={13} style={{ color: "var(--accent)" }} />}
                  </button>
                );
              })}
            </div>
          )}
          {userSearch.trim() && visibleUsers.length === 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px", fontSize: "12px", color: "var(--text-muted)" }}>
              No users found.
            </div>
          )}
        </div>
      </div>}

      {error && <p style={{ margin: "0 0 8px", fontSize: "11px", color: "#ef4444" }}>{error}</p>}
      <div style={{ display: "flex", gap: "6px" }}>
        <button onClick={submit} disabled={!title.trim() || loading}
          style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "7px", border: "none", background: title.trim() && !loading ? "var(--accent)" : "var(--bg-subtle)", color: title.trim() && !loading ? "#fff" : "var(--text-muted)", cursor: title.trim() && !loading ? "pointer" : "default", fontFamily: "inherit", fontWeight: 600 }}>
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

// ── SubtaskList ───────────────────────────────────────────────────────────────

function SubtaskList({ parentId, currentUserId }: { parentId: string; currentUserId: string }) {
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch(`/api/tasks?parentId=${parentId}`)
      .then((r) => r.json())
      .then((d) => setSubtasks(d.tasks ?? []))
      .finally(() => setLoading(false));
  }, [parentId]);

  async function addSubtask() {
    if (!input.trim()) return;
    const res = await fetch("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: input.trim(), parentId, assigneeIds: [currentUserId] }),
    });
    if (res.ok) { const d = await res.json(); setSubtasks((p) => [...p, d.task]); setInput(""); }
  }

  async function toggleSubtask(sub: Task) {
    const newStatus = sub.status === "done" ? "todo" : "done";
    setSubtasks((p) => p.map((s) => s.id === sub.id ? { ...s, status: newStatus } : s));
    const res = await fetch(`/api/tasks/${sub.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
    if (!res.ok) setSubtasks((p) => p.map((s) => s.id === sub.id ? sub : s));
  }

  async function deleteSubtask(id: string) {
    setSubtasks((p) => p.filter((s) => s.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  }

  const doneCount = subtasks.filter((s) => s.status === "done").length;

  return (
    <div style={{ marginBottom: "12px" }}>
      <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}>
        Subtasks
        {subtasks.length > 0 && (
          <span style={{ fontSize: "10px", color: "var(--accent)", background: "var(--accent-light)", padding: "1px 6px", borderRadius: "10px" }}>
            {doneCount}/{subtasks.length}
          </span>
        )}
      </p>
      {loading ? <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Loading…</span> : (
        <>
          {subtasks.map((sub) => (
            <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
              <button onClick={() => toggleSubtask(sub)}
                style={{ background: "none", border: "none", cursor: "pointer", color: sub.status === "done" ? "#10b981" : "var(--border)", padding: 0, flexShrink: 0 }}>
                <CheckCircle2 size={14} />
              </button>
              <span style={{ flex: 1, fontSize: "12px", color: sub.status === "done" ? "var(--text-muted)" : "var(--text-primary)", textDecoration: sub.status === "done" ? "line-through" : "none" }}>
                {sub.title}
              </span>
              <button onClick={() => deleteSubtask(sub.id)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0, opacity: 0.5 }}>
                <X size={11} />
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: "6px", marginTop: "7px" }}>
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addSubtask(); }}
              placeholder="Add subtask…"
              style={{ ...INPUT_STYLE, fontSize: "11px", flex: 1 }} />
            <button onClick={addSubtask} disabled={!input.trim()}
              style={{ padding: "5px 10px", fontSize: "11px", borderRadius: "7px", border: "none", background: input.trim() ? "var(--accent)" : "var(--bg-subtle)", color: input.trim() ? "#fff" : "var(--text-muted)", cursor: input.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
              Add
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── TaskDetail ────────────────────────────────────────────────────────────────

function TaskDetail({ task, currentUserId, allUsers, teams, onClose, onUpdate }: {
  task: Task; currentUserId: string; allUsers: TaskUser[]; teams: Team[];
  onClose: () => void; onUpdate: (updated: Task) => void;
}) {
  const [comments, setComments]           = useState<Comment[]>([]);
  const [commentText, setCommentText]     = useState("");
  const [sending, setSending]             = useState(false);
  const [reviewSearch, setReviewSearch]   = useState("");
  const [sendingReview, setSendingReview] = useState(false);
  const commentRef = useRef<HTMLInputElement>(null);
  const labels = parseLabels(task.labels);
  const sm = STATUS_META[task.status] ?? STATUS_META.todo;

  const isCreator   = task.createdBy?.id === currentUserId;
  const isTeamOwner = task.team ? teams.some((t) => t.id === task.team?.id && t.members.some((m) => m.userId === currentUserId && m.role === "owner")) : false;
  const canSendReview = (isCreator || isTeamOwner) && (task.status === "in_progress" || task.status === "done");

  useEffect(() => {
    fetch(`/api/tasks/${task.id}/comments`).then((r) => r.json()).then((d) => setComments(d.comments ?? []));
  }, [task.id]);

  useEffect(() => {
    const timer = setTimeout(() => { commentRef.current?.focus(); }, 200);
    return () => clearTimeout(timer);
  }, [task.id]);

  async function changeStatus(status: string) {
    const res = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (res.ok) { const d = await res.json(); onUpdate(d.task); }
  }

  async function sendForReview(reviewerId: string) {
    setSendingReview(true);
    const res = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "in_review", addAssigneeIds: [reviewerId] }) });
    if (res.ok) { const d = await res.json(); onUpdate(d.task); setReviewSearch(""); }
    setSendingReview(false);
  }

  async function sendComment() {
    if (!commentText.trim() || sending) return;
    setSending(true);
    const res = await fetch(`/api/tasks/${task.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: commentText }) });
    if (res.ok) { const d = await res.json(); setComments((c) => [...c, d.comment]); setCommentText(""); }
    setSending(false);
  }

  return (
    <div style={{ borderTop: "2px solid var(--border)", paddingTop: "12px", marginTop: "8px", background: "var(--panel-card-bg)", borderRadius: "12px", padding: "14px", border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
        <h3 style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", flex: 1, lineHeight: 1.4 }}>{task.title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px" }}><X size={14} /></button>
      </div>

      {labels.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" }}>
          {labels.map((l) => {
            const c = labelColor(l);
            return <span key={l} style={{ fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "20px", background: `${c}20`, color: c, border: `1px solid ${c}40` }}>#{l}</span>;
          })}
        </div>
      )}

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
            style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "20px", border: `1px solid ${task.status === k ? v.color : "var(--border)"}`, background: task.status === k ? v.bg : "none", color: task.status === k ? v.color : "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" }}>
            {v.label}
          </button>
        ))}
      </div>

      {task.recurrence && (() => {
        const rec = (() => { try { return JSON.parse(task.recurrence!); } catch { return null; } })();
        if (!rec) return null;
        const freqLabel: Record<string, string> = { daily: "day(s)", weekly: "week(s)", monthly: "month(s)", yearly: "year(s)" };
        const nextDate = task.nextRecurAt ? new Date(task.nextRecurAt).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : null;
        return (
          <div style={{ marginBottom: "10px", padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(22,119,255,.25)", background: "var(--accent-light)", display: "flex", alignItems: "center", gap: "7px" }}>
            <RotateCcw size={12} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <div>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--accent)" }}>
                Repeats every {rec.interval ?? 1} {freqLabel[rec.freq] ?? rec.freq}
              </span>
              {nextDate && (
                <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "6px" }}>· Next: {nextDate}</span>
              )}
            </div>
          </div>
        );
      })()}

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

      <SubtaskList parentId={task.id} currentUserId={currentUserId} />

      {canSendReview && (
        <div style={{ marginBottom: "12px", padding: "10px", borderRadius: "8px", border: "1px solid rgba(139,92,246,.35)", background: "rgba(139,92,246,.07)" }}>
          <p style={{ margin: "0 0 6px", fontSize: "10px", fontWeight: 700, color: "#8B5CF6", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "5px" }}>
            <Eye size={11} /> Send for Review
          </p>
          <div style={{ position: "relative" }}>
            <input value={reviewSearch} onChange={(e) => setReviewSearch(e.target.value)} placeholder="Search reviewer…" disabled={sendingReview}
              style={{ ...INPUT_STYLE, fontSize: "11px", padding: "5px 8px" }} />
            {reviewSearch.trim() && (() => {
              const reviewerResults = allUsers.filter((u) => u.name.toLowerCase().includes(reviewSearch.toLowerCase()));
              return (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.25)", maxHeight: "130px", overflowY: "auto" }}>
                {reviewerResults.length === 0
                  ? <div style={{ padding: "10px", fontSize: "12px", color: "var(--text-muted)" }}>No users found.</div>
                  : reviewerResults.map((u) => (
                    <button key={u.id} onClick={() => sendForReview(u.id)}
                      style={{ width: "100%", textAlign: "left", padding: "7px 10px", border: "none", background: "none", color: "var(--text-primary)", cursor: "pointer", fontFamily: "inherit", fontSize: "12px", display: "flex", alignItems: "center", gap: "8px" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                    >
                      <UserCheck size={13} style={{ color: "#8B5CF6" }} />
                      {u.id === currentUserId ? "Me" : u.name}
                    </button>
                  ))
                }
              </div>
              );
            })()}
          </div>
        </div>
      )}

      {task.status === "in_review" && task.assignees.some((a) => a.userId === currentUserId) && (
        <div style={{ marginBottom: "12px", padding: "8px 10px", borderRadius: "8px", background: "rgba(139,92,246,.1)", border: "1px solid rgba(139,92,246,.3)", fontSize: "11px", color: "#8B5CF6", display: "flex", alignItems: "center", gap: "6px" }}>
          <Eye size={13} />
          You are reviewing this task — click the status button above to mark as Done.
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
        <input ref={commentRef} value={commentText} onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") sendComment(); }}
          placeholder="Add a comment…" style={INPUT_STYLE}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
        />
        <button onClick={sendComment} disabled={!commentText.trim() || sending}
          style={{ width: "32px", height: "32px", borderRadius: "50%", border: "none", background: commentText.trim() ? "var(--accent)" : "var(--bg-subtle)", color: commentText.trim() ? "#fff" : "var(--text-muted)", cursor: commentText.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}

// ── TeamManager ───────────────────────────────────────────────────────────────

function TeamManager({ currentUserId, allUsers, teams, onTeamsChange }: {
  currentUserId: string; allUsers: TaskUser[]; teams: Team[]; onTeamsChange: (teams: Team[]) => void;
}) {
  const [creating, setCreating]   = useState(false);
  const [teamName, setTeamName]   = useState("");
  const [teamDesc, setTeamDesc]   = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch]   = useState("");
  const [addMemberSearch, setAddMemberSearch] = useState<Record<string, string>>({});
  const [loading, setLoading]     = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName]   = useState("");

  async function saveTeamName(teamId: string) {
    if (!editTeamName.trim()) return;
    const res = await fetch(`/api/teams/${teamId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editTeamName.trim() }),
    });
    if (res.ok) {
      onTeamsChange(teams.map((t) => t.id === teamId ? { ...t, name: editTeamName.trim() } : t));
      setEditingTeamId(null);
    }
  }

  async function createTeam() {
    if (!teamName.trim() || loading) return;
    setLoading(true);
    const res = await fetch("/api/teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: teamName, description: teamDesc, memberIds }) });
    if (res.ok) { const d = await res.json(); onTeamsChange([...teams, d.team]); setCreating(false); setTeamName(""); setTeamDesc(""); setMemberIds([]); }
    setLoading(false);
  }

  async function deleteTeam(id: string) {
    if (!confirm("Delete this team?")) return;
    const res = await fetch(`/api/teams/${id}`, { method: "DELETE" });
    if (res.ok) onTeamsChange(teams.filter((t) => t.id !== id));
  }

  async function removeMember(teamId: string, userId: string) {
    const res = await fetch(`/api/teams/${teamId}/members`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
    if (res.ok) onTeamsChange(teams.map((t) => t.id === teamId ? { ...t, members: t.members.filter((m) => m.userId !== userId) } : t));
  }

  async function addMember(teamId: string, userId: string) {
    const res = await fetch(`/api/teams/${teamId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
    if (res.ok) { const d = await res.json(); onTeamsChange(teams.map((t) => t.id === teamId ? d.team : t)); }
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
          <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team name…" style={{ ...INPUT_STYLE, marginBottom: "6px" }} />
          <input value={teamDesc} onChange={(e) => setTeamDesc(e.target.value)} placeholder="Description… (optional)" style={{ ...INPUT_STYLE, marginBottom: "8px" }} />
          <p style={{ margin: "0 0 5px", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Add Members</p>
          {memberIds.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
              {memberIds.map((id) => {
                const u = allUsers.find((u) => u.id === id);
                return (
                  <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", padding: "2px 8px", borderRadius: "20px", background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--accent)" }}>
                    {u?.name ?? id}
                    <button onClick={() => setMemberIds((p) => p.filter((x) => x !== id))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", padding: 0, display: "flex" }}><X size={10} /></button>
                  </span>
                );
              })}
            </div>
          )}
          <div style={{ position: "relative", marginBottom: "10px" }}>
            <input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Search members to add…" style={{ ...INPUT_STYLE, fontSize: "11px", padding: "5px 8px" }} />
            {memberSearch.trim() && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", maxHeight: "140px", overflowY: "auto" }}>
                {allUsers.filter((u) => u.id !== currentUserId && u.name.toLowerCase().includes(memberSearch.toLowerCase())).length === 0
                  ? <div style={{ padding: "10px", fontSize: "12px", color: "var(--text-muted)" }}>No users found.</div>
                  : allUsers.filter((u) => u.id !== currentUserId && u.name.toLowerCase().includes(memberSearch.toLowerCase())).map((u) => {
                      const active = memberIds.includes(u.id);
                      return (
                        <button key={u.id} onClick={() => { setMemberIds((p) => active ? p.filter((x) => x !== u.id) : [...p, u.id]); setMemberSearch(""); }}
                          style={{ width: "100%", textAlign: "left", padding: "7px 10px", border: "none", background: active ? "var(--accent-light)" : "none", color: active ? "var(--accent)" : "var(--text-primary)", cursor: "pointer", fontFamily: "inherit", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                          onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)"; }}
                          onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "none"; }}
                        >
                          <span>{u.name}</span>
                          {active && <CheckCircle2 size={13} style={{ color: "var(--accent)" }} />}
                        </button>
                      );
                    })
                }
              </div>
            )}
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
        <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 10px" }}>No teams yet. Create one to collaborate.</p>
      )}

      {teams.map((team) => {
        const isOwner = team.members.some((m) => m.userId === currentUserId && m.role === "owner");
        const otherUsers = allUsers.filter((u) => !team.members.some((m) => m.userId === u.id));
        return (
          <div key={team.id} style={{ background: "var(--panel-card-bg)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px", marginBottom: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {editingTeamId === team.id ? (
                  <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                    <input
                      autoFocus
                      value={editTeamName}
                      onChange={(e) => setEditTeamName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveTeamName(team.id); if (e.key === "Escape") setEditingTeamId(null); }}
                      style={{ ...INPUT_STYLE, fontSize: "13px", fontWeight: 600, flex: 1 }}
                    />
                    <button onClick={() => saveTeamName(team.id)}
                      style={{ background: "var(--accent)", border: "none", borderRadius: "7px", cursor: "pointer", padding: "5px 8px", color: "#fff", display: "flex", alignItems: "center" }}>
                      <Check size={12} />
                    </button>
                    <button onClick={() => setEditingTeamId(null)}
                      style={{ background: "none", border: "1px solid var(--border)", borderRadius: "7px", cursor: "pointer", padding: "5px 8px", color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{team.name}</span>
                    {isOwner && (
                      <button onClick={() => { setEditingTeamId(team.id); setEditTeamName(team.name); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px", opacity: 0.6, display: "flex", alignItems: "center" }}
                        title="Edit team name">
                        <Pencil size={11} />
                      </button>
                    )}
                  </div>
                )}
                {team.description && editingTeamId !== team.id && <p style={{ margin: "2px 0 0", fontSize: "11px", color: "var(--text-muted)" }}>{team.description}</p>}
              </div>
              {isOwner && editingTeamId !== team.id && (
                <button onClick={() => deleteTeam(team.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px", marginLeft: "8px" }}>
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
                    <button onClick={() => removeMember(team.id, m.userId)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "0 0 0 2px", display: "flex" }}><X size={10} /></button>
                  )}
                </div>
              ))}
            </div>
            {isOwner && otherUsers.length > 0 && (
              <div style={{ position: "relative", marginTop: "6px" }}>
                <input value={addMemberSearch[team.id] ?? ""} onChange={(e) => setAddMemberSearch((p) => ({ ...p, [team.id]: e.target.value }))}
                  placeholder="Search to add member…" style={{ ...INPUT_STYLE, fontSize: "11px", padding: "4px 8px" }} />
                {(addMemberSearch[team.id] ?? "").trim() && (() => {
                  const memberResults = otherUsers.filter((u) => u.name.toLowerCase().includes((addMemberSearch[team.id] ?? "").toLowerCase()));
                  return (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", maxHeight: "130px", overflowY: "auto" }}>
                    {memberResults.length === 0
                      ? <div style={{ padding: "10px", fontSize: "12px", color: "var(--text-muted)" }}>No users found.</div>
                      : memberResults.map((u) => (
                          <button key={u.id} onClick={() => { addMember(team.id, u.id); setAddMemberSearch((p) => ({ ...p, [team.id]: "" })); }}
                            style={{ width: "100%", textAlign: "left", padding: "7px 10px", border: "none", background: "none", color: "var(--text-primary)", cursor: "pointer", fontFamily: "inherit", fontSize: "12px" }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-subtle)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                          >
                            + {u.name}
                          </button>
                        ))
                    }
                  </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ tab, onAdd }: { tab: string; onAdd?: () => void }) {
  const config: Record<string, { icon: string; title: string; sub: string; cta?: string }> = {
    mine:   { icon: "📋", title: "No tasks assigned to you", sub: "Create your first task to get started.", cta: "Add Task" },
    all:    { icon: "✅", title: "No tasks yet", sub: "Add a task to get the team moving.", cta: "Add Task" },
    board:  { icon: "🗂️", title: "No tasks to display", sub: "Add tasks to see them on the board.", cta: "Add Task" },
    review: { icon: "👁️", title: "Nothing pending review", sub: "Tasks marked Done can be sent for review." },
    teams:  { icon: "👥", title: "No teams yet", sub: "Create a team to collaborate with colleagues." },
  };
  const c = config[tab] ?? config.all;
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
      <div style={{ fontSize: "32px", marginBottom: "10px" }}>{c.icon}</div>
      <p style={{ margin: "0 0 4px", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>{c.title}</p>
      <p style={{ margin: "0 0 14px", fontSize: "12px" }}>{c.sub}</p>
      {c.cta && onAdd && (
        <button onClick={onAdd}
          style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
          <Plus size={13} /> {c.cta}
        </button>
      )}
    </div>
  );
}

// ── Main TaskPanel ─────────────────────────────────────────────────────────────

type TabKey = "mine" | "all" | "board" | "review" | "teams";

interface Props { userId: string; userRole: string; }

export function TaskPanel({ userId, userRole }: Props) {
  const [mounted, setMounted]               = useState(false);
  const [open, setOpen]                     = useState(false);
  const [expanded, setExpanded]             = useState(false);
  const [tab, setTab]                       = useState<TabKey>("mine");
  const [tasks, setTasks]                   = useState<Task[]>([]);
  const [loading, setLoading]               = useState(false);
  const [statusFilter, setStatusFilter]     = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [teamFilter, setTeamFilter]         = useState("all");
  const [showAdd, setShowAdd]               = useState(false);
  const [selectedId, setSelectedId]         = useState<string | null>(null);
  const [users, setUsers]                   = useState<TaskUser[]>([]);
  const [teams, setTeams]                   = useState<Team[]>([]);
  const [reviewCount, setReviewCount]       = useState(0);
  const [searchOpen, setSearchOpen]         = useState(false);
  const pendingSelectRef                    = useRef<string | null>(null);

  // Load persisted state from localStorage
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("task-panel-state") ?? "{}");
      if (saved.tab) setTab(saved.tab);
      if (saved.statusFilter) setStatusFilter(saved.statusFilter);
      if (saved.priorityFilter) setPriorityFilter(saved.priorityFilter);
      if (saved.teamFilter) setTeamFilter(saved.teamFilter);
      if (saved.expanded) setExpanded(saved.expanded);
    } catch {}
    setMounted(true);
  }, []);

  // Persist state changes
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("task-panel-state", JSON.stringify({ tab, statusFilter, priorityFilter, teamFilter, expanded }));
  }, [tab, statusFilter, priorityFilter, teamFilter, expanded, mounted]);

  // Panel toggle
  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("toggle-task-panel", handler);
    return () => window.removeEventListener("toggle-task-panel", handler);
  }, []);

  // Open and navigate to a specific task from notifications
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ taskId: string }>;
      pendingSelectRef.current = ce.detail.taskId;
      setOpen(true);
      setTab("all");
      setStatusFilter("all");
      setPriorityFilter("all");
      setTeamFilter("all");
    };
    window.addEventListener("open-task", handler);
    return () => window.removeEventListener("open-task", handler);
  }, []);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (!open) { setOpen(true); setTimeout(() => setSearchOpen(true), 50); }
        else setSearchOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tab === "mine") params.set("mine", "true");
    if (tab === "review") params.set("status", "in_review");
    else if (statusFilter !== "all") params.set("status", statusFilter);
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    if (teamFilter !== "all") params.set("teamId", teamFilter);
    const res = await fetch(`/api/tasks?${params}`);
    if (res.ok) {
      const d = await res.json();
      setTasks(d.tasks ?? []);
      if (pendingSelectRef.current) {
        setSelectedId(pendingSelectRef.current);
        pendingSelectRef.current = null;
      }
    }
    setLoading(false);
  }, [tab, statusFilter, priorityFilter, teamFilter]);

  useEffect(() => {
    if (open && tab !== "teams") fetchTasks();
  }, [open, fetchTasks]); // tab is already captured in fetchTasks via useCallback deps

  // Keep sidebar badge updated
  useEffect(() => {
    const openCount = tasks.filter((t) => t.status !== "done").length;
    window.dispatchEvent(new CustomEvent("task-open-count", { detail: { count: openCount } }));
  }, [tasks]);

  // Fetch users, teams, and review count when panel opens
  useEffect(() => {
    if (!open) return;
    fetch("/api/users").then((r) => r.json()).then((d) => setUsers(d.users ?? []));
    fetch("/api/teams").then((r) => r.json()).then((d) => setTeams(d.teams ?? []));
    fetch("/api/tasks?status=in_review").then((r) => r.json()).then((d) => setReviewCount((d.tasks ?? []).length));
  }, [open]);

  async function handleAddTask(data: { title: string; description: string; link: string; priority: string; dueDate: string; assigneeIds: string[]; teamId: string; labels: string[]; recurrence: string }) {
    const res = await fetch("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title, description: data.description || null, link: data.link || null,
        priority: data.priority, dueDate: data.dueDate || null,
        assigneeIds: data.isPersonal ? [] : data.assigneeIds, teamId: data.isPersonal ? null : (data.teamId || null),
        labels: JSON.stringify(data.labels),
        recurrence: data.recurrence || null,
        isPersonal: data.isPersonal ?? false,
      }),
    });
    if (res.ok) { setShowAdd(false); fetchTasks(); return { ok: true }; }
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.error ?? `Server error ${res.status}` };
  }

  async function handleStatusChange(id: string, status: string) {
    // Optimistic update
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status } : t));
    const res = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (res.ok) { const d = await res.json(); setTasks((prev) => prev.map((t) => t.id === id ? d.task : t)); }
    else { fetchTasks(); } // Revert on error
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this task?")) return;
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (res.ok) { setTasks((prev) => prev.filter((t) => t.id !== id)); setSelectedId(null); }
  }

  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;
  const openCount    = tasks.filter((t) => t.status !== "done").length;

  // ── Active view: In Progress only, dynamic priority, sorted ──────────────────
  function computeDynamicPriority(task: Task): string {
    if (!task.dueDate) return task.priority; // fallback to manual
    const daysLeft = (new Date(task.dueDate).getTime() - Date.now()) / 86_400_000;
    if (daysLeft <= 1)  return "urgent";
    if (daysLeft <= 3)  return "high";
    if (daysLeft <= 7)  return "medium";
    return "low";
  }

  const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  const activeListTasks = (tab === "mine" || tab === "all")
    ? (() => {
        const inProgress = tasks
          .filter(t => t.status === "in_progress")
          .map(t => ({ ...t, _dynPriority: computeDynamicPriority(t) }))
          .sort((a, b) => {
            const aHas = !!a.dueDate, bHas = !!b.dueDate;
            if (aHas && bHas) {
              const diff = new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime();
              if (diff !== 0) return diff;
              return (PRIORITY_RANK[a._dynPriority] ?? 3) - (PRIORITY_RANK[b._dynPriority] ?? 3);
            }
            if (aHas) return -1;
            if (bHas) return 1;
            return (PRIORITY_RANK[a._dynPriority] ?? 3) - (PRIORITY_RANK[b._dynPriority] ?? 3);
          });
        const done = tasks
          .filter(t => t.status === "done")
          .map(t => ({ ...t, _dynPriority: t.priority }))
          .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3));
        return [...inProgress, ...done];
      })()
    : null;
  const panelWidth   = expanded || tab === "board" ? "680px" : "420px";

  const TABS: { key: TabKey; label: string }[] = [
    { key: "mine",   label: "My Tasks" },
    { key: "all",    label: "All" },
    { key: "board",  label: "Board" },
    { key: "review", label: "Review" },
    { key: "teams",  label: "Teams" },
  ];

  if (!mounted) return null;

  const panel = (
    <>
      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,0,0,0.2)" }} />
      )}

      {searchOpen && (
        <SearchOverlay
          tasks={tasks}
          onSelect={(id) => { setSelectedId(id); if (tab === "board") setTab("all"); }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 9991,
        width: panelWidth, maxWidth: "95vw",
        background: "var(--panel-bg)", borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.28s cubic-bezier(0.34,1.06,0.64,1), width 0.2s ease",
        boxShadow: open ? "-8px 0 40px rgba(0,0,0,0.14)" : "none",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 16px 0", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--panel-header-bg)" }}>
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
            <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
              <button onClick={() => setSearchOpen(true)} title="Search tasks (⌘K)"
                style={{ background: "none", border: "1px solid var(--border)", borderRadius: "7px", cursor: "pointer", padding: "4px 8px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "5px", fontSize: "11px" }}>
                <Search size={12} /> <kbd style={{ fontSize: "10px", background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: "3px", padding: "0 3px" }}>⌘K</kbd>
              </button>
              {tab !== "teams" && tab !== "review" && (
                <button onClick={() => setShowAdd((s) => !s)}
                  style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", padding: "4px 10px", borderRadius: "7px", border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                  <Plus size={12} /> Add
                </button>
              )}
              <button onClick={() => setExpanded((v) => !v)} title={expanded ? "Collapse" : "Expand"}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}>
                {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px" }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginBottom: "-1px", overflowX: "auto" }}>
            {TABS.map((t) => {
              const count = t.key === "review" ? reviewCount : (tab === t.key ? tasks.length : undefined);
              return (
                <button key={t.key} onClick={() => { setTab(t.key); setSelectedId(null); setShowAdd(false); }}
                  style={{
                    fontSize: "12px", padding: "6px 11px", border: "none", background: "none", whiteSpace: "nowrap",
                    cursor: "pointer", fontFamily: "inherit", fontWeight: tab === t.key ? 600 : 400,
                    color: tab === t.key ? "var(--accent)" : "var(--text-muted)",
                    borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
                    display: "flex", alignItems: "center", gap: "4px",
                  }}>
                  {t.label}
                  {count !== undefined && count > 0 && (
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "0px 5px", borderRadius: "10px", background: tab === t.key ? "var(--accent-light)" : "var(--bg-subtle)", color: tab === t.key ? "var(--accent)" : "var(--text-muted)" }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {/* Teams tab */}
          {tab === "teams" && (
            <TeamManager currentUserId={userId} allUsers={users} teams={teams} onTeamsChange={setTeams} />
          )}

          {/* Task tabs */}
          {tab !== "teams" && (
            <>
              {/* Filters + view toggle */}
              {tab !== "review" && tab !== "board" && (
                <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ fontSize: "11px", padding: "3px 6px", borderRadius: "6px", border: "1px solid var(--border-strong)", background: "var(--panel-card-bg)", color: "var(--text-secondary)", fontFamily: "inherit" }}>
                    <option value="all">All status</option>
                    {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}
                    style={{ fontSize: "11px", padding: "3px 6px", borderRadius: "6px", border: "1px solid var(--border-strong)", background: "var(--panel-card-bg)", color: "var(--text-secondary)", fontFamily: "inherit" }}>
                    <option value="all">All priority</option>
                    {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  {teams.length > 0 && (
                    <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}
                      style={{ fontSize: "11px", padding: "3px 6px", borderRadius: "6px", border: "1px solid var(--border-strong)", background: "var(--panel-card-bg)", color: "var(--text-secondary)", fontFamily: "inherit" }}>
                      <option value="all">All teams</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                  <button onClick={fetchTasks} style={{ background: "none", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", padding: "3px 8px", color: "var(--text-muted)" }}>
                    <RefreshCw size={11} />
                  </button>
                </div>
              )}

              {/* Board filter bar */}
              {tab === "board" && (
                <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}
                    style={{ fontSize: "11px", padding: "3px 6px", borderRadius: "6px", border: "1px solid var(--border-strong)", background: "var(--panel-card-bg)", color: "var(--text-secondary)", fontFamily: "inherit" }}>
                    <option value="all">All priority</option>
                    {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  {teams.length > 0 && (
                    <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}
                      style={{ fontSize: "11px", padding: "3px 6px", borderRadius: "6px", border: "1px solid var(--border-strong)", background: "var(--panel-card-bg)", color: "var(--text-secondary)", fontFamily: "inherit" }}>
                      <option value="all">All teams</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                  <button onClick={fetchTasks} style={{ background: "none", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", padding: "3px 8px", color: "var(--text-muted)" }}>
                    <RefreshCw size={11} />
                  </button>
                </div>
              )}

              {/* Add form */}
              {showAdd && (
                <AddTaskForm users={users} currentUserId={userId} teams={teams}
                  onAdd={handleAddTask} onCancel={() => setShowAdd(false)} />
              )}

              {/* Content */}
              {loading ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)" }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: "0 auto 6px", display: "block" }} />
                  <span style={{ fontSize: "12px" }}>Loading…</span>
                </div>
              ) : tasks.length === 0 ? (
                <EmptyState tab={tab} onAdd={() => { setShowAdd(true); }} />
              ) : tab === "board" ? (
                <KanbanBoard
                  tasks={tasks} currentUserId={userId} teams={teams}
                  onStatusChange={handleStatusChange} onDelete={handleDelete}
                  onSelect={(id) => setSelectedId((prev) => prev === id ? null : id)}
                  selectedId={selectedId}
                />
              ) : activeListTasks !== null ? (
                activeListTasks.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)", fontSize: "13px" }}>
                    No in-progress tasks — all clear!
                  </div>
                ) : (
                  activeListTasks.map((task) => (
                    <TaskCard
                      key={task.id} task={{ ...task, priority: task._dynPriority }} currentUserId={userId} teams={teams}
                      onStatusChange={handleStatusChange} onDelete={handleDelete}
                      onSelect={(id) => setSelectedId((prev) => prev === id ? null : id)}
                      selected={selectedId === task.id}
                    />
                  ))
                )
              ) : (
                tasks.map((task) => (
                  <TaskCard
                    key={task.id} task={task} currentUserId={userId} teams={teams}
                    onStatusChange={handleStatusChange} onDelete={handleDelete}
                    onSelect={(id) => setSelectedId((prev) => prev === id ? null : id)}
                    selected={selectedId === task.id}
                  />
                ))
              )}

              {/* Task detail */}
              {selectedTask && (
                <TaskDetail
                  task={selectedTask} currentUserId={userId} allUsers={users} teams={teams}
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
