import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "destructive" | "secondary" | "outline";
  className?: string;
}

const variantStyles: Record<string, React.CSSProperties> = {
  default:     { background: "var(--accent-light)",  color: "var(--accent-text)" },
  success:     { background: "var(--success-light)", color: "var(--success-text)" },
  warning:     { background: "var(--warning-light)", color: "var(--warning-text)" },
  destructive: { background: "var(--danger-light)",  color: "var(--danger-text)" },
  secondary:   { background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" },
  outline:     { background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" },
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn("badge", className)}
      style={variantStyles[variant]}
    >
      {children}
    </span>
  );
}
