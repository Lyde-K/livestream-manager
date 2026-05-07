# Affiliate Module — Implementation Plan

## Architectural correction
The user said "use the Client model", but in this codebase:
- `Client` = login-account wrapper (1 user → 1 Client)
- `Brand` = the data-bearing entity (Mars, Nestle, etc.) — owned by a Client
- The Google Sheet tabs `Mars Creator`, `Nestle Creator` map to **Brand**, not Client

→ **Affiliate stats are keyed on `brandId`.** Visibility flag `hasAffiliate` lives on `Brand` so a single Client can have one livestream brand and one affiliate brand cleanly.

---

## Prisma schema changes

```prisma
model Brand {
  // existing fields...
  hasLivestream Boolean @default(true)
  hasAffiliate  Boolean @default(false)

  affiliateCreatorStats AffiliateCreatorStat[]
  affiliateProductStats AffiliateProductStat[]
  affiliateSampleCosts  AffiliateSampleCost[]
  affiliateImports      AffiliateImport[]
}

model AffiliateImport {
  id         String   @id @default(cuid())
  brandId    String
  brand      Brand    @relation(fields: [brandId], references: [id], onDelete: Cascade)
  period     String   // "YYYY-MM"
  kind       String   // "CREATOR" | "PRODUCT"
  source     String   // "XLSX" | "SHEET"
  rowCount   Int
  importedAt DateTime @default(now())
  importedBy String?

  @@index([brandId, period])
}

model AffiliateCreatorStat {
  id                  String  @id @default(cuid())
  brandId             String
  brand               Brand   @relation(fields: [brandId], references: [id], onDelete: Cascade)
  period              String  // "YYYY-MM"
  creatorName         String  // TikTok handle
  gmv                 Decimal @db.Decimal(14, 2)
  refunds             Decimal @db.Decimal(14, 2)
  attributedOrders    Int
  itemsSold           Int
  itemsRefunded       Int
  aov                 Decimal @db.Decimal(14, 2)
  avgDailyProductsSold Decimal @db.Decimal(10, 2)
  videos              Int
  liveStreams         Int
  estCommission       Decimal @db.Decimal(14, 2)
  samplesShipped      Int
  // computed/cached
  roi                 Decimal? @db.Decimal(10, 2) // gmv/estCommission
  rank                Int?     // within (brand, period) by GMV desc
  label               String?  // "STAR" | "A" | "B" | "F"

  updatedAt DateTime @updatedAt

  @@unique([brandId, period, creatorName])
  @@index([brandId, period])
  @@index([creatorName]) // cross-brand admin profile
}

model AffiliateProductStat {
  id                          String  @id @default(cuid())
  brandId                     String
  brand                       Brand   @relation(fields: [brandId], references: [id], onDelete: Cascade)
  period                      String
  productId                   String
  productName                 String
  category                    String?
  gmv                         Decimal @db.Decimal(14, 2)
  refunds                     Decimal @db.Decimal(14, 2)
  itemsSold                   Int
  itemsRefunded               Int
  attributedOrders            Int
  avgDailyCustomers           Int
  avgDailyCreatorsWithSales   Int
  avgDailyCreatorsPosted      Int
  avgDailyVideosWithSales     Int
  avgDailyLivesWithSales      Int
  videos                      Int
  liveStreams                 Int
  estCommission               Decimal @db.Decimal(14, 2)
  samplesShipped              Int
  roi                         Decimal? @db.Decimal(10, 2)
  tier                        String? // EXCEPTIONAL | AVERAGE | UNDERPERFORMING

  updatedAt DateTime @updatedAt

  @@unique([brandId, period, productId])
  @@index([brandId, period])
}

model AffiliateSampleCost {
  id        String  @id @default(cuid())
  brandId   String
  brand     Brand   @relation(fields: [brandId], references: [id], onDelete: Cascade)
  period    String
  unitCost  Decimal @db.Decimal(10, 2) // RM per sample
  notes     String?
  updatedAt DateTime @updatedAt

  @@unique([brandId, period])
}
```

---

## Routes (API)

```
POST  /api/affiliate/import            multipart: brandId, period, creatorsFile?, productsFile?
GET   /api/affiliate/overview          ?brandId=&period= or all-brands admin view
GET   /api/affiliate/creators          ?brandId=&period=&search=&sortBy=
GET   /api/affiliate/creators/[handle] cross-brand profile (admin) or single-brand history
GET   /api/affiliate/products          ?brandId=&period=&category=
GET   /api/affiliate/products/[id]
GET   /api/affiliate/blacklist         CSV export — F Rank creators
GET   /api/affiliate/labels            recompute & return labels for (brand, period)
POST  /api/affiliate/sample-costs      admin upsert
GET   /api/affiliate/trends            ?brandId= MoM video/livestream growth
POST  /api/affiliate/sheet-sync        v2 — Google Sheet ingest
```

---

## Pages

```
src/app/(dashboard)/affiliate/
├── page.tsx                    Overview: brand-period KPIs, top creators, blacklist count, MoM trend
├── creators/
│   ├── page.tsx                Leaderboard: rank, GMV, ROI, label chip, rank delta
│   └── [handle]/page.tsx       Profile: monthly history, brands worked with (admin only multi-brand)
├── products/
│   ├── page.tsx                Leaderboard by GMV, category filter, tier chip
│   └── [id]/page.tsx           Product trend MoM
├── ai-analysis/page.tsx        Creator label distribution + product tiers
├── blacklist/page.tsx          F Rank table + CSV export
└── import/page.tsx             Two upload slots, brand+month selector

src/app/(dashboard)/admin/
└── sample-costs/page.tsx       Editable grid: brand × period × unitCost
```

---

## Sidebar grouping
`src/components/layout/sidebar.tsx`:
```ts
const userBrands = await getUserBrands();
const showLivestream = userBrands.some(b => b.hasLivestream);
const showAffiliate  = userBrands.some(b => b.hasAffiliate);
```
Render `── LIVESTREAM ──` and `── AFFILIATE ──` group headings only when applicable. Admin sees both always.

---

## Importer

### XLSX path (v1)
- Two file slots: Creators + Products (either or both optional)
- Required: brand dropdown + month picker
- Header-resolved column lookup (mirrors Shopee/TikTok importer pattern)
- Currency parser: `parseRM(s)` → strip "RM", remove commas, parseFloat
- Atomic per-(brand, period, kind):
  1. delete existing rows for that key
  2. insert new rows
  3. write `AffiliateImport` log row
  4. recompute labels for (brand, period)

### Google Sheet path (v2)
- Tab name regex: `/^(.+?)\s+(Creator|Product)$/i`
- Brand match: case-insensitive on `Brand.name`. No match → 422 with `{ error: "Unknown brand: 'Foo'. Create the Brand first." }`
- Inside each tab, Month column is first; group rows by Month, ingest as (brand, month, kind) snapshots

---

## Label computation service
`src/lib/affiliate/labels.ts`:
```ts
function computeLabels(brandId, period) {
  // 1. fetch all CreatorStat for (brandId, period)
  // 2. compute roi = gmv / max(estCommission, 0.01)
  // 3. rank by GMV desc, store rank
  // 4. fetch last 12 months of CreatorStat for those creators
  // 5. compute consistency:
  //    a) monthsWithSales / monthsActive
  //    b) coefficientOfVariation(gmvSeries)
  //    c) consecutive months ranked top X%
  // 6. assign label per thresholds (configurable in IntelligenceConfig)
  // 7. bulk update label column
}
```
Triggered on every successful import.

---

## Build order

1. **Schema migration** — add fields & 4 tables, regenerate Prisma client
2. **Brand admin UI** — add `hasAffiliate` toggle, set on existing brands
3. **Importer route + page** — XLSX only, brand+month selector, header-resolved
4. **Test ingest** — load Jan/Feb/Mar/Apr for one brand
5. **Creator leaderboard** — list + sort + search + label chip + rank delta
6. **Cross-brand creator profile** — admin only
7. **Product leaderboard + detail**
8. **Sample costs admin page**
9. **Label/tier engine + AI Analysis page**
10. **Blacklist page + CSV export**
11. **Overview/Dashboard with MoM trends**
12. **Sidebar conditional grouping**
13. **Google Sheet sync (v2)**
14. **Admin thresholds in intelligence-config**

Each step deployed separately: `npm run build && vercel --prod --yes`, visually verified.

---

## Out of scope (this build)
- Affiliate-only client login flow
- Sample request workflow
- Per-creator-per-product breakdown
- Auto-creating missing Brands from Sheet sync (fail loudly instead)
