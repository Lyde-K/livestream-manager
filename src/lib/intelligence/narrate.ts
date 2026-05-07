import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import type { AnalysisResult } from "./analyze";
import { getDiagnosisLibrary } from "./library";
import type { BenchmarkSet, Flag, Platform } from "./types";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are an experienced live producer briefing a brand-new livestream host at a Malaysian livestream commerce agency (TikTok and Shopee). The host has never seen this dashboard before — write so they can act on it tomorrow.

How to talk:
- Plain English. Short sentences. No jargon.
- Never use words like "cohort", "funnel stage", "p15", "p85", "percentile", "benchmark deviation", "ATC rate".
- If you must reference a metric, translate it: not "CTOR was low" but "people clicked the product but didn't tap to order".
- Currency is RM. Always write it like "RM 1,234" — with a space and comma, no decimals.
- Lead with what happened in the livestream, then why, then what to try next stream.

Tier framing — GMV is the headline:
- The tier (EXCEPTIONAL / AVERAGE / UNDERPERFORMING) is decided by GMV, not by the other metrics.
- Other metrics (viewers, CTR, CTOR, conversion, ROAS, AOV) are the WHY — use them to explain the GMV result.
- Example: "GMV came in low. Lots of people watched, but few tapped the product card — the price callouts came too late in the stream."

TikTok-specific rule (important):
- On TikTok, "gmv" is what was bought DURING the live, while "grossRevenue" is total attributed sales (including buys that happened after the host pinned the product but the viewer left and bought later).
- If grossRevenue is much higher than gmv, the host attracted buyers but couldn't close them inside the live. In the action plan, mention concrete in-stream conversion levers: pin the product within the first 90 seconds, repeat the price aloud every 5 minutes, run a flash discount in-stream, give a clear call-to-tap right after each demo.

Output JSON shape (strict):
{
  "reasoning": "2-3 sentences. Lead with GMV outcome and one number. Then one sentence on the cause from the data.",
  "causes": ["3-4 short reasons in everyday language. No metric names."],
  "actionPlan": ["3-5 concrete things a host can do during the next stream. Each one specific enough to picture."]
}`;

interface NarratePayload {
  platform: Platform;
  tier: string;
  funnelStage: string;
  metrics: Record<string, number | null>;
  benchmarks: Record<string, { median: number; p15: number; p85: number }>;
  flagsHigh: { metric: string; value: number; threshold: number }[];
  flagsLow: { metric: string; value: number; threshold: number }[];
  causesLibrary: string[];
  actionsLibrary: string[];
  grossRevenue?: number | null;
  inStreamGmv?: number | null;
}

function flagSummary(flags: Flag[]) {
  return flags.map((f) => ({
    metric: f.metric,
    value: Math.round(f.value * 1000) / 1000,
    threshold: Math.round(f.threshold * 1000) / 1000,
  }));
}

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey: key });
}

interface NarrationOutput {
  reasoning: string;
  causes: string[];
  actionPlan: string[];
}

export async function narrateSession(
  result: AnalysisResult,
  benchmarks: BenchmarkSet,
  options?: { grossRevenue?: number | null; inStreamGmv?: number | null },
): Promise<NarrationOutput> {
  const lib = getDiagnosisLibrary(result.funnelStage, result.platform);

  const benchmarkSubset: Record<string, { median: number; p15: number; p85: number }> = {};
  for (const flag of [...result.exceptionalFlags, ...result.underperformingFlags]) {
    const b = benchmarks.metrics[flag.metric];
    if (b) {
      benchmarkSubset[flag.metric] = {
        median: Math.round(b.median * 1000) / 1000,
        p15: Math.round(b.p15 * 1000) / 1000,
        p85: Math.round(b.p85 * 1000) / 1000,
      };
    }
  }

  const payload: NarratePayload = {
    platform: result.platform,
    tier: result.tier,
    funnelStage: result.funnelStage,
    metrics: result.metrics as unknown as Record<string, number | null>,
    benchmarks: benchmarkSubset,
    flagsHigh: flagSummary(result.exceptionalFlags),
    flagsLow: flagSummary(result.underperformingFlags),
    causesLibrary: lib.causes,
    actionsLibrary: lib.actionTemplates,
    grossRevenue: options?.grossRevenue ?? null,
    inStreamGmv: options?.inStreamGmv ?? null,
  };

  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Diagnose this session. Output JSON only.\n\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
  });

  const block = response.content.find((c) => c.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Empty response from Claude");
  }

  const text = block.text.trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("No JSON in narration response");
  }
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as NarrationOutput;

  await prisma.narrationLog.create({
    data: {
      sessionId: result.sessionId,
      model: MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      cost: estimateCostUSD({
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
        cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
      }),
    },
  });

  return {
    reasoning: parsed.reasoning ?? "",
    causes: Array.isArray(parsed.causes) ? parsed.causes : [],
    actionPlan: Array.isArray(parsed.actionPlan) ? parsed.actionPlan : [],
  };
}

function estimateCostUSD(t: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}): number {
  // Haiku 4.5 pricing (USD / MTok): input $1, output $5, cache write $1.25, cache read $0.10
  const cents =
    (t.input / 1_000_000) * 100 +
    (t.output / 1_000_000) * 500 +
    (t.cacheWrite / 1_000_000) * 125 +
    (t.cacheRead / 1_000_000) * 10;
  return Math.round(cents * 1000) / 1000;
}
