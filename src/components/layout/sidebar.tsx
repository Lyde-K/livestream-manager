"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import {
  LayoutDashboard, Calendar, BarChart3,
  Users, Building2, DoorOpen, Award, LogOut, TrendingUp,
  UserCheck, Sun, Moon, ChevronDown, Menu, X, Wallet, RefreshCw, AlertTriangle, Trophy, Wrench, UsersRound, Sparkles,
  Handshake, Package, Upload, Ban, Settings, Flag, ClipboardList, Bell, UmbrellaOff, Clapperboard, ShieldCheck,
} from "lucide-react";

type NavGroup = "LIVESTREAM" | "AFFILIATE" | "MANAGEMENT";
interface NavItem {
  label: string; href: string; icon: React.ElementType; roles: string[]; group: NavGroup;
  permission?: string; // if set, only shown when hostPermissions[permission] === true
}

const navItems: NavItem[] = [
  // LIVESTREAM
  { label: "Overview",          href: "/",                          icon: LayoutDashboard, roles: ["ADMIN","CLIENT"],            group: "LIVESTREAM" },
  { label: "My Overview",       href: "/",                          icon: LayoutDashboard, roles: ["LIVE_HOST"],                  group: "LIVESTREAM" },
  { label: "Schedule",          href: "/schedule",                  icon: Calendar,        roles: ["ADMIN"],     group: "LIVESTREAM" },
  { label: "Studio Schedule",   href: "/studio-schedule",           icon: Clapperboard,    roles: ["LIVE_HOST"], group: "LIVESTREAM" },
  { label: "My Schedule",       href: "/my-schedule",               icon: Calendar,        roles: ["LIVE_HOST"], group: "LIVESTREAM", permission: "viewMySchedule" },
  { label: "Brand Schedule",    href: "/client-brand",              icon: Calendar,        roles: ["CLIENT"],    group: "LIVESTREAM" },
  { label: "Performance",       href: "/performance",               icon: BarChart3,       roles: ["ADMIN"],     group: "LIVESTREAM" },
  { label: "My Performance",    href: "/my-performance",            icon: TrendingUp,      roles: ["LIVE_HOST"], group: "LIVESTREAM", permission: "viewPerformance" },
  { label: "AI Analysis",       href: "/intelligence",              icon: Sparkles,        roles: ["ADMIN"],     group: "LIVESTREAM" },
  { label: "My AI Analysis",    href: "/my-intelligence",           icon: Sparkles,        roles: ["LIVE_HOST"], group: "LIVESTREAM", permission: "viewAIAnalysis" },
  { label: "Brand AI Analysis", href: "/client-brand/intelligence", icon: Sparkles,        roles: ["CLIENT"],    group: "LIVESTREAM" },
  { label: "Leaderboard",       href: "/leaderboard",               icon: Trophy,          roles: ["ADMIN","LIVE_HOST"], group: "LIVESTREAM", permission: "viewLeaderboard" },
  { label: "Leave",             href: "/leave",                     icon: UmbrellaOff,     roles: ["ADMIN","LIVE_HOST"], group: "LIVESTREAM", permission: "viewLeave" },
  // AFFILIATE
  { label: "Overview",          href: "/affiliate",                 icon: LayoutDashboard, roles: ["ADMIN","CLIENT"], group: "AFFILIATE" },
  { label: "Creators",          href: "/affiliate/creators",        icon: Users,           roles: ["ADMIN","CLIENT"], group: "AFFILIATE" },
  { label: "Products",          href: "/affiliate/products",        icon: Package,         roles: ["ADMIN","CLIENT"], group: "AFFILIATE" },
  { label: "Blacklist",         href: "/affiliate/blacklist",       icon: Ban,             roles: ["ADMIN","CLIENT"], group: "AFFILIATE" },
  { label: "AI Analysis",       href: "/affiliate/ai-analysis",     icon: Sparkles,        roles: ["ADMIN","CLIENT"], group: "AFFILIATE" },
  { label: "Import",            href: "/affiliate/import",          icon: Upload,          roles: ["ADMIN"],          group: "AFFILIATE" },
  // MANAGEMENT (admin only)
  { label: "Brands",            href: "/admin/brands",              icon: Building2,       roles: ["ADMIN"], group: "MANAGEMENT" },
  { label: "Live Hosts",        href: "/admin/hosts",               icon: Users,           roles: ["ADMIN"], group: "MANAGEMENT" },
  { label: "Campaign Calendar",  href: "/admin/campaign-calendar",   icon: Flag,            roles: ["ADMIN"], group: "MANAGEMENT" },
  { label: "Clients",           href: "/admin/clients",             icon: UserCheck,       roles: ["ADMIN"], group: "MANAGEMENT" },
  { label: "Staff Accounts",    href: "/admin/users",               icon: UsersRound,      roles: ["ADMIN"], group: "MANAGEMENT" },
  { label: "Rooms",             href: "/admin/rooms",               icon: DoorOpen,        roles: ["ADMIN"], group: "MANAGEMENT" },
  { label: "Sample Costs",      href: "/admin/sample-costs",        icon: Wallet,          roles: ["ADMIN"], group: "MANAGEMENT" },
  { label: "KPI Settings",      href: "/admin/kpi",                 icon: Award,           roles: ["ADMIN"], group: "MANAGEMENT" },
  { label: "Intel Config",      href: "/admin/intelligence-config", icon: Sparkles,        roles: ["ADMIN"], group: "MANAGEMENT" },
  { label: "Payroll",           href: "/admin/payroll",             icon: Wallet,          roles: ["ADMIN"], group: "MANAGEMENT" },
  { label: "Livestream Import", href: "/import/livestream",         icon: Upload,          roles: ["ADMIN"], group: "MANAGEMENT" },
  { label: "Sheets Sync",       href: "/admin/sync",                icon: RefreshCw,       roles: ["ADMIN"], group: "MANAGEMENT" },
  { label: "Sync Errors",       href: "/admin/sync-log",            icon: AlertTriangle,   roles: ["ADMIN"], group: "MANAGEMENT" },
  { label: "Fix Duplicates",    href: "/admin/fix-duplicates",      icon: Wrench,          roles: ["ADMIN"], group: "MANAGEMENT" },
  { label: "Data Health",       href: "/admin/health",              icon: ShieldCheck,     roles: ["ADMIN"], group: "MANAGEMENT" },
];

const GROUP_META: Record<NavGroup, { label: string; icon: React.ElementType; accent: string }> = {
  LIVESTREAM:  { label: "Livestream",  icon: BarChart3,  accent: "#F97316" },
  AFFILIATE:   { label: "Affiliate",   icon: Handshake,  accent: "#FFC21A" },
  MANAGEMENT:  { label: "Management",  icon: Settings,   accent: "#A78BFA" },
};

interface SidebarProps {
  role: string;
  userName: string;
  hostType?: string;
  hostPermissions?: Record<string, boolean>;
}

function NavLink({ item, active, accent }: { item: NavItem; active: boolean; accent: string }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "relative flex items-center gap-2.5 px-3 py-[8px] rounded-lg text-[13px] font-medium transition-all duration-150 group",
      )}
      style={{
        background: active ? "var(--sidebar-active)" : "transparent",
        color: active ? "#F8FAFC" : "var(--sidebar-text)",
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover)"; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {/* Active left indicator bar */}
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r-full"
          style={{ background: accent, boxShadow: `0 0 12px ${accent}` }}
        />
      )}
      <item.icon
        size={14}
        style={{ opacity: active ? 1 : 0.55, flexShrink: 0, color: active ? accent : undefined }}
        className="group-hover:opacity-100 transition-opacity"
      />
      <span className="flex-1 leading-tight">{item.label}</span>
    </Link>
  );
}

interface SectionProps {
  group: NavGroup;
  items: NavItem[];
  activeCheck: (href: string) => boolean;
  defaultOpen?: boolean;
}

function NavSection({ group, items, activeCheck, defaultOpen = true }: SectionProps) {
  const meta = GROUP_META[group];
  const hasActive = items.some((i) => activeCheck(i.href));
  const [open, setOpen] = useState(defaultOpen || hasActive);

  // Open section if a child becomes active
  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  return (
    <div>
      {/* Section header — clickable to collapse */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer group"
        style={{ color: meta.accent }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <meta.icon size={13} style={{ flexShrink: 0, opacity: 0.9 }} />
        <span className="flex-1 text-left text-[11px] font-bold uppercase tracking-[.09em]">{meta.label}</span>
        <ChevronDown
          size={13}
          className="transition-transform duration-200"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", opacity: 0.7 }}
        />
      </button>

      {/* Items */}
      {open && (
        <div className="mt-1 space-y-0.5">
          {items.map((item) => (
            <NavLink key={item.label + item.href} item={item} active={activeCheck(item.href)} accent={meta.accent} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ role, userName, hostType, hostPermissions = {} }: SidebarProps) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [notifUnread, setNotifUnread] = useState(0);
  const [taskOpenCount, setTaskOpenCount] = useState(0);

  useEffect(() => {
    const onNotif = (e: Event) => setNotifUnread((e as CustomEvent<{ count: number }>).detail.count);
    const onTasks = (e: Event) => setTaskOpenCount((e as CustomEvent<{ count: number }>).detail.count);
    window.addEventListener("notification-unread-count", onNotif);
    window.addEventListener("task-open-count", onTasks);
    return () => {
      window.removeEventListener("notification-unread-count", onNotif);
      window.removeEventListener("task-open-count", onTasks);
    };
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const [hasAffiliate, setHasAffiliate] = useState<boolean>(role === "ADMIN");
  useEffect(() => {
    if (role === "ADMIN") { setHasAffiliate(true); return; }
    if (role !== "CLIENT") { setHasAffiliate(false); return; }
    fetch("/api/affiliate/brands")
      .then((r) => r.ok ? r.json() : { brands: [] })
      .then((d: { brands: { id: string }[] }) => setHasAffiliate((d.brands ?? []).length > 0))
      .catch(() => setHasAffiliate(false));
  }, [role]);

  const allItems = navItems.filter((i) => {
    if (!i.roles.includes(role)) return false;
    // For LIVE_HOST nav items that have a permission ticker, check the resolved value
    if (i.permission && role === "LIVE_HOST") return !!hostPermissions[i.permission];
    return true;
  });
  const livestreamItems = allItems.filter((i) => i.group === "LIVESTREAM").map(item =>
    item.href === "/leave" ? { ...item, label: role === "ADMIN" ? "Host Leaves" : "My Leave" } : item
  );
  const affiliateItems = hasAffiliate ? allItems.filter((i) => i.group === "AFFILIATE") : [];
  const managementItems = role === "ADMIN" ? allItems.filter((i) => i.group === "MANAGEMENT") : [];

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/affiliate") return pathname === "/affiliate";
    return pathname === href || pathname.startsWith(href + "/");
  }

  const sidebarContent = (
    <aside
      style={{ background: "var(--sidebar-bg)" }}
      className="flex flex-col h-full w-[224px] flex-shrink-0 select-none"
    >
      {/* Logo */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: "rgba(255,255,255,.07)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/13media-logo.png" alt="13 Media" className="h-12 w-auto object-contain flex-1 min-w-0" />
        <button
          onClick={() => setOpen(false)}
          className="lg:hidden p-1 rounded-md cursor-pointer flex-shrink-0 ml-1"
          style={{ color: "var(--sidebar-text)" }}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {livestreamItems.length > 0 && (
          <NavSection group="LIVESTREAM" items={livestreamItems} activeCheck={isActive} defaultOpen />
        )}
        {affiliateItems.length > 0 && (
          <NavSection group="AFFILIATE" items={affiliateItems} activeCheck={isActive} defaultOpen />
        )}
        {managementItems.length > 0 && (
          <NavSection group="MANAGEMENT" items={managementItems} activeCheck={isActive} defaultOpen={false} />
        )}
      </nav>

      {/* Footer */}
      <div className="px-2 py-2 border-t space-y-0.5" style={{ borderColor: "rgba(255,255,255,.07)" }}>
        {/* Tasks + Notifications row */}
        <div className="flex gap-1 mb-1">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("toggle-task-panel"))}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[12px] font-medium transition-all cursor-pointer"
            style={{ color: "var(--sidebar-text)", position: "relative" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <span style={{ position: "relative" }}>
              <ClipboardList size={14} className="opacity-70" />
              {taskOpenCount > 0 && (
                <span style={{ position: "absolute", top: "-5px", right: "-7px", fontSize: "8px", fontWeight: 700, background: "#F97316", color: "#fff", borderRadius: "50%", width: "13px", height: "13px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {taskOpenCount > 9 ? "9+" : taskOpenCount}
                </span>
              )}
            </span>
            Tasks
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("toggle-notification-panel"))}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[12px] font-medium transition-all cursor-pointer"
            style={{ color: "var(--sidebar-text)", position: "relative" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <span style={{ position: "relative" }}>
              <Bell size={14} className="opacity-70" />
              {notifUnread > 0 && (
                <span style={{ position: "absolute", top: "-5px", right: "-7px", fontSize: "8px", fontWeight: 700, background: "#ef4444", color: "#fff", borderRadius: "50%", width: "13px", height: "13px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {notifUnread > 9 ? "9+" : notifUnread}
                </span>
              )}
            </span>
            Alerts
          </button>
        </div>

        <button
          onClick={toggle}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-all cursor-pointer"
          style={{ color: "var(--sidebar-text)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          {theme === "dark" ? <Sun size={14} className="opacity-70" /> : <Moon size={14} className="opacity-70" />}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>

        <div className="flex items-center gap-2.5 px-2.5 py-2 my-0.5 rounded-lg" style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.05)" }}>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11.5px] font-bold flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #F97316 0%, #FFC21A 100%)",
              color: "#0A1424",
              boxShadow: "0 4px 12px rgba(249,115,22,.40)",
            }}
          >
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold truncate" style={{ color: "#F8FAFC" }}>{userName}</div>
            <div className="text-[10.5px] uppercase tracking-wider font-medium" style={{ color: "var(--sidebar-text-dim)" }}>{role.replace("_", " ")}</div>
          </div>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] transition-all cursor-pointer"
          style={{ color: "var(--sidebar-text)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          <LogOut size={14} className="opacity-70" />
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:flex h-full">
        {sidebarContent}
      </div>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}
      {/* Mobile drawer */}
      <div
        className={cn(
          "lg:hidden fixed inset-y-0 left-0 z-50 flex h-full transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </div>

      {/* Mobile top bar */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 h-14"
        style={{ background: "var(--sidebar-bg)", borderBottom: "1px solid rgba(255,255,255,.07)" }}
      >
        <button
          onClick={() => setOpen(true)}
          className="p-1.5 rounded-md cursor-pointer"
          style={{ color: "var(--sidebar-text)" }}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/13media-logo.png" alt="13 Media" className="h-8 w-auto object-contain flex-1" />
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("toggle-notification-panel"))}
          className="p-1.5 rounded-md cursor-pointer relative"
          style={{ color: "var(--sidebar-text)" }}
          aria-label="Notifications"
        >
          <Bell size={18} />
          {notifUnread > 0 && (
            <span style={{ position: "absolute", top: "4px", right: "2px", fontSize: "8px", fontWeight: 700, background: "#ef4444", color: "#fff", borderRadius: "50%", width: "13px", height: "13px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {notifUnread > 9 ? "9+" : notifUnread}
            </span>
          )}
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("toggle-task-panel"))}
          className="p-1.5 rounded-md cursor-pointer"
          style={{ color: "var(--sidebar-text)" }}
          aria-label="Tasks"
        >
          <ClipboardList size={18} />
        </button>
      </div>
    </>
  );
}
