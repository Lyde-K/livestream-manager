"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, UserCheck } from "lucide-react";

interface Client {
  id: string;
  user: { id: string; name: string; email: string };
  brands: { id: string; name: string; platform: string }[];
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/clients");
    setClients(await res.json());
  }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm({ name: "", email: "", password: "" }); setOpen(true); }
  function openEdit(c: Client) { setEditing(c); setForm({ name: c.user.name, email: c.user.email, password: "" }); setOpen(true); }

  async function save() {
    setLoading(true);
    const url = editing ? `/api/clients/${editing.id}` : "/api/clients";
    const method = editing ? "PUT" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setLoading(false); setOpen(false); load();
  }

  return (
    <div className="space-y-5 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Clients</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {clients.length} clients — can log in to view their brand schedule
          </p>
        </div>
        <Button onClick={openCreate}><Plus size={15} /> Add Client</Button>
      </div>

      <div className="section-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Email</th>
              <th>Brands</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">
                    <UserCheck size={28} className="mx-auto mb-2 opacity-40" />
                    No clients yet.
                  </div>
                </td>
              </tr>
            )}
            {clients.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: "var(--success-light)", color: "var(--success-text)" }}
                    >
                      {c.user.name.charAt(0)}
                    </div>
                    {c.user.name}
                  </div>
                </td>
                <td style={{ color: "var(--text-secondary)" }}>{c.user.email}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {c.brands.length === 0
                      ? <span className="text-xs" style={{ color: "var(--text-muted)" }}>No brands assigned</span>
                      : c.brands.map(b => (
                        <Badge key={b.id} variant={b.platform === "TIKTOK" ? "secondary" : "warning"} className="text-xs">
                          {b.name}
                        </Badge>
                      ))
                    }
                  </div>
                </td>
                <td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil size={13} /> Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Client" : "Add Client"}>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Company / Client Name</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tefal Malaysia" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Login Email</label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="brand@company.com" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Password {editing && <span style={{ color: "var(--text-muted)" }} className="font-normal">(leave blank to keep)</span>}
            </label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editing ? "••••••••" : "Set password"} />
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            After creating, assign brands to this client via the Brands page.
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={loading}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
