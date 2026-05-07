import type { FunnelStage, Platform } from "./types";

export interface DiagnosisLibraryEntry {
  stage: FunnelStage;
  headline: string;
  causes: string[];
  actionTemplates: string[];
}

const SHARED: Record<FunnelStage, DiagnosisLibraryEntry> = {
  TRAFFIC: {
    stage: "TRAFFIC",
    headline: "Acquisition is the bottleneck — too few people watched.",
    causes: [
      "Slot timing missed peak audience hours",
      "No paid traffic boost during the session",
      "Title or thumbnail didn't pull viewers in",
      "Brand visibility low for this category at this hour",
    ],
    actionTemplates: [
      "Reschedule this brand into a higher-traffic slot (8-11pm).",
      "Add a small ad spend to seed the first 30 minutes of the next stream.",
      "Refresh stream title/cover to lead with the strongest offer.",
      "Pre-promote on the brand's social channels 2 hours before going live.",
    ],
  },
  ENGAGEMENT: {
    stage: "ENGAGEMENT",
    headline: "Viewers came in but didn't stay — host retention issue.",
    causes: [
      "Slow opening, host took too long to introduce the offer",
      "Energy drop in the middle of the stream",
      "Talking points repetitive — no new hook every 5 minutes",
      "Lighting or audio quality below brand standard",
    ],
    actionTemplates: [
      "Open the next stream with a 60-second hook that names the deal.",
      "Insert a flash giveaway or product reveal every 10 minutes.",
      "Coach the host on energy pacing — review session recording with them.",
      "Audit the stream setup for lighting/audio before the next session.",
    ],
  },
  PRODUCT: {
    stage: "PRODUCT",
    headline: "Engaged audience but products aren't pulling clicks.",
    causes: [
      "Product showcase not sequenced for highest-margin items first",
      "Featured SKUs don't match audience segment for this slot",
      "Pricing not framed clearly against alternatives",
      "Product cards not pinned at the right moments",
    ],
    actionTemplates: [
      "Restructure the stream rundown to lead with the hero SKU.",
      "Pin the top product card during the 3 highest-engagement windows.",
      "Brief the host on key value props per SKU before going live.",
      "A/B the SKU lineup for the next 2 sessions and compare CTR.",
    ],
  },
  CONVERSION: {
    stage: "CONVERSION",
    headline: "Clicks are landing but checkout isn't closing.",
    causes: [
      "Offer not compelling enough vs perceived alternatives",
      "Voucher / discount stacking unclear in checkout",
      "Out-of-stock on the featured SKU",
      "Shipping fee or wait time killed momentum at checkout",
    ],
    actionTemplates: [
      "Add a stream-only voucher visible in the product card.",
      "Verify stock levels for hero SKUs 1 hour before the next live.",
      "Test free-shipping threshold during a 30-minute window.",
      "Re-open the checkout funnel report — find where drop-off spikes.",
    ],
  },
  AOV: {
    stage: "AOV",
    headline: "Orders are coming in but baskets are too small.",
    causes: [
      "No bundle offers presented during the stream",
      "Cross-sell upsells not scripted into the host's flow",
      "Hero SKU is the cheapest item and dominates the basket",
      "Free-shipping threshold not actively pushed by the host",
    ],
    actionTemplates: [
      "Build a 'buy 2 save more' bundle for the next stream and feature it visually.",
      "Coach the host to call out the free-shipping threshold every 10 minutes.",
      "Reorder the SKU lineup to feature mid-tier-priced bundles, not the cheapest item.",
      "Add a 'spend RM X get free gift' tier to lift basket value.",
    ],
  },
  PROFIT: {
    stage: "PROFIT",
    headline: "GMV looks healthy but ad cost ate the margin.",
    causes: [
      "Ad spend was too aggressive for the conversion rate achieved",
      "ROAS-targeting bid strategy wasn't applied",
      "Audience targeting too broad — paid for low-intent traffic",
      "Cost-per-result trended up across the session",
    ],
    actionTemplates: [
      "Cap ad spend at a level where projected ROAS stays above 2.0.",
      "Switch the next session to a ROAS-optimised bid strategy.",
      "Tighten the targeting cohort to interest segments with prior conversions.",
      "Pause ads in the final 30 minutes if cost-per-result keeps climbing.",
    ],
  },
  NONE: {
    stage: "NONE",
    headline: "No clear single bottleneck — performance is balanced.",
    causes: [
      "Metrics are within typical ranges across the funnel",
      "No standout weakness; consider lifting the cohort baseline overall",
    ],
    actionTemplates: [
      "Maintain the current playbook and benchmark against the brand's top historical session.",
    ],
  },
};

export function getDiagnosisLibrary(
  stage: FunnelStage,
  _platform: Platform,
): DiagnosisLibraryEntry {
  return SHARED[stage];
}
