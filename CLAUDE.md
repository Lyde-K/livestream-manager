# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start dev server (Next.js on port 3000)
npm run build      # production build (runs next build only — no migrations)
npm run lint       # ESLint via eslint.config.mjs
npm run seed       # seed DB via prisma/seed_run.ts
```

TypeScript check (no tsc in PATH — use the local binary):
```bash
./node_modules/.bin/tsc --noEmit
```

There are no automated tests.

## Architecture

### Stack
- **Next.js 16** App Router (React 19, TypeScript)
- **Prisma 7** ORM with `@prisma/adapter-neon` (WebSocket adapter) — client output goes to `src/generated/prisma/`
- **Neon PostgreSQL** — two clients in use:
  - `prisma` (`src/lib/prisma.ts`) — for all normal queries
  - `neon()` from `@neondatabase/serverless` — used directly only in admin migration routes where Prisma cannot be imported safely (e.g. `src/app/api/admin/apply-migrations/route.ts`)
- **NextAuth v5** (`next-auth@5.0.0-beta`) — credentials-only, JWT strategy. Session carries `id` and `role` on the user object. No database adapter for sessions.
- **Anthropic SDK** (`@anthropic-ai/sdk`) — Claude Haiku (`claude-haiku-4-5-20251001`) for streaming chat endpoints; Claude for AI analysis batch endpoints
- **Tailwind CSS v4** — utility classes + custom CSS variables (no `tailwind.config.js`, configured via PostCSS)

### Route structure
```
src/app/
  (dashboard)/          # layout.tsx: auth guard + sidebar + main scroll container
    layout.tsx          # flex h-screen overflow-hidden; main has overflow-y-auto
    page.tsx            # dashboard home
    affiliate/          # affiliate analytics sub-section
    admin/              # admin-only management pages
    intelligence/       # AI livestream analysis
    schedule/           # session scheduling
    ...
  api/                  # all API routes (Next.js route handlers)
    admin/              # migration + wipe endpoints (secret-protected, no auth import)
    affiliate/          # affiliate data, chat, AI analysis
    intelligence/       # livestream intelligence, chat
    ...
  login/
  globals.css           # design tokens as CSS variables, dark/light via data-theme attribute
```

### Design system
All colours are CSS variables defined in `globals.css`. Dark mode is the primary mode — activated by `data-theme="dark"` on the root. Variables include `--bg`, `--bg-card`, `--bg-subtle`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border`, `--accent` (blue #1677FF), `--accent-orange` (#F97316), `--accent-yellow` (#FFC21A). Sidebar background is always dark (`--sidebar-bg: #050C18`) regardless of theme.

Brand accents: orange `#F97316` (Livestream), gold `#FFC21A` (Affiliate), purple `#A78BFA` (Management).

`src/lib/utils.ts` exports `cn()` (clsx + tailwind-merge), `formatCurrency()` (RM), and domain helpers.

### Auth & access control
`auth()` from `src/lib/auth.ts` is called at the top of every API route handler. Session user is cast as `{ id: string; role: string }`. Three roles: `ADMIN`, `LIVE_HOST`, `CLIENT`.

`resolveAccessScope(userId, role, { brandId? })` in `src/lib/intelligence/scope.ts` returns scope constraints used to filter DB queries by brand or host. Always call this in intelligence/affiliate API routes to enforce role-based data access.

### AI chat endpoints
Both `/api/affiliate/chat` and `/api/intelligence/chat` follow the same pattern:
1. Auth check
2. Load context data from Prisma (top creators / session aggregates)
3. Build a `contextBlock` string
4. Call `client.messages.create({ stream: true, model: "claude-haiku-4-5-20251001", system: context + knowledge, messages: history })` 
5. Return a `ReadableStream` (`text/plain`) that streams Claude's response token by token

Knowledge modules are exported TS string constants from `src/lib/affiliate/chat-knowledge.ts` and `src/lib/intelligence/chat-knowledge.ts`.

### Schema migrations
**Do not run `prisma migrate` during the Vercel build** — it fails due to network restrictions in the build container. The build script is intentionally just `next build`.

For additive schema changes:
1. Add the model/field to `prisma/schema.prisma`
2. Run `prisma generate` locally to regenerate the client
3. Apply the DDL via `POST /api/admin/apply-migrations?secret=<ADMIN_MIGRATE_SECRET>` — this route uses the raw `neon()` client and maintains a `_sql_migrations` tracking table.

### Floating chat widget
`src/components/ui/FloatingChatWidget.tsx` is a portal-based (`ReactDOM.createPortal` into `document.body`) floating chat that bypasses the dashboard layout's CSS `transform` stacking context. It must use a portal — the `animate-in` class on the layout wrapper applies `transform: translateY(0)` which breaks `position: fixed` for any child rendered inside the normal React tree.

### Sidebar navigation
`src/components/layout/sidebar.tsx` defines `navItems[]` with `roles` arrays controlling visibility per role. Groups: `LIVESTREAM`, `AFFILIATE`, `MANAGEMENT`. Adding a new page requires adding an entry here.
