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
  UserCheck, Sun, Moon, ChevronRight, Menu, X, Wallet, RefreshCw, AlertTriangle, Trophy, Wrench,
} from "lucide-react";

interface NavItem { label: string; href: string; icon: React.ElementType; roles: string[]; }

const navItems: NavItem[] = [
  { label: "Dashboard",      href: "/",               icon: LayoutDashboard, roles: ["ADMIN","LIVE_HOST","CLIENT"] },
  { label: "Schedule",       href: "/schedule",        icon: Calendar,        roles: ["ADMIN"] },
  { label: "My Schedule",    href: "/my-schedule",     icon: Calendar,        roles: ["LIVE_HOST"] },
  { label: "Brand Schedule", href: "/client-brand",    icon: Calendar,        roles: ["CLIENT"] },
  { label: "Performance",    href: "/performance",     icon: BarChart3,       roles: ["ADMIN"] },
  { label: "My Performance", href: "/my-performance",  icon: TrendingUp,      roles: ["LIVE_HOST"] },
  { label: "Leaderboard",    href: "/leaderboard",     icon: Trophy,          roles: ["ADMIN","LIVE_HOST"] },
  { label: "Rooms",          href: "/admin/rooms",     icon: DoorOpen,        roles: ["ADMIN"] },
  { label: "Live Hosts",     href: "/admin/hosts",     icon: Users,           roles: ["ADMIN"] },
  { label: "Brands",         href: "/admin/brands",    icon: Building2,       roles: ["ADMIN"] },
  { label: "Clients",        href: "/admin/clients",   icon: UserCheck,       roles: ["ADMIN"] },
  { label: "KPI Settings",   href: "/admin/kpi",       icon: Award,           roles: ["ADMIN"] },
  { label: "Payroll",        href: "/admin/payroll",   icon: Wallet,          roles: ["ADMIN"] },
  { label: "Sheets Sync",    href: "/admin/sync",      icon: RefreshCw,       roles: ["ADMIN"] },
  { label: "Sync Errors",   href: "/admin/sync-log",     icon: AlertTriangle,   roles: ["ADMIN"] },
  { label: "Fix Duplicates", href: "/admin/fix-duplicates", icon: Wrench,          roles: ["ADMIN"] },
];

interface SidebarProps { role: string; userName: string; }

export function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => { setOpen(false); }, [pathname]);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const items = navItems.filter((i) => i.roles.includes(role));
  const mainItems = items.filter((i) => !i.href.startsWith("/admin"));
  const adminItems = items.filter((i) => i.href.startsWith("/admin"));

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  const sidebarContent = (
    <aside
      style={{ background: "var(--sidebar-bg)" }}
      className="flex flex-col h-full w-[220px] flex-shrink-0 select-none"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: "rgba(255,255,255,.07)" }}>
        <div className="flex-1 flex items-center gap-2.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/13media-logo.png" alt="13 Media" className="h-7 object-contain" style={{ maxWidth: 110 }} />
          <div className="text-[10.5px] flex-shrink-0" style={{ color: "var(--sidebar-text-dim)" }}>Livestream Manager</div>
        </div>
        {/* Mobile close button */}
        <button
          onClick={() => setOpen(false)}
          className="lg:hidden p-1 rounded-md cursor-pointer"
          style={{ color: "var(--sidebar-text)" }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {mainItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-100 group",
                active ? "text-white" : "hover:text-white"
              )}
              style={{
                background: active ? "var(--sidebar-active)" : "transparent",
                color: active ? "#fff" : "var(--sidebar-text)",
              }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover)"; }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <item.icon size={15} className={active ? "opacity-100" : "opacity-70 group-hover:opacity-100"} />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight size={12} className="opacity-60" />}
            </Link>
          );
        })}

        {role === "ADMIN" && adminItems.length > 0 && (
          <>
            <div className="px-3 pt-5 pb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[.08em]" style={{ color: "var(--sidebar-text-dim)" }}>Management</span>
            </div>
            {adminItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-100 group"
                  style={{
                    background: active ? "var(--sidebar-active)" : "transparent",
                    color: active ? "#fff" : "var(--sidebar-text)",
                  }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover)"; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <item.icon size={15} className={active ? "opacity-100" : "opacity-70 group-hover:opacity-100"} />
                  <span className="flex-1">{item.label}</span>
                  {active && <ChevronRight size={12} className="opacity-60" />}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t space-y-1" style={{ borderColor: "rgba(255,255,255,.07)" }}>
        <button
          onClick={toggle}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-all cursor-pointer"
          style={{ color: "var(--sidebar-text)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          {theme === "dark" ? <Sun size={15} className="opacity-70" /> : <Moon size={15} className="opacity-70" />}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>

        <div className="flex items-center gap-2.5 px-3 py-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: "var(--accent)" }}
          >
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-white truncate">{userName}</div>
            <div className="text-[10.5px]" style={{ color: "var(--sidebar-text-dim)" }}>{role.replace("_", " ")}</div>
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
      {/* ── Desktop: always-visible sidebar ── */}
      <div className="hidden lg:flex h-full">
        {sidebarContent}
      </div>

      {/* ── Mobile: slide-in drawer ── */}
      {/* Backdrop */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}
      {/* Drawer */}
      <div
        className={cn(
          "lg:hidden fixed inset-y-0 left-0 z-50 flex h-full transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </div>

      {/* ── Mobile top bar ── */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 h-14"
        style={{ background: "var(--sidebar-bg)", borderBottom: "1px solid rgba(255,255,255,.07)" }}
      >
        <button
          onClick={() => setOpen(true)}
          className="p-1.5 rounded-md cursor-pointer"
          style={{ color: "var(--sidebar-text)" }}
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/13media-logo.png" alt="13 Media" className="h-6 object-contain" style={{ maxWidth: 90 }} />
        </div>
      </div>
    </>
  );
}
