interface PlatformBadgeProps {
  platform: string;
  showName?: boolean;
  size?: "xs" | "sm" | "md";
}

function TikTokIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.17 8.17 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
    </svg>
  );
}

function ShopeeIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a4 4 0 0 1 4 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2h4a2 2 0 0 0-2-2zm0 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
    </svg>
  );
}

export function PlatformBadge({ platform, showName = true, size = "sm" }: PlatformBadgeProps) {
  const norm = platform?.toUpperCase();
  const iconSize = size === "xs" ? 10 : size === "sm" ? 12 : 14;
  const px = size === "xs" ? "px-1.5 py-0.5" : "px-2 py-0.5";
  const text = size === "xs" ? "text-[10px]" : size === "sm" ? "text-[11px]" : "text-xs";

  if (norm === "BOTH") {
    return (
      <span className="inline-flex items-center gap-1">
        <PlatformBadge platform="TIKTOK" showName={showName} size={size} />
        <PlatformBadge platform="SHOPEE" showName={showName} size={size} />
      </span>
    );
  }

  if (norm === "TIKTOK") {
    return (
      <span className={`inline-flex items-center gap-1 font-semibold rounded-full ${px} ${text}`} style={{ background: "#000", color: "#fff" }}>
        <TikTokIcon size={iconSize} />
        {showName && "TikTok"}
      </span>
    );
  }

  if (norm === "SHOPEE") {
    return (
      <span className={`inline-flex items-center gap-1 font-semibold rounded-full ${px} ${text}`} style={{ background: "#ee4d2d", color: "#fff" }}>
        <ShopeeIcon size={iconSize} />
        {showName && "Shopee"}
      </span>
    );
  }

  return <span className={`inline-flex items-center ${px} ${text} rounded-full`} style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>{platform}</span>;
}

export function CountryFlag({ name }: { name: string }) {
  if (/\bSG\b/.test(name)) return <span title="Singapore">🇸🇬</span>;
  if (/\bMY\b/.test(name)) return <span title="Malaysia">🇲🇾</span>;
  return null;
}

export function stripCountry(name: string): string {
  return name.replace(/\s*\bSG\b\s*/g, " ").replace(/\s*\bMY\b\s*/g, " ").trim();
}

export function detectCountry(name: string): "MY" | "SG" | null {
  if (/\bSG\b/.test(name)) return "SG";
  if (/\bMY\b/.test(name)) return "MY";
  return null;
}
