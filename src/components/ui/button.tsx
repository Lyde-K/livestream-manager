"use client";
import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "secondary" | "destructive" | "ghost" | "outline" | "link";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", loading, children, disabled, style, ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none gap-1.5 whitespace-nowrap";

    const sizeMap = {
      sm:   "text-[12px] px-3 py-1.5 h-8",
      md:   "text-[13px] px-4 py-2 h-9",
      lg:   "text-[14px] px-5 py-2.5 h-11",
      icon: "p-2 h-9 w-9",
    };

    const variantStyles: Record<string, React.CSSProperties> = {
      // Primary CTA — 13 Media yellow with dark text (high contrast)
      primary: {
        background: "var(--accent-yellow)",
        color: "#0A1424",
        boxShadow: "0 1px 0 rgba(255,255,255,.18) inset, 0 6px 18px rgba(255,194,26,.22)",
      },
      // "default" kept as electric-blue for backward compat with existing pages
      default: {
        background: "var(--accent)",
        color: "#fff",
        boxShadow: "0 1px 0 rgba(255,255,255,.14) inset, 0 6px 16px rgba(22,119,255,.28)",
      },
      secondary: {
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
        backdropFilter: "blur(12px)",
      },
      destructive: {
        background: "var(--danger)",
        color: "#fff",
        boxShadow: "0 1px 0 rgba(255,255,255,.14) inset, 0 6px 16px rgba(239,68,68,.28)",
      },
      ghost: {
        background: "transparent",
        color: "var(--text-secondary)",
      },
      outline: {
        background: "transparent",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
      },
      link: {
        background: "transparent",
        color: "var(--accent)",
        padding: 0,
        height: "auto",
      },
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(base, sizeMap[size], "hover:brightness-110 active:brightness-95", className)}
        style={{ ...variantStyles[variant], ...style }}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
export { Button };
