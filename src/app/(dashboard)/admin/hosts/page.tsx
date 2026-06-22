"use client";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Users, ChevronDown, ChevronRight, Phone, CreditCard, Banknote, Settings2, Camera, ChevronLeft } from "lucide-react";
import Link from "next/link";

interface Host {
  id: string;
  displayName: string;
  workingDays: number;
  isActive: boolean;
  type: string;
  hourlyRate: number;
  contactNo: string | null;
  icNo: string | null;
  bankName: string | null;
  bankAccount: string | null;
  avatarUrl: string | null;
  user: { id: string; name: string; email: string };
}

export default function HostsPage() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Host | null>(null);
  const [form, setForm] = useState({
    name: "", email: "", password: "", displayName: "", workingDays: "5",
    type: "FULL_TIME", hourlyRate: "40",
    contactNo: "", icNo: "", bankName: "", bankAccount: "",
  });
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/hosts", { cache: "no-store" });
    setHosts(await res.json());
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", email: "", password: "", displayName: "", workingDays: "5", type: "FULL_TIME", hourlyRate: "40", contactNo: "", icNo: "", bankName: "", bankAccount: "" });
    setOpen(true);
  }
  function openEdit(h: Host) {
    setEditing(h);
    setForm({
      name: h.user.name, email: h.user.email, password: "", displayName: h.displayName,
      workingDays: String(h.workingDays), type: h.type, hourlyRate: String(h.hourlyRate),
      contactNo: h.contactNo || "", icNo: h.icNo || "", bankName: h.bankName || "", bankAccount: h.bankAccount || "",
    });
    setOpen(true);
  }

  async function save() {
    setLoading(true);
    const url = editing ? `/api/hosts/${editing.id}` : "/api/hosts";
    const method = editing ? "PUT" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setLoading(false);
    setOpen(false);
    load();
  }

  async function toggleActive(h: Host) {
    await fetch(`/api/hosts/${h.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: h.user.name, email: h.user.email, displayName: h.displayName, workingDays: h.workingDays, isActive: !h.isActive }),
    });
    load();
  }

  const fullTime = hosts.filter(h => h.type !== "PART_TIME");
  const partTime = hosts.filter(h => h.type === "PART_TIME");

  return (
    <div className="space-y-5 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Live Hosts</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {hosts.filter(h => h.isActive).length} active · {partTime.length} part-time
          </p>
        </div>
        <Button onClick={openCreate}><Plus size={15} /> Add Host</Button>
      </div>

      <HostTable rows={fullTime} title="Full-Time Hosts" expandedId={expandedId} setExpandedId={setExpandedId} openEdit={openEdit} toggleActive={toggleActive} onAvatarUploaded={load} />
      <HostTable rows={partTime} title="Part-Time / Freelance" expandedId={expandedId} setExpandedId={setExpandedId} openEdit={openEdit} toggleActive={toggleActive} onAvatarUploaded={load} />

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Host" : "Add Live Host"}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Full Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Farisa Ahmad" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Display Name <span style={{ color: "var(--text-muted)" }}>(in title)</span>
              </label>
              <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="FARISA" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Email</label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="farisa@13media.co" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Password {editing && <span style={{ color: "var(--text-muted)" }}>(leave blank to keep)</span>}
            </label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editing ? "••••••••" : "Set password"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Type</label>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="FULL_TIME">Full-Time</option>
                <option value="PART_TIME">Part-Time / Freelance</option>
              </Select>
            </div>
            {form.type === "FULL_TIME" ? (
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Working Days / Week</label>
                <Select value={form.workingDays} onChange={(e) => setForm({ ...form, workingDays: e.target.value })}>
                  <option value="5">5 days</option>
                  <option value="6">6 days</option>
                </Select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Hourly Rate (RM)</label>
                <Input type="number" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} placeholder="40" />
              </div>
            )}
          </div>
          {form.type === "PART_TIME" && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wide pt-1" style={{ color: "var(--text-muted)" }}>Payment Details</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Contact No</label>
                  <Input value={form.contactNo} onChange={(e) => setForm({ ...form, contactNo: e.target.value })} placeholder="0123456789" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>IC No</label>
                  <Input value={form.icNo} onChange={(e) => setForm({ ...form, icNo: e.target.value })} placeholder="990101123456" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Bank</label>
                  <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="MAYBANK" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Account No</label>
                  <Input value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} placeholder="162012345678" />
                </div>
              </div>
            </>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={loading}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface HostTableProps {
  rows: Host[];
  title: string;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  openEdit: (h: Host) => void;
  toggleActive: (h: Host) => void;
  onAvatarUploaded: () => void;
}

const PAGE_SIZE = 10;

function HostTable({ rows, title, expandedId, setExpandedId, openEdit, toggleActive, onAvatarUploaded }: HostTableProps) {
  const [uploadingId, setUploadingId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);

  // Reset to page 1 when rows change (e.g. after add/edit)
  React.useEffect(() => { setPage(1); }, [rows.length]);

  const totalPages = Math.min(5, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleAvatarUpload(hostId: string, file: File) {
    setUploadingId(hostId);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", "host");
    fd.append("id", hostId);
    const res = await fetch("/api/upload/image", { method: "POST", body: fd });
    setUploadingId(null);
    if (res.ok) onAvatarUploaded();
    else { const d = await res.json(); alert(`Upload failed: ${d.error}`); }
  }

  return (
    <div className="section-card">
      <div className="section-card-header">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>{title}</h2>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Display</th>
            <th>Email</th>
            <th>Working Days / Rate</th>
            <th>Status</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6}>
                <div className="empty-state">
                  <Users size={28} className="mx-auto mb-2 opacity-40" />
                  No hosts yet.
                </div>
              </td>
            </tr>
          )}
          {pageRows.map((h) => (
            <React.Fragment key={h.id}>
              <tr>
                <td className="font-medium">
                  <div className="flex items-center gap-2">
                    <div className="relative group flex-shrink-0">
                      {h.avatarUrl
                        ? <img src={h.avatarUrl} alt={h.user.name} className="w-7 h-7 rounded-full object-cover" />
                        : (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ background: "var(--accent-light)", color: "var(--accent-text)" }}>
                            {h.user.name.charAt(0)}
                          </div>
                        )
                      }
                      <label
                        className="absolute inset-0 rounded-full flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: "rgba(0,0,0,0.45)" }}
                        title="Upload photo"
                      >
                        {uploadingId === h.id
                          ? <span className="text-[9px] text-white">…</span>
                          : <Camera size={11} color="white" />
                        }
                        <input type="file" accept="image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) { handleAvatarUpload(h.id, f); e.target.value = ""; } }} />
                      </label>
                    </div>
                    {h.user.name}
                  </div>
                </td>
                <td>
                  <code className="px-1.5 py-0.5 rounded text-xs font-mono"
                    style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                    {h.displayName}
                  </code>
                </td>
                <td style={{ color: "var(--text-secondary)" }}>{h.user.email}</td>
                <td>
                  {h.type === "PART_TIME"
                    ? <span className="text-sm" style={{ color: "var(--warning)" }}>Part-time · RM{h.hourlyRate}/hr</span>
                    : <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{h.workingDays} days/week</span>}
                </td>
                <td>
                  <Badge variant={h.isActive ? "success" : "secondary"}>{h.isActive ? "Active" : "Inactive"}</Badge>
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {h.type === "PART_TIME" && (
                      <Button size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}>
                        {expandedId === h.id ? <><ChevronDown size={13} /> Hide</> : <><ChevronRight size={13} /> Details</>}
                      </Button>
                    )}
                    {h.type !== "PART_TIME" && (
                      <Link href={`/admin/hosts/${h.id}/preferences`}>
                        <Button size="sm" variant="ghost"><Settings2 size={13} /> Prefs</Button>
                      </Link>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openEdit(h)}><Pencil size={13} /> Edit</Button>
                    <Button size="sm" variant={h.isActive ? "secondary" : "outline"} onClick={() => toggleActive(h)}>
                      {h.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </td>
              </tr>
              {h.type === "PART_TIME" && expandedId === h.id && (
                <tr>
                  <td colSpan={6} style={{ padding: 0, borderBottom: "1px solid var(--border)" }}>
                    <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4"
                      style={{ background: "var(--bg-subtle)" }}>
                      <DetailField icon={Phone} label="Contact No" value={h.contactNo} />
                      <DetailField icon={CreditCard} label="IC No" value={h.icNo} />
                      <DetailField icon={Banknote} label="Bank" value={h.bankName} />
                      <DetailField icon={Banknote} label="Account No" value={h.bankAccount} />
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded disabled:opacity-40 transition-colors hover:bg-[var(--bg-subtle)]"
              style={{ color: "var(--text-secondary)" }}
            >
              <ChevronLeft size={15} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className="min-w-[28px] h-7 px-2 rounded text-xs font-medium transition-all"
                style={{
                  background: page === n ? "var(--accent)" : "transparent",
                  color: page === n ? "#fff" : "var(--text-secondary)",
                }}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded disabled:opacity-40 transition-colors hover:bg-[var(--bg-subtle)]"
              style={{ color: "var(--text-secondary)" }}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailField({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={13} className="mt-0.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
      <div>
        <div className="text-[10px] uppercase tracking-wide font-medium" style={{ color: "var(--text-muted)" }}>{label}</div>
        <div className="text-sm font-medium mt-0.5" style={{ color: value ? "var(--text-primary)" : "var(--text-muted)" }}>
          {value || "—"}
        </div>
      </div>
    </div>
  );
}
