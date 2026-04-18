"use client";
import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "destructive" | "ghost" | "outline" | "link";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", loading, children, disabled, style, ...props }, ref) => {
    const base = "inline-flex items-center justify-center font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none gap-1.5 whitespace-nowrap";

    const sizeMap = {
      sm:   "text-[12px] px-2.5 py-1.5 h-7",
      md:   "text-[13px] px-3.5 py-2 h-8",
      lg:   "text-[14px] px-5 py-2.5 h-10",
      icon: "p-2 h-8 w-8",
    };

    const variantStyles: Record<string, React.CSSProperties> = {
      default:     { background: "var(--accent)", color: "#fff", boxShadow: "0 1px 2px rgba(99,102,241,.3)" },
      secondary:   { background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" },
      destructive: { background: "var(--danger)", color: "#fff" },
      ghost:       { background: "transparent", color: "var(--text-secondary)" },
      outline:     { background: "var(--bg-card)", color: "var(--text-primary)", border: "1px solid var(--border)" },
      link:        { background: "transparent", color: "var(--accent)", padding: 0, height: "auto" },
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(base, sizeMap[size], className)}
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
