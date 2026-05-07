"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrencyDetailed } from "@/lib/utils";
import { Plus, Trash2, Wallet, Package } from "lucide-react";

interface Brand {
  id: string;
  name: string;
  color: string;
  client: { user: { name: string } } | null;
}

interface SampleCost {
  id: string;
  brandId: string;
  period: string;
  unitCost: number;
  notes: string | null;
}

interface ProductRow {
  productId: string;
  productName: string;
  samplesShipped: number;
}

interface ProductCost {
  id: string;
  brandId: string;
  period: string;
  productId: string;
  productName: string;
  unitCost: number;
  notes: string | null;
}

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function SampleCostsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [costs, setCosts] = useState<SampleCost[]>([]);
  const [form, setForm] = useState({ brandId: "", period: thisMonth(), unitCost: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Product-level costs
  const [productBrandId, setProductBrandId] = useState("");
  const [productPeriod, setProductPeriod] = useState(thisMonth());
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productCosts, setProductCosts] = useState<ProductCost[]>([]);
  const [productCostInputs, setProductCostInputs] = useState<Record<string, string>>({});
  const [productNotesInputs, setProductNotesInputs] = useState<Record<string, string>>({});
  const [savingProduct, setSavingProduct] = useState<Record<string, boolean>>({});

  async function load() {
    const r = await fetch("/api/affiliate/sample-costs", { cache: "no-store" });
    const d = await r.json();
    setBrands(d.brands ?? []);
    setCosts(d.costs ?? []);
  }

  async function loadProducts() {
    if (!productBrandId || !productPeriod) {
      setProducts([]);
      setProductCosts([]);
      return;
    }
    const r = await fetch(`/api/affiliate/product-costs?brandId=${productBrandId}&period=${productPeriod}`, { cache: "no-store" });
    const d = await r.json();
    const prods: ProductRow[] = d.products ?? [];
    const costs: ProductCost[] = d.costs ?? [];
    setProducts(prods);
    setProductCosts(costs);

    // Seed inputs from existing saved costs
    const costMap = new Map(costs.map((c) => [c.productId, c]));
    const inputs: Record<string, string> = {};
    const notes: Record<string, string> = {};
    for (const p of prods) {
      const saved = costMap.get(p.productId);
      inputs[p.productId] = saved ? String(saved.unitCost) : "";
      notes[p.productId] = saved?.notes ?? "";
    }
    setProductCostInputs(inputs);
    setProductNotesInputs(notes);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { loadProducts(); }, [productBrandId, productPeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setError("");
    if (!form.brandId || !form.period || !form.unitCost) {
      setError("All fields except notes are required");
      return;
    }
    const cost = parseFloat(form.unitCost);
    if (!Number.isFinite(cost) || cost < 0) {
      setError("Unit cost must be a non-negative number");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/affiliate/sample-costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: form.brandId, period: form.period, unitCost: cost, notes: form.notes || null }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Save failed");
      return;
    }
    setForm({ brandId: "", period: thisMonth(), unitCost: "", notes: "" });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this sample cost entry?")) return;
    await fetch(`/api/affiliate/sample-costs?id=${id}`, { method: "DELETE" });
    load();
  }

  async function saveProductCost(product: ProductRow) {
    const raw = productCostInputs[product.productId];
    if (!raw) return;
    const cost = parseFloat(raw);
    if (!Number.isFinite(cost) || cost < 0) return;
    setSavingProduct((prev) => ({ ...prev, [product.productId]: true }));
    await fetch("/api/affiliate/product-costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: productBrandId,
        period: productPeriod,
        productId: product.productId,
        productName: product.productName,
        unitCost: cost,
        notes: productNotesInputs[product.productId] || null,
      }),
    });
    setSavingProduct((prev) => ({ ...prev, [product.productId]: false }));
    await loadProducts();
  }

  async function removeProductCost(id: string) {
    if (!confirm("Clear this product cost?")) return;
    await fetch(`/api/affiliate/product-costs?id=${id}`, { method: "DELETE" });
    await loadProducts();
  }

  const brandById = new Map(brands.map((b) => [b.id, b]));
  const productCostMap = new Map(productCosts.map((c) => [c.productId, c]));

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <Wallet size={20} /> Sample Costs
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Track sample costs at brand level (unit cost × samples shipped) or per individual product.
        </p>
      </div>

      {/* ─── Brand-level unit cost ─── */}
      <div>
        <div className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Brand-level unit cost</div>

        <div className="section-card p-4 space-y-3 max-w-3xl mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand</label>
              <Select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
                <option value="">Select brand…</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}{b.client ? ` — ${b.client.user.name}` : ""}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Period</label>
              <Input type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Unit Cost (RM)</label>
              <Input type="number" inputMode="decimal" step="0.01" min="0" placeholder="30.00" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Notes (optional)</label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. RM30 lipstick" />
            </div>
          </div>
          {error && <div className="text-sm" style={{ color: "#ef4444" }}>{error}</div>}
          <div className="flex justify-end">
            <Button onClick={save} loading={saving} disabled={!form.brandId || !form.period || !form.unitCost}>
              <Plus size={14} /> Save
            </Button>
          </div>
        </div>

        <div className="section-card">
          <div className="overflow-x-auto -mx-px">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--bg-subtle)" }}>
                <tr>
                  <th className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Brand</th>
                  <th className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Period</th>
                  <th className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Unit Cost</th>
                  <th className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide hidden md:table-cell" style={{ color: "var(--text-secondary)" }}>Notes</th>
                  <th className="px-2 sm:px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {costs.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>No brand-level costs yet.</td></tr>
                )}
                {costs.map((c) => {
                  const b = brandById.get(c.brandId);
                  return (
                    <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="px-2 sm:px-3 py-2 font-medium" style={{ color: "var(--text-primary)" }}>
                        {b ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full" style={{ background: b.color }} />
                            {b.name}
                          </span>
                        ) : c.brandId}
                      </td>
                      <td className="px-2 sm:px-3 py-2 font-mono tabular-nums" style={{ color: "var(--text-secondary)" }}>{c.period}</td>
                      <td className="px-2 sm:px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{formatCurrencyDetailed(c.unitCost)}</td>
                      <td className="px-2 sm:px-3 py-2 text-xs hidden md:table-cell" style={{ color: "var(--text-muted)" }}>{c.notes ?? "—"}</td>
                      <td className="px-2 sm:px-3 py-2 text-right">
                        <button
                          onClick={() => remove(c.id)}
                          className="p-1.5 rounded-md cursor-pointer transition-colors"
                          style={{ color: "var(--text-muted)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "color-mix(in oklab, #ef4444 12%, transparent)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                          aria-label="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ─── Per-product costs ─── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Package size={16} style={{ color: "var(--accent)" }} />
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Per-product costs</div>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
          Products auto-loaded from imported data. Enter cost per unit for each product that had samples shipped.
        </p>

        <div className="section-card p-4 mb-4 max-w-md">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand</label>
              <Select value={productBrandId} onChange={(e) => setProductBrandId(e.target.value)}>
                <option value="">Select brand…</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Period</label>
              <Input type="month" value={productPeriod} onChange={(e) => setProductPeriod(e.target.value)} />
            </div>
          </div>
        </div>

        {productBrandId && productPeriod && (
          <div className="section-card">
            {products.length === 0 ? (
              <div className="px-3 py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                No products found for this brand + period. Import product data first.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-px">
                <table className="w-full text-sm">
                  <thead style={{ background: "var(--bg-subtle)" }}>
                    <tr>
                      <th className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Product</th>
                      <th className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide hidden sm:table-cell" style={{ color: "var(--text-secondary)" }}>Samples</th>
                      <th className="px-2 sm:px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Unit Cost (RM)</th>
                      <th className="px-2 sm:px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide hidden md:table-cell" style={{ color: "var(--text-secondary)" }}>Notes</th>
                      <th className="px-2 sm:px-3 py-2 w-20 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => {
                      const saved = productCostMap.get(p.productId);
                      const isSaving = savingProduct[p.productId];
                      return (
                        <tr key={p.productId} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="px-2 sm:px-3 py-2" style={{ maxWidth: "260px" }}>
                            <div className="font-medium truncate" style={{ color: "var(--text-primary)" }} title={p.productName}>{p.productName}</div>
                          </td>
                          <td className="px-2 sm:px-3 py-2 text-right tabular-nums hidden sm:table-cell" style={{ color: p.samplesShipped > 0 ? "var(--text-primary)" : "var(--text-muted)" }}>
                            {p.samplesShipped > 0 ? p.samplesShipped : "—"}
                          </td>
                          <td className="px-2 sm:px-3 py-2 text-right" style={{ minWidth: "110px" }}>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              placeholder="—"
                              value={productCostInputs[p.productId] ?? ""}
                              onChange={(e) => setProductCostInputs((prev) => ({ ...prev, [p.productId]: e.target.value }))}
                              className="text-right w-full"
                            />
                          </td>
                          <td className="px-2 sm:px-3 py-2 hidden md:table-cell" style={{ minWidth: "130px" }}>
                            <Input
                              placeholder="Notes…"
                              value={productNotesInputs[p.productId] ?? ""}
                              onChange={(e) => setProductNotesInputs((prev) => ({ ...prev, [p.productId]: e.target.value }))}
                            />
                          </td>
                          <td className="px-2 sm:px-3 py-2 text-right">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                onClick={() => saveProductCost(p)}
                                loading={isSaving}
                                disabled={!productCostInputs[p.productId]}
                                className="text-xs px-2 py-1 h-auto"
                              >
                                {saved ? "Update" : "Save"}
                              </Button>
                              {saved && (
                                <button
                                  onClick={() => removeProductCost(saved.id)}
                                  className="p-1.5 rounded-md cursor-pointer transition-colors"
                                  style={{ color: "var(--text-muted)" }}
                                  onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "color-mix(in oklab, #ef4444 12%, transparent)"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
                                  aria-label="Clear"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!productBrandId && (
          <div className="section-card p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Select a brand and period above to load products.
          </div>
        )}
      </div>
    </div>
  );
}
