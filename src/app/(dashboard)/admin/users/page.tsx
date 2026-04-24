"use client";
import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  UserPlus, Pencil, Trash2, ShieldCheck, User, Building2,
  KeyRound, Eye, EyeOff, RefreshCw,
} from "lucide-react";

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "LIVE_HOST" | "CLIENT";
  createdAt: string;
  liveHost?: { id: string; displayName: string; isActive: boolean } | null;
  client?:   { id: string } | null;
}

const ROLES = [
  {
    value: "ADMIN",
    label: "Admin",
    icon: ShieldCheck,
    color: "#6366f1",
    bg: "rgba(99,102,241,0.1)",
    desc: "Full access — manage all sessions, staff, settings, and reports.",
  },
  {
    value: "LIVE_HOST",
    label: "Live Host",
    icon: User,
    color: "#10b981",
    bg: "rgba(16,185,129,0.1)",
    desc: "Access to own schedule, performance stats, and payroll.",
  },
  {
    value: "CLIENT",
    label: "Client",
    icon: Building2,
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    desc: "Read-only view of their brand's session and performance data.",
  },
] as const;

function RoleBadge({ role }: { role: string }) {
  const r = ROLES.find(x => x.value === role) ?? ROLES[1];
  const Icon = r.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: r.bg, color: r.color }}>
      <Icon size={10} />
      {r.label}
    </span>
  );
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(" ");
  const letters = parts.length >= 2
    ? parts[0][0] + parts[parts.length - 1][0]
    : name.slice(0, 2);
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
      style={{ background: "var(--accent-muted)", color: "var(--accent)" }}>
      {letters.toUpperCase()}
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers]         = useState<StaffUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [open, setOpen]           = useState(false);
  const [editUser, setEditUser]   = useState<StaffUser | null>(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [showPass, setShowPass]   = useState(false);

  // Create form
  const [form, setForm] = useState({
    name: "", email: "", password: "", role: "LIVE_HOST" as StaffUser["role"], displayName: "",
  });

  // Edit form
  const [editForm, setEditForm] = useState({
    name: "", email: "", role: "LIVE_HOST" as StaffUser["role"], newPassword: "",
  });
  const [editOpen, setEditOpen]   = useState(false);
  const [showEditPass, setShowEditPass] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm({ name: "", email: "", password: "", role: "LIVE_HOST", displayName: "" });
    setError("");
    setShowPass(false);
    setOpen(true);
  }

  function openEdit(u: StaffUser) {
    setEditUser(u);
    setEditForm({ name: u.name, email: u.email, role: u.role, newPassword: "" });
    setError("");
    setShowEditPass(false);
    setEditOpen(true);
  }

  async function create() {
    setError("");
    if (!form.name || !form.email || !form.password) { setError("Name, email, and password are required."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setSaving(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to create account"); return; }
    setOpen(false);
    load();
  }

  async function saveEdit() {
    if (!editUser) return;
    setError("");
    if (!editForm.name || !editForm.email) { setError("Name and email are required."); return; }
    if (editForm.newPassword && editForm.newPassword.length < 8) {
      setError("New password must be at least 8 characters."); return;
    }
    setSaving(true);
    const payload: Record<string, string> = {
      name: editForm.name,
      email: editForm.email,
      role: editForm.role,
    };
    if (editForm.newPassword) payload.newPassword = editForm.newPassword;
    const res = await fetch(`/api/admin/users/${editUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to update account"); return; }
    setEditOpen(false);
    load();
  }

  async function deleteUser(u: StaffUser) {
    if (!confirm(`Delete account for ${u.name}?\n\nThis will remove their login access. ${u.liveHost ? "Their Live Host profile and session history will also be removed." : ""}This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { alert(data.error ?? "Failed to delete"); return; }
    load();
  }

  const byRole = (role: StaffUser["role"]) => users.filter(u => u.role === role);

  return (
    <div className="space-y-6 animate-in max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Staff Accounts</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Manage login access and roles for your team.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <UserPlus size={14} /> New Account
        </Button>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-3 gap-3">
        {ROLES.map(r => {
          const Icon = r.icon;
          const count = byRole(r.value).length;
          return (
            <div key={r.value} className="rounded-xl px-4 py-3 flex gap-3 items-start"
              style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: r.bg }}>
                <Icon size={13} style={{ color: r.color }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{r.label}</span>
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                    style={{ background: r.bg, color: r.color }}>{count}</span>
                </div>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>{r.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div className="section-card p-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          <RefreshCw size={16} className="mx-auto mb-2 animate-spin" /> Loading accounts…
        </div>
      )}

      {/* Users table */}
      {!loading && users.length > 0 && (
        <div className="section-card">
          <div className="overflow-x-auto">
            <table className="data-table text-sm w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Profile</th>
                  <th>Joined</th>
                  <th className="w-20 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Initials name={u.name} />
                        <span className="font-medium" style={{ color: "var(--text-primary)" }}>{u.name}</span>
                      </div>
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>{u.email}</td>
                    <td><RoleBadge role={u.role} /></td>
                    <td>
                      {u.role === "LIVE_HOST" && u.liveHost && (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {u.liveHost.displayName}
                          {!u.liveHost.isActive && (
                            <span className="ml-1.5 px-1 py-0.5 rounded text-[10px]"
                              style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}>inactive</span>
                          )}
                        </span>
                      )}
                      {u.role === "CLIENT" && u.client && (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Client account</span>
                      )}
                      {u.role === "ADMIN" && (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {format(new Date(u.createdAt), "d MMM yyyy")}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: "var(--text-muted)" }}
                          title="Edit account"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => deleteUser(u)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: "var(--text-muted)" }}
                          title="Delete account"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Create modal ─────────────────────────────────────────────── */}
      <Modal open={open} onClose={() => setOpen(false)} title="Create Account">
        <div className="space-y-4 p-1">
          {/* Role selector */}
          <div>
            <label className="text-xs font-semibold mb-2 block" style={{ color: "var(--text-secondary)" }}>
              Access Level
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map(r => {
                const Icon = r.icon;
                const active = form.role === r.value;
                return (
                  <button
                    key={r.value}
                    onClick={() => setForm(f => ({ ...f, role: r.value as StaffUser["role"] }))}
                    className="rounded-xl px-3 py-2.5 text-left transition-all border"
                    style={{
                      background: active ? r.bg : "var(--bg-subtle)",
                      borderColor: active ? r.color : "var(--border)",
                      color: active ? r.color : "var(--text-muted)",
                    }}
                  >
                    <Icon size={14} className="mb-1" />
                    <div className="text-xs font-semibold">{r.label}</div>
                    <div className="text-[10px] mt-0.5 leading-tight" style={{ color: active ? r.color : "var(--text-muted)", opacity: 0.8 }}>
                      {r.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-secondary)" }}>Full Name</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sarah Lim" />
            </div>
            {form.role === "LIVE_HOST" && (
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-secondary)" }}>
                  Display Name <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(shown on schedule)</span>
                </label>
                <Input
                  value={form.displayName}
                  onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                  placeholder="e.g. SARAH"
                  style={{ textTransform: "uppercase" }}
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-secondary)" }}>Email Address</label>
            <Input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="staff@13media.co"
            />
          </div>

          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-secondary)" }}>Password</label>
            <div className="relative">
              <Input
                type={showPass ? "text" : "password"}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min. 8 characters"
                style={{ paddingRight: "2.5rem" }}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
              Share these credentials with the staff member directly. They can be changed anytime.
            </p>
          </div>

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", color: "var(--danger)" }}>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={create} loading={saving}>
              <UserPlus size={13} /> Create Account
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit modal ───────────────────────────────────────────────── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit — ${editUser?.name ?? ""}`}>
        <div className="space-y-4 p-1">
          {/* Role selector */}
          <div>
            <label className="text-xs font-semibold mb-2 block" style={{ color: "var(--text-secondary)" }}>Access Level</label>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map(r => {
                const Icon = r.icon;
                const active = editForm.role === r.value;
                return (
                  <button
                    key={r.value}
                    onClick={() => setEditForm(f => ({ ...f, role: r.value as StaffUser["role"] }))}
                    className="rounded-xl px-3 py-2 text-left transition-all border"
                    style={{
                      background: active ? r.bg : "var(--bg-subtle)",
                      borderColor: active ? r.color : "var(--border)",
                      color: active ? r.color : "var(--text-muted)",
                    }}
                  >
                    <Icon size={13} className="mb-1" />
                    <div className="text-xs font-semibold">{r.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-secondary)" }}>Full Name</label>
              <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-secondary)" }}>Email Address</label>
              <Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>

          {/* Password reset */}
          <div>
            <label className="text-xs font-semibold mb-1 flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
              <KeyRound size={11} /> Reset Password
              <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(leave blank to keep current)</span>
            </label>
            <div className="relative">
              <Input
                type={showEditPass ? "text" : "password"}
                value={editForm.newPassword}
                onChange={e => setEditForm(f => ({ ...f, newPassword: e.target.value }))}
                placeholder="New password (min. 8 chars)"
                style={{ paddingRight: "2.5rem" }}
              />
              <button
                type="button"
                onClick={() => setShowEditPass(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              >
                {showEditPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", color: "var(--danger)" }}>
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={saveEdit} loading={saving}>Save Changes</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
