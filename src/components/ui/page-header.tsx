interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, eyebrow, actions }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap pb-2">
      <div className="min-w-0">
        {eyebrow && (
          <p
            className="text-[11px] font-semibold uppercase tracking-[.14em] mb-2"
            style={{ color: "var(--accent-text)" }}
          >
            {eyebrow}
          </p>
        )}
        <h1
          className="text-[26px] lg:text-[28px] font-bold tracking-tight leading-tight"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-[13.5px] mt-1.5" style={{ color: "var(--text-secondary)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>
      )}
    </div>
  );
}
