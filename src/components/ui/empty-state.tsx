import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {Icon && (
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
          style={{
            background: "var(--bg-subtle)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
          }}
        >
          <Icon size={20} />
        </div>
      )}
      <h3 className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{title}</h3>
      {description && (
        <p className="text-[13px] max-w-[360px]" style={{ color: "var(--text-secondary)" }}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
