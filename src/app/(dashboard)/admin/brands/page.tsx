"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { PlatformBadge, CountryFlag, stripCountry, detectCountry } from "@/components/ui/platform-badge";
import { Plus, Pencil, Building2, Filter } from "lucide-react";

interface Client { id: string; user: { name: string }; }
interface Brand { id: string; name: string; platform: string; color: string; isActive: boolean; client: { user: { name: string } } | null; }

const BRAND_COLORS = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#8b5cf6","#06b6d4","#84cc16","#f97316","#14b8a6","#a855f7"];

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [form, setForm] = useState({ name: "", platform: "TIKTOK", color: "#6366f1", clientId: "" });
  const [loading, setLoading] = useState(false);
  const [platformTab, setPlatformTab] = useState<"ALL" | "TIKTOK" | "SHOPEE" | "BOTH">("ALL");

  async function load() {
    const [b, c] = await Promise.all([fetch("/api/brands"), fetch("/api/clients")]);
    setBrands(await b.json());
    setClients(await c.json());
  }

  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm({ name: "", platform: "TIKTOK", color: "#6366f1", clientId: "" }); setOpen(true); }
  function openEdit(b: Brand) { setEditing(b); setForm({ name: b.name, platform: b.platform, color: b.color, clientId: "" }); setOpen(true); }

  async function save() {
    setLoading(true);
    const url = editing ? `/api/brands/${editing.id}` : "/api/brands";
    const method = editing ? "PUT" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setLoading(false); setOpen(false); load();
  }

  async function toggleActive(b: Brand) {
    await fetch(`/api/brands/${b.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...b, isActive: !b.isActive }),
    });
    load();
  }

  const filtered = platformTab === "ALL" ? brands : brands.filter((b) => {
    if (platformTab === "TIKTOK") return b.platform === "TIKTOK" || b.platform === "BOTH";
    if (platformTab === "SHOPEE") return b.platform === "SHOPEE" || b.platform === "BOTH";
    return b.platform === "BOTH";
  });

  const myBrands = filtered.filter((b) => detectCountry(b.name) === "MY");
  const sgBrands = filtered.filter((b) => detectCountry(b.name) === "SG");
  const otherBrands = filtered.filter((b) => detectCountry(b.name) === null);

  function BrandGrid({ items }: { items: Brand[] }) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((brand) => (
          <div
            key={brand.id}
            className="section-card p-4 transition-opacity"
            style={{ opacity: brand.isActive ? 1 : 0.5 }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: brand.color + "20" }}>
                <Building2 size={18} style={{ color: brand.color }} />
              </div>
              <PlatformBadge platform={brand.platform} showName size="sm" />
            </div>
            <div className="font-semibold mb-0.5 flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
              <span>{stripCountry(brand.name)}</span>
              <CountryFlag name={brand.name} />
            </div>
            {brand.client && (
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{brand.client.user.name}</div>
            )}
            <div className="mt-3 flex gap-1.5 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <Button size="sm" variant="ghost" className="flex-1 text-xs" onClick={() => openEdit(brand)}>
                <Pencil size={12} /> Edit
              </Button>
              <Button size="sm" variant="secondary" className="flex-1 text-xs" onClick={() => toggleActive(brand)}>
                {brand.isActive ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Brands</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {brands.filter(b => b.isActive).length} active brands
          </p>
        </div>
        <Button onClick={openCreate}><Plus size={15} /> Add Brand</Button>
      </div>

      {/* Platform tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--bg-subtle)" }}>
        {([["ALL","All"], ["TIKTOK","TikTok"], ["SHOPEE","Shopee"], ["BOTH","Both"]] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setPlatformTab(val)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer"
            style={platformTab === val
              ? { background: "var(--accent)", color: "#fff" }
              : { color: "var(--text-secondary)" }}
          >
            {val === "TIKTOK" && <span className="mr-1">🎵</span>}
            {val === "SHOPEE" && <span className="mr-1">🛍️</span>}
            {label}
          </button>
        ))}
      </div>

      {brands.length === 0 && (
        <div className="section-card empty-state">
          <Building2 size={28} className="mx-auto mb-2 opacity-30" />
          No brands yet. Add your first brand.
        </div>
      )}

      {myBrands.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🇲🇾</span>
            <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Malaysia</h2>
            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}>{myBrands.filter(b => b.isActive).length} active</span>
          </div>
          <BrandGrid items={myBrands} />
        </div>
      )}

      {sgBrands.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🇸🇬</span>
            <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Singapore</h2>
            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)" }}>{sgBrands.filter(b => b.isActive).length} active</span>
          </div>
          <BrandGrid items={sgBrands} />
        </div>
      )}

      {otherBrands.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Other</h2>
          </div>
          <BrandGrid items={otherBrands} />
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Brand" : "Add Brand"}>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand Name</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tefal" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Platform</label>
              <Select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                <option value="TIKTOK">TikTok</option>
                <option value="SHOPEE">Shopee</option>
                <option value="BOTH">Both</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Assign Client</label>
              <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                <option value="">No client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.user.name}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Calendar Color</label>
            <div className="flex flex-wrap gap-2">
              {BRAND_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full cursor-pointer transition-transform ${form.color === c ? "scale-125" : "hover:scale-110"}`}
                  style={{
                    background: c,
                    outline: form.color === c ? `2px solid ${c}` : "none",
                    outlineOffset: form.color === c ? "2px" : "0",
                  }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={loading}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
