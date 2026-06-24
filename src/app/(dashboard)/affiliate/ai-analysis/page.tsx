"use client";
import { useEffect, useRef, useState } from "react";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { Sparkles, Loader2, RefreshCw, TrendingUp, AlertTriangle, Zap, UserX, Target, ArrowLeft, Send, Bot, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

interface Brand { id: string; name: string; color: string; }

interface ReengageItem { name: string; reason: string; action: string; }
interface SparkItem { name: string; reason: string; expectedImpact: string; }
interface AvoidItem { name: string; reason: string; }
interface NewTargeting { recommendedType: string; reasoning: string; targetProfile: string; }

interface Analysis {
  executiveSummary: string;
  overallHealth: "STRONG" | "MODERATE" | "AT_RISK";
  keyInsights: string[];
  reengagementList: ReengageItem[];
  sparkCodeList: SparkItem[];
  avoidList: AvoidItem[];
  newAffiliateTargeting: NewTargeting;
  monthlyOutlook: string;
}

interface Meta {
  brandLabel: string;
  periodLabel: string;
  totalGmv: number;
  totalCreators: number;
  labelCounts: { STAR: number; A: number; B: number; F: number };
  ytdPeriods: string[];
}

interface ApiResponse { analysis: Analysis; meta: Meta; }

interface ChatMessage { role: "user" | "assistant"; content: string; }

const HEALTH_STYLES = {
  STRONG: { color: "#10b981", label: "Strong", bg: "color-mix(in oklab, #10b981 15%, transparent)" },
  MODERATE: { color: "#f59e0b", label: "Moderate", bg: "color-mix(in oklab, #f59e0b 15%, transparent)" },
  AT_RISK: { color: "#ef4444", label: "At Risk", bg: "color-mix(in oklab, #ef4444 15%, transparent)" },
};

const SUGGESTED_QUESTIONS = [
  "Which affiliates are new this period?",
  "Who should I give Spark Code boost to?",
  "Which creators should I re-engage?",
  "How does my ROI compare to industry benchmarks?",
  "Who are my top 5 creators by ROI?",
  "Which creators are F-rank risk?",
];

export default function AffiliateAIAnalysisPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [brandId, setBrandId] = useState("");
  const [period, setPeriod] = useState("YTD");
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"insights" | "chat">("insights");

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/affiliate/brands")
      .then((r) => r.json())
      .then((d: { brands: Brand[] }) => {
        setBrands(d.brands);
        if (d.brands.length === 1) setBrandId(d.brands[0].id);
      });
  }, []);

  useEffect(() => {
    const url = brandId ? `/api/affiliate/periods?brandId=${brandId}` : "/api/affiliate/periods";
    fetch(url).then((r) => r.json()).then((d: { periods: string[] }) => setPeriods(d.periods));
  }, [brandId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  const ytdYear = periods.length > 0 ? periods[0].substring(0, 4) : String(new Date().getFullYear());

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({ period });
      if (brandId) params.set("brandId", brandId);
      const res = await fetch(`/api/affiliate/ai-analysis?${params}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed");
      }
      const data: ApiResponse = await res.json();
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function sendChat(text: string) {
    const trimmed = text.trim();
    if (!trimmed || chatLoading) return;
    setChatInput("");

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setChatLoading(true);

    try {
      const res = await fetch("/api/affiliate/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          brandId: brandId || undefined,
          period,
          history: messages,
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages([...newHistory, { role: "assistant", content: `Error: ${err.error ?? "Failed to get response"}` }]);
        return;
      }

      // Stream the response
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setMessages([...newHistory, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages([...newHistory, { role: "assistant", content: assistantText }]);
      }
    } catch {
      setMessages([...newHistory, { role: "assistant", content: "Connection error — please try again." }]);
    } finally {
      setChatLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat(chatInput);
    }
  }

  const health = result ? HEALTH_STYLES[result.analysis.overallHealth] ?? HEALTH_STYLES.MODERATE : null;

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/affiliate" className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
              <ArrowLeft size={12} /> Overview
            </Link>
          </div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Sparkles size={20} style={{ color: "var(--accent)" }} /> Affiliate Insights
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Data-driven insights and a chat assistant powered by your affiliate data
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="section-card p-4 flex flex-wrap items-end gap-4">
        {brands.length > 1 && (
          <div className="min-w-[180px]">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Brand</label>
            <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">All brands</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
        )}
        <div className="min-w-[200px]">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Period</label>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="YTD">📅 {ytdYear} — Year to Date</option>
            {[...periods].reverse().map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </div>
        {tab === "insights" && (
          <button
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: loading ? "var(--bg-subtle)" : "var(--accent)",
              color: loading ? "var(--text-muted)" : "#fff",
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loading ? "Analysing…" : result ? "Re-analyse" : "Generate Insights"}
          </button>
        )}
        {loading && tab === "insights" && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Computing insights from your affiliate data…
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {(["insights", "chat"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={{
              borderColor: tab === t ? "var(--accent)" : "transparent",
              color: tab === t ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            {t === "insights" ? <span className="flex items-center gap-1.5"><Sparkles size={13} /> Insights Report</span>
              : <span className="flex items-center gap-1.5"><Bot size={13} /> Chat Assistant</span>}
          </button>
        ))}
      </div>

      {/* ── INSIGHTS TAB ── */}
      {tab === "insights" && (
        <>
          {loading && (
            <div className="space-y-3">
              <Skeleton className="h-32" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
              </div>
              <Skeleton className="h-48" />
            </div>
          )}

          {error && (
            <div className="section-card p-4 border" style={{ borderColor: "#ef4444", background: "color-mix(in oklab, #ef4444 8%, var(--bg-card))" }}>
              <p className="text-sm font-semibold mb-1" style={{ color: "#ef4444" }}>Failed to generate insights</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{error}</p>
            </div>
          )}

          {result && (
            <>
              {/* Meta bar */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs px-2 py-1 rounded-md font-medium" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
                  {result.meta.brandLabel}
                </span>
                <span className="text-xs px-2 py-1 rounded-md font-medium" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
                  {result.meta.periodLabel}
                </span>
                <span className="text-xs px-2 py-1 rounded-md font-medium" style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}>
                  {result.meta.totalCreators} creators · {formatCurrency(result.meta.totalGmv)} GMV
                </span>
                {health && (
                  <span className="text-xs px-2 py-1 rounded-md font-semibold" style={{ background: health.bg, color: health.color }}>
                    {health.label}
                  </span>
                )}
                <button
                  onClick={generate}
                  disabled={loading}
                  className="ml-auto inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md"
                  style={{ color: "var(--text-muted)", background: "var(--bg-subtle)" }}
                >
                  <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>

              {/* Executive Summary */}
              <div className="section-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={16} style={{ color: "var(--accent)" }} />
                  <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Executive Summary</h2>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {result.analysis.executiveSummary}
                </p>
                {result.analysis.keyInsights?.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {result.analysis.keyInsights.map((insight, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                        <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                        {insight}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Label stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(["STAR", "A", "B", "F"] as const).map((l) => {
                  const colors: Record<string, string> = { STAR: "#f59e0b", A: "#10b981", B: "var(--text-secondary)", F: "#ef4444" };
                  return (
                    <div key={l} className="section-card p-3">
                      <div className="text-xs font-medium mb-1" style={{ color: colors[l] }}>
                        {l === "STAR" ? "⭐ STAR" : l === "F" ? "🚫 F (Blacklist)" : `${l} Rank`}
                      </div>
                      <div className="text-2xl font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                        {result.meta.labelCounts[l]}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>creators</div>
                    </div>
                  );
                })}
              </div>

              {result.analysis.reengagementList?.length > 0 && (
                <div className="section-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <RefreshCw size={15} style={{ color: "#10b981" }} />
                    <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Re-engage — These creators need attention</h2>
                  </div>
                  <div className="space-y-3">
                    {result.analysis.reengagementList.map((item, i) => (
                      <div key={i} className="rounded-lg p-3" style={{ background: "var(--bg-subtle)" }}>
                        <div className="font-semibold text-sm mb-1" style={{ color: "var(--text-primary)" }}>{item.name}</div>
                        <div className="text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>{item.reason}</div>
                        <div className="text-xs font-medium flex items-center gap-1.5" style={{ color: "#10b981" }}>
                          <span>→</span> {item.action}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.analysis.sparkCodeList?.length > 0 && (
                <div className="section-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap size={15} style={{ color: "#f59e0b" }} />
                    <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Spark Code / Boost — Amplify these creators</h2>
                  </div>
                  <div className="space-y-3">
                    {result.analysis.sparkCodeList.map((item, i) => (
                      <div key={i} className="rounded-lg p-3" style={{ background: "var(--bg-subtle)" }}>
                        <div className="font-semibold text-sm mb-1" style={{ color: "var(--text-primary)" }}>{item.name}</div>
                        <div className="text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>{item.reason}</div>
                        <div className="text-xs font-medium flex items-center gap-1.5" style={{ color: "#f59e0b" }}>
                          <Zap size={10} /> Expected: {item.expectedImpact}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.analysis.avoidList?.length > 0 && (
                <div className="section-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <UserX size={15} style={{ color: "#ef4444" }} />
                    <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Avoid — Do not invest further</h2>
                  </div>
                  <div className="space-y-2">
                    {result.analysis.avoidList.map((item, i) => (
                      <div key={i} className="rounded-lg p-3" style={{ background: "color-mix(in oklab, #ef4444 6%, var(--bg-subtle))" }}>
                        <div className="font-semibold text-sm mb-0.5" style={{ color: "var(--text-primary)" }}>{item.name}</div>
                        <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{item.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.analysis.newAffiliateTargeting && (
                <div className="section-card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Target size={15} style={{ color: "var(--accent)" }} />
                    <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>New Affiliate Targeting</h2>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold px-2 py-1 rounded-md" style={{ background: "color-mix(in oklab, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
                      Recommended: {result.analysis.newAffiliateTargeting.recommendedType}
                    </span>
                  </div>
                  <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>{result.analysis.newAffiliateTargeting.reasoning}</p>
                  <div className="rounded-lg p-3 border" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
                    <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>IDEAL PROFILE</div>
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{result.analysis.newAffiliateTargeting.targetProfile}</p>
                  </div>
                </div>
              )}

              {result.analysis.monthlyOutlook && (
                <div className="section-card p-4 border-l-4" style={{ borderLeftColor: "var(--accent)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={14} style={{ color: "var(--accent)" }} />
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--accent)" }}>Next Month Focus</span>
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{result.analysis.monthlyOutlook}</p>
                </div>
              )}
            </>
          )}

          {!result && !loading && (
            <div className="section-card p-12 text-center">
              <Sparkles size={36} className="mx-auto mb-4 opacity-30" style={{ color: "var(--accent)" }} />
              <p className="text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>No insights yet</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Select a brand and period above, then click Generate Insights</p>
            </div>
          )}
        </>
      )}

      {/* ── CHAT TAB ── */}
      {tab === "chat" && (
        <div className="flex flex-col gap-3" style={{ height: "calc(100vh - 320px)", minHeight: "400px" }}>
          {/* Message list */}
          <div className="section-card flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                <Bot size={40} className="opacity-20" style={{ color: "var(--accent)" }} />
                <div>
                  <p className="text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Ask anything about your affiliate data</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Uses the brand and period selected above</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center max-w-md">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendChat(q)}
                      className="text-xs px-3 py-1.5 rounded-full border transition-colors text-left"
                      style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-subtle)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "color-mix(in oklab, var(--accent) 15%, var(--bg-subtle))" }}>
                    <Bot size={14} style={{ color: "var(--accent)" }} />
                  </div>
                )}
                <div
                  className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                  style={msg.role === "user"
                    ? { background: "var(--accent)", color: "#fff", borderBottomRightRadius: "4px" }
                    : { background: "var(--bg-subtle)", color: "var(--text-secondary)", borderBottomLeftRadius: "4px" }
                  }
                >
                  {msg.content || (msg.role === "assistant" && <span className="opacity-50">▋</span>)}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "var(--bg-subtle)" }}>
                    <User size={14} style={{ color: "var(--text-secondary)" }} />
                  </div>
                )}
              </div>
            ))}

            {chatLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "color-mix(in oklab, var(--accent) 15%, var(--bg-subtle))" }}>
                  <Bot size={14} style={{ color: "var(--accent)" }} />
                </div>
                <div className="rounded-2xl px-4 py-2.5 text-sm" style={{ background: "var(--bg-subtle)", borderBottomLeftRadius: "4px" }}>
                  <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-muted)" }} />
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <div className="section-card p-3 flex gap-2 items-end">
            <textarea
              ref={chatInputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your affiliate data… (Enter to send, Shift+Enter for new line)"
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm outline-none"
              style={{
                color: "var(--text-primary)",
                maxHeight: "120px",
                lineHeight: "1.5",
              }}
              onInput={(e) => {
                const t = e.currentTarget;
                t.style.height = "auto";
                t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
              }}
            />
            <button
              onClick={() => sendChat(chatInput)}
              disabled={chatLoading || !chatInput.trim()}
              className="p-2 rounded-lg transition-all flex-shrink-0"
              style={{
                background: chatLoading || !chatInput.trim() ? "var(--bg-subtle)" : "var(--accent)",
                color: chatLoading || !chatInput.trim() ? "var(--text-muted)" : "#fff",
                cursor: chatLoading || !chatInput.trim() ? "default" : "pointer",
              }}
            >
              <Send size={15} />
            </button>
          </div>

          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-xs self-end"
              style={{ color: "var(--text-muted)" }}
            >
              Clear chat
            </button>
          )}
        </div>
      )}
    </div>
  );
}
