import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAccessScope } from "@/lib/intelligence/scope";
import { LIVESTREAM_KNOWLEDGE } from "@/lib/intelligence/chat-knowledge";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

function fmt(n: number) {
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtHr(h: number) {
  return `${h.toFixed(1)}h`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { id: string; role: string };

  const body = await req.json() as {
    message: string;
    brandId?: string;
    from?: string;
    to?: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };

  const { message, brandId, history = [] } = body;
  if (!message?.trim()) return Response.json({ error: "No message" }, { status: 400 });

  const scope = await resolveAccessScope(user.id, user.role, { brandId });

  const now = new Date();
  const fromDate = body.from ? new Date(body.from) : new Date(now.getTime() - 30 * 86400_000);
  const toDate = body.to ? new Date(body.to) : now;

  // Build prisma filters based on scope
  const brandFilter = scope.brandIds ? { in: scope.brandIds } : undefined;
  const hostFilter = scope.liveHostId ? scope.liveHostId : undefined;

  const sessionWhere = {
    status: "COMPLETED" as const,
    scheduledStart: { gte: fromDate, lte: toDate },
    ...(brandFilter ? { brandId: brandFilter } : {}),
    ...(hostFilter ? { liveHostId: hostFilter } : {}),
  };

  // ── Load context data ────────────────────────────────────────────────────────
  const [sessions, brands, hosts] = await Promise.all([
    prisma.session.findMany({
      where: sessionWhere,
      select: {
        id: true, platform: true, scheduledStart: true,
        gmv: true, actualDurationMinutes: true, isCampaignDay: true,
        viewers: true, peakViewers: true, views: true,
        productClicks: true, productImpressions: true,
        ctr: true, ctor: true, adsCost: true, punctuality: true,
        liveHostId: true, brandId: true,
      },
      orderBy: { scheduledStart: "desc" },
      take: 200,
    }),
    prisma.brand.findMany({
      where: brandFilter ? { id: brandFilter } : {},
      select: { id: true, name: true },
    }),
    prisma.liveHost.findMany({
      where: hostFilter ? { id: hostFilter } : {},
      select: { id: true, displayName: true },
    }),
  ]);

  const brandMap = new Map(brands.map((b) => [b.id, b.name]));
  const hostMap = new Map(hosts.map((h) => [h.id, h.displayName]));

  // ── Aggregate summary ────────────────────────────────────────────────────────
  let totalGmv = 0, totalHours = 0, totalAdsCost = 0;
  let bauGmv = 0, campaignGmv = 0, bauSessions = 0, campaignSessions = 0;
  const hostStats = new Map<string, { name: string; sessions: number; gmv: number; hours: number; onTime: number; late: number }>();
  const brandStats = new Map<string, { name: string; sessions: number; gmv: number; hours: number }>();

  for (const s of sessions) {
    const gmv = Number(s.gmv ?? 0);
    const hrs = (s.actualDurationMinutes ?? 0) / 60;
    const ads = Number(s.adsCost ?? 0);
    totalGmv += gmv;
    totalHours += hrs;
    totalAdsCost += ads;
    if (s.isCampaignDay) { campaignGmv += gmv; campaignSessions++; }
    else { bauGmv += gmv; bauSessions++; }

    if (s.liveHostId) {
      const h = hostStats.get(s.liveHostId) ?? { name: hostMap.get(s.liveHostId) ?? s.liveHostId, sessions: 0, gmv: 0, hours: 0, onTime: 0, late: 0 };
      h.sessions++; h.gmv += gmv; h.hours += hrs;
      if (s.punctuality === "LATE") h.late++; else h.onTime++;
      hostStats.set(s.liveHostId, h);
    }
    if (s.brandId) {
      const b = brandStats.get(s.brandId) ?? { name: brandMap.get(s.brandId) ?? s.brandId, sessions: 0, gmv: 0, hours: 0 };
      b.sessions++; b.gmv += gmv; b.hours += hrs;
      brandStats.set(s.brandId, b);
    }
  }

  const avgGmvPerHour = totalHours > 0 ? totalGmv / totalHours : 0;
  const avgRoas = totalAdsCost > 0 ? totalGmv / totalAdsCost : null;

  // Top/bottom 5 sessions
  const sorted = [...sessions].sort((a, b) => Number(b.gmv ?? 0) - Number(a.gmv ?? 0));
  const top5 = sorted.slice(0, 5).map(s => {
    const hrs = (s.actualDurationMinutes ?? 0) / 60;
    const gmvPH = hrs > 0 ? Number(s.gmv ?? 0) / hrs : null;
    return `  - ${brandMap.get(s.brandId) ?? "?"} / ${hostMap.get(s.liveHostId ?? "") ?? "?"} · ${s.scheduledStart.toISOString().slice(0, 10)} · GMV ${fmt(Number(s.gmv ?? 0))}${gmvPH ? ` · ${fmt(gmvPH)}/hr` : ""} · ${s.isCampaignDay ? "Campaign" : "BAU"} · ${s.platform}`;
  }).join("\n");

  const bottom5 = sorted.slice(-5).reverse().map(s => {
    const hrs = (s.actualDurationMinutes ?? 0) / 60;
    const gmvPH = hrs > 0 ? Number(s.gmv ?? 0) / hrs : null;
    return `  - ${brandMap.get(s.brandId) ?? "?"} / ${hostMap.get(s.liveHostId ?? "") ?? "?"} · ${s.scheduledStart.toISOString().slice(0, 10)} · GMV ${fmt(Number(s.gmv ?? 0))}${gmvPH ? ` · ${fmt(gmvPH)}/hr` : ""} · ${s.isCampaignDay ? "Campaign" : "BAU"} · ${s.platform}`;
  }).join("\n");

  const hostLeaderboard = [...hostStats.values()]
    .sort((a, b) => (b.hours > 0 ? b.gmv / b.hours : 0) - (a.hours > 0 ? a.gmv / a.hours : 0))
    .slice(0, 10)
    .map(h => {
      const gmvPH = h.hours > 0 ? h.gmv / h.hours : 0;
      const punctualityPct = h.sessions > 0 ? Math.round((h.onTime / h.sessions) * 100) : 0;
      return `  - ${h.name}: ${h.sessions} sessions · ${fmtHr(h.hours)} · GMV ${fmt(h.gmv)} · ${fmt(gmvPH)}/hr · ${punctualityPct}% on-time`;
    }).join("\n");

  const brandBreakdown = [...brandStats.values()]
    .sort((a, b) => b.gmv - a.gmv)
    .map(b => `  - ${b.name}: ${b.sessions} sessions · ${fmtHr(b.hours)} · GMV ${fmt(b.gmv)}`)
    .join("\n");

  const periodLabel = `${fromDate.toISOString().slice(0, 10)} to ${toDate.toISOString().slice(0, 10)}`;

  const contextBlock = `
LIVESTREAM DATA CONTEXT
Period: ${periodLabel}
Brand filter: ${brandId ? (brandMap.get(brandId) ?? brandId) : "All brands"}
Total sessions: ${sessions.length} (${bauSessions} BAU · ${campaignSessions} campaign)
Total live hours: ${fmtHr(totalHours)}
Total GMV: ${fmt(totalGmv)}
BAU GMV: ${fmt(bauGmv)} · Campaign GMV: ${fmt(campaignGmv)}
Avg GMV/hour: ${fmt(avgGmvPerHour)}
Avg ROAS: ${avgRoas != null ? `${avgRoas.toFixed(2)}x` : "N/A (no ad spend recorded)"}
Total ad spend: ${fmt(totalAdsCost)}

TOP 5 SESSIONS BY GMV:
${top5 || "  No sessions"}

BOTTOM 5 SESSIONS BY GMV:
${bottom5 || "  No sessions"}

HOST LEADERBOARD (by GMV/hr):
${hostLeaderboard || "  No host data"}

BRAND BREAKDOWN:
${brandBreakdown || "  No brand data"}
`.trim();

  const stream = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    stream: true,
    system: `You are a livestream performance analyst for 13 Media. You answer questions about LIVE session performance, host effectiveness, GMV trends, and scheduling using the real data and industry knowledge below. Be concise, data-driven, and actionable. Use RM currency. Use bullet points for lists. Do not make up data not in the context. When relevant, use industry benchmarks from the knowledge base to enrich your answers.\n\n${contextBlock}\n\n${LIVESTREAM_KNOWLEDGE}`,
    messages: [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
}
