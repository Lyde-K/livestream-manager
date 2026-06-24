"use client";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Building2,
  Clock,
  DollarSign,
  Lightbulb,
  Loader2,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { IntelligencePeriodSelector, type RangeChoice } from "./PeriodSelector";
import { KpiTile } from "./KpiTile";
import { PerformanceSplitBar } from "./PerformanceSplitBar";
import { SessionTable } from "./SessionTable";
import { SessionDetailModal } from "./SessionDetailModal";
import { BrandSelect, type BrandOption } from "./BrandSelect";
import {
  BrandInsightsPanel,
  type BrandInsightRow,
} from "./BrandInsightsPanel";
import {
  HostLeaderboardTable,
  type HostLeaderboardEntry,
} from "./HostLeaderboardTable";
import { formatHours } from "./format";
import { funnelLabel } from "./format";
import { FloatingChatWidget } from "@/components/ui/FloatingChatWidget";

interface SummaryResponse {
  summary: {
    totalSessions: number;
    totalHours: number;
    totalGmv: number;
    totalAdsCost: number;
    avgGmvPerHour: number;
    avgConversionRate: number;
    avgRevenuePerViewer: number;
    avgAov: number;
    avgRoas: number;
    bauSessions: number;
    bauHours: number;
    bauGmv: number;
    campaignSessions: number;
    campaignHours: number;
    campaignGmv: number;
  };
  performanceSplit: { tier: string; count: number; pct: number }[];
  sessionCount: number;
}

interface SessionListItem {
  sessionId: string;
  tier: string;
  funnelStage: string;
  gmv: number;
  gmvPerHour: number | null;
  durationHours: number | null;
  viewers: number | null;
  ctor: number | null;
  isCampaignDay: boolean;
  brand?: { name: string; color: string } | null;
  host?: { displayName: string } | null;
  platform: "TIKTOK" | "SHOPEE";
}

interface SessionsResponse {
  sessions: SessionListItem[];
  topBottom: {
    top: SessionListItem[];
    bottom: SessionListItem[];
  };
}

interface HostsResponse {
  hosts: HostLeaderboardEntry[];
}

interface BrandsResponse {
  brands: (BrandInsightRow & { platform: string })[];
}

interface InsightsResponse {
  keyInsights: { text: string; weight: number }[];
  actionPriorities: {
    rank: number;
    funnelStage: string;
    affectedSessions: number;
    headline: string;
    topActions: string[];
  }[];
}

interface ChatMessage { role: "user" | "assistant"; content: string; }

const LIVESTREAM_SUGGESTED_QUESTIONS = [
  "Who is my best performing host?",
  "Which sessions are underperforming and why?",
  "How does my GMV/hr compare to benchmarks?",
  "Which hosts are consistently late?",
  "What's my BAU vs campaign GMV split?",
  "When should I schedule sessions for best results?",
];

export interface DashboardOptions {
  scope: "ADMIN" | "CLIENT" | "LIVE_HOST";
  title: string;
  subtitle: string;
}

export function IntelligenceDashboard({
  scope,
  title,
  subtitle,
}: DashboardOptions) {
  const [range, setRange] = useState<RangeChoice>({
    key: "last30",
    label: "Last 30 days",
    from: new Date(Date.now() - 30 * 86400_000),
    to: new Date(),
  });
  const [brandId, setBrandId] = useState<string>("");
  const [availableBrands, setAvailableBrands] = useState<BrandOption[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [sessionsData, setSessionsData] = useState<SessionsResponse | null>(
    null,
  );
  const [hosts, setHosts] = useState<HostsResponse | null>(null);
  const [brands, setBrands] = useState<BrandsResponse | null>(null);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "chat">("dashboard");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setBrandsLoading(true);
    fetch("/api/intelligence/available-brands")
      .then((r) => r.json())
      .then((j: { brands: BrandOption[] }) => setAvailableBrands(j.brands ?? []))
      .catch(() => setAvailableBrands([]))
      .finally(() => setBrandsLoading(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("from", range.from.toISOString());
    params.set("to", range.to.toISOString());
    if (brandId) params.set("brandId", brandId);
    const qs = params.toString();

    setLoading(true);
    Promise.all([
      fetch(`/api/intelligence/summary?${qs}`).then((r) => r.json()),
      fetch(`/api/intelligence/sessions?${qs}`).then((r) => r.json()),
      fetch(`/api/intelligence/hosts?${qs}`).then((r) => r.json()),
      fetch(`/api/intelligence/brands?${qs}`).then((r) => r.json()),
      fetch(`/api/intelligence/insights?${qs}`).then((r) => r.json()),
    ])
      .then(([s, sess, h, b, ins]) => {
        setSummary(s);
        setSessionsData(sess);
        setHosts(h);
        setBrands(b);
        setInsights(ins);
      })
      .catch(() => {
        /* surface in UI later */
      })
      .finally(() => setLoading(false));
  }, [range, brandId]);

  const selectedBrandName = brandId
    ? availableBrands.find((b) => b.id === brandId)?.name
    : null;

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  async function sendChat(text: string) {
    const trimmed = text.trim();
    if (!trimmed || chatLoading) return;
    setChatInput("");
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const newHistory = [...chatMessages, userMsg];
    setChatMessages(newHistory);
    setChatLoading(true);
    try {
      const res = await fetch("/api/intelligence/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          brandId: brandId || undefined,
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          history: chatMessages,
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setChatMessages([...newHistory, { role: "assistant", content: `Error: ${err.error ?? "Failed"}` }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setChatMessages([...newHistory, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setChatMessages([...newHistory, { role: "assistant", content: assistantText }]);
      }
    } catch {
      setChatMessages([...newHistory, { role: "assistant", content: "Connection error — please try again." }]);
    } finally {
      setChatLoading(false);
    }
  }

  function handleChatKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(chatInput); }
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="text-center">
        <h1
          className="text-[24px] font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h1>
        <p
          className="text-[13px] mt-1"
          style={{ color: "var(--text-secondary)" }}
        >
          {subtitle}
        </p>
      </div>

      <div className="flex items-center justify-center gap-3 flex-wrap">
        <IntelligencePeriodSelector value={range} onChange={setRange} />
        <BrandSelect
          value={brandId}
          onChange={setBrandId}
          brands={availableBrands}
          loading={brandsLoading}
          showAll={scope !== "CLIENT" || availableBrands.length > 1}
        />
        {summary && (
          <div
            className="text-[12px]"
            style={{ color: "var(--text-muted)" }}
          >
            {summary.sessionCount} sessions ·{" "}
            {formatHours(summary.summary.totalHours)} live
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        <button
          onClick={() => setActiveTab("dashboard")}
          className="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5"
          style={{ borderColor: activeTab === "dashboard" ? "var(--accent)" : "transparent", color: activeTab === "dashboard" ? "var(--accent)" : "var(--text-secondary)" }}
        >
          <Sparkles size={13} /> Insights Dashboard
        </button>
        <button
          onClick={() => setActiveTab("chat")}
          className="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5"
          style={{ borderColor: activeTab === "chat" ? "var(--accent)" : "transparent", color: activeTab === "chat" ? "var(--accent)" : "var(--text-secondary)" }}
        >
          <Bot size={13} /> Chat Assistant
        </button>
      </div>

      {/* ── CHAT TAB ── */}
      {activeTab === "chat" && (
        <div className="flex flex-col gap-3" style={{ height: "calc(100vh - 340px)", minHeight: "400px" }}>
          <div className="section-card flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                <Bot size={40} className="opacity-20" style={{ color: "var(--accent)" }} />
                <div>
                  <p className="text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Ask anything about your livestream performance</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Uses the period and brand selected above</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                  {LIVESTREAM_SUGGESTED_QUESTIONS.map((q) => (
                    <button key={q} onClick={() => sendChat(q)}
                      className="text-xs px-3 py-1.5 rounded-full border transition-colors text-left"
                      style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-subtle)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                    >{q}</button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "color-mix(in oklab, var(--accent) 15%, var(--bg-subtle))" }}>
                    <Bot size={14} style={{ color: "var(--accent)" }} />
                  </div>
                )}
                <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                  style={msg.role === "user"
                    ? { background: "var(--accent)", color: "#fff", borderBottomRightRadius: "4px" }
                    : { background: "var(--bg-subtle)", color: "var(--text-secondary)", borderBottomLeftRadius: "4px" }}>
                  {msg.content || (msg.role === "assistant" && <span className="opacity-50">▋</span>)}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "var(--bg-subtle)" }}>
                    <User size={14} style={{ color: "var(--text-secondary)" }} />
                  </div>
                )}
              </div>
            ))}
            {chatLoading && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "color-mix(in oklab, var(--accent) 15%, var(--bg-subtle))" }}>
                  <Bot size={14} style={{ color: "var(--accent)" }} />
                </div>
                <div className="rounded-2xl px-4 py-2.5 text-sm" style={{ background: "var(--bg-subtle)", borderBottomLeftRadius: "4px" }}>
                  <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-muted)" }} />
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>
          <div className="section-card p-3 flex gap-2 items-end">
            <textarea ref={chatInputRef} value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              placeholder="Ask about your livestream data… (Enter to send, Shift+Enter for new line)"
              rows={1} className="flex-1 resize-none bg-transparent text-sm outline-none"
              style={{ color: "var(--text-primary)", maxHeight: "120px", lineHeight: "1.5" }}
              onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 120)}px`; }}
            />
            <button onClick={() => sendChat(chatInput)} disabled={chatLoading || !chatInput.trim()}
              className="p-2 rounded-lg transition-all flex-shrink-0"
              style={{ background: chatLoading || !chatInput.trim() ? "var(--bg-subtle)" : "var(--accent)", color: chatLoading || !chatInput.trim() ? "var(--text-muted)" : "#fff", cursor: chatLoading || !chatInput.trim() ? "default" : "pointer" }}>
              <Send size={15} />
            </button>
          </div>
          {chatMessages.length > 0 && (
            <button onClick={() => setChatMessages([])} className="text-xs self-end" style={{ color: "var(--text-muted)" }}>Clear chat</button>
          )}
        </div>
      )}

      {activeTab === "dashboard" && loading && !summary && (
        <div
          className="text-sm py-12 text-center"
          style={{ color: "var(--text-muted)" }}
        >
          Loading AI analysis…
        </div>
      )}

      {activeTab === "dashboard" && summary && (
        <Section title="Executive summary" icon={DollarSign}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiTile
              accent="indigo"
              label="GMV"
              value={formatCurrency(summary.summary.totalGmv)}
              icon={DollarSign}
            />
            <KpiTile
              accent="violet"
              label="Live hours"
              value={formatHours(summary.summary.totalHours)}
              sublabel={`${summary.summary.totalSessions} sessions`}
              icon={Clock}
            />
            <KpiTile
              accent="emerald"
              label="GMV / hour"
              value={formatCurrency(summary.summary.avgGmvPerHour)}
              icon={TrendingUp}
            />
            <KpiTile
              accent="sky"
              label="Avg ROAS"
              value={
                Number.isFinite(summary.summary.avgRoas)
                  ? `${summary.summary.avgRoas.toFixed(2)}x`
                  : "—"
              }
              sublabel="TikTok ad spend only"
              icon={Target}
            />
            <KpiTile
              label="BAU GMV"
              value={formatCurrency(summary.summary.bauGmv)}
              sublabel={`${summary.summary.bauSessions} sessions · ${formatHours(summary.summary.bauHours)}`}
            />
            <KpiTile
              label="Campaign GMV"
              value={formatCurrency(summary.summary.campaignGmv)}
              sublabel={`${summary.summary.campaignSessions} sessions · ${formatHours(summary.summary.campaignHours)}`}
            />
            <KpiTile
              label="Conversion rate"
              value={`${(summary.summary.avgConversionRate * 100).toFixed(2)}%`}
            />
            <KpiTile
              label="Total ad spend"
              value={formatCurrency(summary.summary.totalAdsCost)}
            />
          </div>
        </Section>
      )}

      {activeTab === "dashboard" && scope === "ADMIN" && brands && brands.brands.length > 0 && !brandId && (
        <Section title="Brand insights" icon={Building2}>
          <BrandInsightsPanel
            brands={brands.brands}
            onSelectSession={setSelectedId}
          />
        </Section>
      )}

      {activeTab === "dashboard" && summary && (
        <Section title="Performance split" icon={BarChart3}>
          <PerformanceSplitBar split={summary.performanceSplit} />
        </Section>
      )}

      {activeTab === "dashboard" && sessionsData && (
        <div className="grid lg:grid-cols-2 gap-4">
          <SessionTable
            title={selectedBrandName ? `Top sessions · ${selectedBrandName}` : "Top sessions"}
            rows={sessionsData.topBottom.top}
            onSelect={setSelectedId}
          />
          <SessionTable
            title={selectedBrandName ? `Bottom sessions · ${selectedBrandName}` : "Bottom sessions"}
            rows={sessionsData.topBottom.bottom}
            onSelect={setSelectedId}
          />
        </div>
      )}

      {activeTab === "dashboard" && scope !== "LIVE_HOST" && hosts && hosts.hosts.length > 0 && (
        <Section title="Host leaderboard" icon={Users}>
          <HostLeaderboardTable hosts={hosts.hosts} />
        </Section>
      )}

      {activeTab === "dashboard" && insights && insights.keyInsights.length > 0 && (
        <Section title="Key insights" icon={Lightbulb}>
          <ul className="space-y-2">
            {insights.keyInsights.map((k, i) => (
              <li
                key={i}
                className="rounded-lg p-3 flex items-start gap-3 transition-colors hover:[background:var(--bg-hover)]"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                }}
              >
                <Lightbulb
                  size={14}
                  className="mt-0.5"
                  style={{ color: "var(--accent)" }}
                />
                <span
                  className="text-[13px] leading-relaxed"
                  style={{ color: "var(--text-primary)" }}
                >
                  {k.text}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {activeTab === "dashboard" && insights && insights.actionPriorities.length > 0 && (
        <Section title="Top action priorities" icon={AlertTriangle}>
          <div className="space-y-3">
            {insights.actionPriorities.map((a) => (
              <div
                key={a.rank}
                className="rounded-xl p-4 transition-colors hover:[background:var(--bg-hover)]"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                    style={{
                      background: "var(--accent-light)",
                      color: "var(--accent-text)",
                    }}
                  >
                    {a.rank}
                  </div>
                  <div className="flex-1">
                    <div
                      className="text-[10px] uppercase font-medium tracking-wider mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {funnelLabel(a.funnelStage)} · {a.affectedSessions}{" "}
                      affected
                    </div>
                    <h3
                      className="text-[14px] font-semibold mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {a.headline}
                    </h3>
                    <ul className="space-y-1.5">
                      {a.topActions.map((act, i) => (
                        <li
                          key={i}
                          className="text-[12.5px] flex gap-2 items-start"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          <span style={{ color: "var(--accent)" }}>→</span>
                          {act}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {activeTab === "dashboard" && <SessionDetailModal
        sessionId={selectedId}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
      />}

      <FloatingChatWidget
        endpoint="/api/intelligence/chat"
        payload={{
          brandId: brandId || undefined,
          from: range.from.toISOString(),
          to: range.to.toISOString(),
        }}
        suggestedQuestions={LIVESTREAM_SUGGESTED_QUESTIONS}
        title="Livestream Bot"
      />
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} style={{ color: "var(--text-secondary)" }} />
        <h2
          className="text-[13px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-secondary)" }}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
