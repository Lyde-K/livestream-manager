"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Upload, FileText, CheckCircle2, AlertCircle, Users, Package } from "lucide-react";

interface Brand {
  id: string;
  name: string;
  hasAffiliate: boolean;
  client: { user: { name: string } } | null;
}

interface ImportResult {
  ok: boolean;
  brand: string;
  period: string;
  creators: number;
  products: number;
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function readSheetGrid(file: File): Promise<unknown[][]> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("No sheet found in file");
  const grid: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = row.values as unknown[];
    grid.push(vals.slice(1));
  });
  return grid;
}

export default function AffiliateImportPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState("");
  const [period, setPeriod] = useState(thisMonth());
  const [creatorsFile, setCreatorsFile] = useState<File | null>(null);
  const [productsFile, setProductsFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const creatorsRef = useRef<HTMLInputElement>(null);
  const productsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/brands", { cache: "no-store" })
      .then((r) => r.json())
      .then((all: Brand[]) => setBrands(all.filter((b) => b.hasAffiliate)));
  }, []);

  async function handleSubmit() {
    if (!brandId) {
      setError("Pick a brand");
      return;
    }
    if (!creatorsFile && !productsFile) {
      setError("Upload at least one file (creators or products)");
      return;
    }
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const payload: {
        brandId: string;
        period: string;
        creatorRows?: unknown[][];
        productRows?: unknown[][];
      } = { brandId, period };
      if (creatorsFile) payload.creatorRows = await readSheetGrid(creatorsFile);
      if (productsFile) payload.productRows = await readSheetGrid(productsFile);

      const res = await fetch("/api/affiliate/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed");
      } else {
        setResult(data);
        setCreatorsFile(null);
        setProductsFile(null);
        if (creatorsRef.current) creatorsRef.current.value = "";
        if (productsRef.current) productsRef.current.value = "";
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-in">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          Affiliate Import
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Upload TikTok Shop monthly Creator and Product exports for a brand.
        </p>
      </div>

      <div className="section-card p-5 space-y-4 max-w-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Brand
            </label>
            <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">Select a brand…</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.client ? ` — ${b.client.user.name}` : ""}
                </option>
              ))}
            </Select>
            {brands.length === 0 && (
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                No affiliate brands yet. Toggle <strong>Affiliate</strong> on a brand in admin → brands first.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Period
            </label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
        </div>

        <FileSlot
          label="Creators data"
          icon={<Users size={16} />}
          file={creatorsFile}
          onPick={setCreatorsFile}
          inputRef={creatorsRef}
          hint="2,000+ rows expected · uses 'Creator name' + 'Creator-attributed GMV'"
        />
        <FileSlot
          label="Affiliate Products data"
          icon={<Package size={16} />}
          file={productsFile}
          onPick={setProductsFile}
          inputRef={productsRef}
          hint="~50 rows expected · uses 'Product ID' + 'Product name'"
        />

        {error && (
          <div
            className="flex items-start gap-2 px-3 py-2 rounded-lg text-sm"
            style={{ background: "color-mix(in oklab, #ef4444 12%, transparent)", color: "#ef4444" }}
          >
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div
            className="flex items-start gap-2 px-3 py-2 rounded-lg text-sm"
            style={{ background: "color-mix(in oklab, #10b981 14%, transparent)", color: "#10b981" }}
          >
            <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              Imported into <strong>{result.brand}</strong> · {result.period} ·{" "}
              {result.creators > 0 && <>{result.creators} creators</>}
              {result.creators > 0 && result.products > 0 && " · "}
              {result.products > 0 && <>{result.products} products</>}
            </span>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button onClick={handleSubmit} loading={loading} disabled={!brandId || (!creatorsFile && !productsFile)}>
            <Upload size={15} /> Import
          </Button>
        </div>
      </div>
    </div>
  );
}

interface FileSlotProps {
  label: string;
  icon: React.ReactNode;
  file: File | null;
  onPick: (f: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  hint: string;
}

function FileSlot({ label, icon, file, onPick, inputRef, hint }: FileSlotProps) {
  return (
    <div>
      <label className="text-sm font-medium mb-1 flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
        {icon}
        {label}
      </label>
      <div className="flex items-center gap-2">
        <label
          className="flex-1 px-3 py-2 rounded-lg text-sm cursor-pointer flex items-center gap-2 border"
          style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}
        >
          <FileText size={14} style={{ color: "var(--text-muted)" }} />
          <span style={{ color: file ? "var(--text-primary)" : "var(--text-muted)" }}>
            {file?.name ?? "Choose .xlsx file…"}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </label>
        {file && (
          <Button variant="ghost" size="sm" onClick={() => onPick(null)}>
            Clear
          </Button>
        )}
      </div>
      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
        {hint}
      </p>
    </div>
  );
}
