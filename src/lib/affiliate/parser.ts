import { parseMYR } from "@/lib/utils";

export interface CreatorRow {
  creatorName: string;
  gmv: number;
  refunds: number;
  attributedOrders: number;
  itemsSold: number;
  itemsRefunded: number;
  aov: number;
  avgDailyProductsSold: number;
  videos: number;
  liveStreams: number;
  estCommission: number;
  samplesShipped: number;
}

export interface ProductRow {
  productId: string;
  productName: string;
  category: string | null;
  gmv: number;
  refunds: number;
  itemsSold: number;
  itemsRefunded: number;
  attributedOrders: number;
  avgDailyCustomers: number;
  avgDailyCreatorsWithSales: number;
  avgDailyCreatorsPosted: number;
  avgDailyVideosWithSales: number;
  avgDailyLivesWithSales: number;
  videos: number;
  liveStreams: number;
  estCommission: number;
  samplesShipped: number;
}

const norm = (s: unknown): string =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s.\-_/]+/g, "");

function findCol(headers: string[], candidates: string[]): number {
  const normHeaders = headers.map(norm);
  for (const c of candidates) {
    const idx = normHeaders.indexOf(norm(c));
    if (idx !== -1) return idx;
  }
  return -1;
}

const toInt = (v: unknown): number => {
  const n = parseInt(String(v ?? "").replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};

const toDecimal = (v: unknown): number => {
  if (v == null || v === "") return 0;
  const s = String(v);
  if (s.includes("RM")) return parseMYR(s);
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function parseCreatorRows(grid: unknown[][]): CreatorRow[] {
  if (grid.length < 2) return [];
  const headers = grid[0].map((h) => String(h ?? ""));

  const cols = {
    name: findCol(headers, ["Creator name", "Creator"]),
    gmv: findCol(headers, ["Creator-attributed GMV", "GMV"]),
    refunds: findCol(headers, ["Refunds"]),
    orders: findCol(headers, ["Attributed orders", "Orders"]),
    items: findCol(headers, ["Creator-attributed items sold", "Items sold"]),
    itemsRef: findCol(headers, ["Items refunded"]),
    aov: findCol(headers, ["AOV"]),
    avgDaily: findCol(headers, ["Avg. daily products sold", "Avg daily products sold"]),
    videos: findCol(headers, ["Videos"]),
    lives: findCol(headers, ["LIVE streams", "Live streams"]),
    commission: findCol(headers, ["Est. commission", "Est commission"]),
    samples: findCol(headers, ["Samples shipped"]),
  };

  if (cols.name === -1 || cols.gmv === -1) {
    throw new Error(`Creator file: missing required columns. Headers: ${headers.join(", ")}`);
  }

  const out: CreatorRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const row = grid[i];
    const name = String(row[cols.name] ?? "").trim();
    if (!name) continue;
    out.push({
      creatorName: name,
      gmv: toDecimal(row[cols.gmv]),
      refunds: toDecimal(row[cols.refunds]),
      attributedOrders: toInt(row[cols.orders]),
      itemsSold: toInt(row[cols.items]),
      itemsRefunded: toInt(row[cols.itemsRef]),
      aov: toDecimal(row[cols.aov]),
      avgDailyProductsSold: toDecimal(row[cols.avgDaily]),
      videos: toInt(row[cols.videos]),
      liveStreams: toInt(row[cols.lives]),
      estCommission: toDecimal(row[cols.commission]),
      samplesShipped: toInt(row[cols.samples]),
    });
  }
  return out;
}

export function parseProductRows(grid: unknown[][]): ProductRow[] {
  if (grid.length < 2) return [];
  const headers = grid[0].map((h) => String(h ?? ""));

  const cols = {
    name: findCol(headers, ["Product name"]),
    id: findCol(headers, ["Product ID"]),
    category: findCol(headers, ["Product category", "Category"]),
    gmv: findCol(headers, ["Creator-attributed GMV", "GMV"]),
    refunds: findCol(headers, ["Refunds"]),
    items: findCol(headers, ["Creator-attributed items sold", "Items sold"]),
    itemsRef: findCol(headers, ["Items refunded"]),
    orders: findCol(headers, ["Attributed orders", "Orders"]),
    avgCust: findCol(headers, ["Avg. daily customers", "Avg daily customers"]),
    avgCreatorsSales: findCol(headers, ["Avg. daily creators with sales", "Avg daily creators with sales"]),
    avgCreatorsPosted: findCol(headers, ["Avg. daily creators posted content", "Avg daily creators posted content"]),
    avgVideosSales: findCol(headers, ["Avg. daily videos with sales", "Avg daily videos with sales"]),
    avgLivesSales: findCol(headers, ["Avg. daily LIVE streams with sales", "Avg daily LIVE streams with sales"]),
    videos: findCol(headers, ["Videos"]),
    lives: findCol(headers, ["LIVE streams", "Live streams"]),
    commission: findCol(headers, ["Est. commission", "Est commission"]),
    samples: findCol(headers, ["Samples shipped"]),
  };

  if (cols.id === -1 || cols.name === -1 || cols.gmv === -1) {
    throw new Error(`Product file: missing required columns. Headers: ${headers.join(", ")}`);
  }

  const out: ProductRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const row = grid[i];
    const id = String(row[cols.id] ?? "").trim();
    const name = String(row[cols.name] ?? "").trim();
    if (!id || !name) continue;
    out.push({
      productId: id,
      productName: name,
      category: cols.category !== -1 ? String(row[cols.category] ?? "").trim() || null : null,
      gmv: toDecimal(row[cols.gmv]),
      refunds: toDecimal(row[cols.refunds]),
      itemsSold: toInt(row[cols.items]),
      itemsRefunded: toInt(row[cols.itemsRef]),
      attributedOrders: toInt(row[cols.orders]),
      avgDailyCustomers: toInt(row[cols.avgCust]),
      avgDailyCreatorsWithSales: toInt(row[cols.avgCreatorsSales]),
      avgDailyCreatorsPosted: toInt(row[cols.avgCreatorsPosted]),
      avgDailyVideosWithSales: toInt(row[cols.avgVideosSales]),
      avgDailyLivesWithSales: toInt(row[cols.avgLivesSales]),
      videos: toInt(row[cols.videos]),
      liveStreams: toInt(row[cols.lives]),
      estCommission: toDecimal(row[cols.commission]),
      samplesShipped: toInt(row[cols.samples]),
    });
  }
  return out;
}

export function isValidPeriod(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
}
