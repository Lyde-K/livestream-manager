/**
 * Domain knowledge injected into the affiliate chat assistant's system prompt.
 * Sources: TikTok Shop 2026 benchmarks, creator lifecycle research, Malaysia market data.
 */
export const AFFILIATE_KNOWLEDGE = `
== INDUSTRY BENCHMARKS (TikTok Shop, 2026) ==

GMV CONCENTRATION:
- Top 0.5% of creators generate 38% of all affiliate revenue
- Top 20% of creators drive 80% of GMV; bottom 50% drive only 3%
- This is why STAR and A-rank creators deserve disproportionate investment
- If top 3 creators account for >60% of GMV, flag as high dependency risk

COMMISSION & ROI BENCHMARKS:
- Average TikTok Shop commission rate: ~13% (range: 5% electronics → 30% beauty)
- Brands with dedicated affiliate management achieve 3.8×–5.2× ROI on commission spend
- Brands without dedicated management: only 2.1×–2.9× ROI
- After platform fees, commissions, and returns, brands keep ~67% of reported GMV
- Break-even ROI = 1.0×; strong ROI = 2×+; excellent ROI = 3×+
- True ROI is often understated by ~50% because cross-platform halo effect adds 30–50% more revenue

LIVE COMMERCE:
- Live commerce = 14% of US TikTok Shop GMV (growing from 10% in 2024)
- Optimal cadence: 2–3 LIVE sessions per week around hero products
- Livestream creators tend to generate higher GMV per session than video-only creators

PRODUCT PRICING CONVERSION:
- Products under RM 100 (≈ $30): conversion rate above 5%
- Products over RM 250 (≈ $80): conversion rate drops below 1% without retargeting
- Sweet spot for AOV: RM 120–200 (≈ $35–$59) — best balance of conversion and margin


== CREATOR LABEL SYSTEM (13 Media internal) ==

STAR (⭐) — Top performer:
- Top 10% by GMV, GMV ≥ RM 1,000, ROI ≥ 3×, consistency ≥ 80%, top-ranked 3+ consecutive months
→ Strategy: Prioritise Spark Code/boost, early product access, premium commission tier, monthly personal engagement

A RANK — Strong performer:
- Top 30% by GMV, ROI ≥ 2×, consistency ≥ 60%
→ Strategy: Re-engage immediately if GMV drops >10% MoM; candidates for STAR promotion

B RANK — Active creator:
- GMV > 0, ROI ≥ 1×
→ Strategy: Top B-ranks with ROI ≥ 1.5× and 2+ lives or 3+ videos = Spark candidates; pipeline to A/STAR

F RANK (🚫) — Blacklist / Avoid:
- Samples shipped but zero content, GMV = 0, or ROI < 1×
→ Strategy: No new samples. Remove from active seeding pool. Consider offboarding.


== CREATOR LIFECYCLE STAGES ==

Every creator passes through 6 stages. Diagnosing the stage tells you the right action:

1. RECRUIT — Identified but not yet onboarded
   → Action: Outreach with product samples and commission offer
   → Success signal: Accepts collaboration within 14 days

2. ACTIVATE — Samples received, waiting for first content
   → Action: Follow up within 7 days of delivery; offer content brief
   → Red flag: No post within 30 days of receiving samples → F-risk, escalate
   → Benchmark: 40–60% of seeded creators post within 30 days

3. GROW — Has posted content, building GMV track record
   → Action: Provide more product variety, engage with content (comments/shares)
   → Target: Hit B-rank (ROI ≥ 1×) within 60 days

4. RETAIN — Consistently performing (A or STAR rank)
   → Action: Monthly check-ins, priority seeding, commission tier rewards
   → Risk: MoM GMV drop >10% = re-engagement trigger

5. REACTIVATE — Previously active but went quiet (no content in 45+ days)
   → Action: Send new product kit, offer exclusive deal or commission bump (+3%)
   → If no response in 30 days after reactivation attempt → consider offboarding

6. OFFBOARD — F-rank confirmed, no recovery after 90 days
   → Action: Remove from sample list, update blacklist, document reason


== TIERED COMMISSION STRATEGY ==

Base tier (Open Collaboration): 10–15%
- For all active creators; threshold to enter program

Mid tier (Targeted Collaboration): 16–20%
- For A-rank creators consistently delivering 2×+ ROI
- Tier jump should feel substantial: minimum +4–5 percentage points

Top tier (Key Opinion Leader / Premium): 20–30%
- For STAR-rank creators or influencers with >100K engaged followers
- Beauty brands typically pay higher than electronics or food

Incentive escalation tactics:
- Cash bonus for activation (first content posted within 14 days of seeding)
- Commission bump for retention (loyalty through earned status — creators at 20% resist churning because they'd restart at 12% elsewhere)
- GMV milestone bonuses: e.g. RM 5,000 GMV in a month → bonus RM 200 cash
- Early product access as a non-cash incentive for consistent performers

Note: A creator consistently delivering RM 50K/month doesn't care about 12% vs 13%, but cares deeply about moving to 18%.


== SPARK CODE / BOOST STRATEGY ==

What is a Spark Code? A TikTok authorization code allowing a brand to run a creator's organic video as a paid ad while keeping it on the creator's account. Tied to one specific video.

When to Spark:
- Wait for organic signals first: >10% engagement AND proven TikTok Shop sales
- Do NOT boost immediately — organic performance is the filter
- Best candidates: B/A-rank creators with ROI ≥ 1.5×, 2+ lives or 3+ videos

Spend guidance: Start RM 120–200/day per post, run 3–5 days, scale based on ROAS.
At scale (>40 active creators): manual code tracking becomes unsustainable — use tooling.


== SAMPLE SEEDING ROI ==

Formula: (Revenue from seeded content − COGS − fulfillment) ÷ total seeding cost
Benchmark: 3:1 minimum; well-run programs achieve 5×–10×
Expect: 40–60% of recipients post; fewer than 30% post within 30 days

Break-even: If COGS = RM 40 and AOV = RM 110 → 1 sale per creator = break even on product cost.
Budget: RM 2,000–8,000 for first 20–50 creators.
F-rank with samples = confirmed loss — track sample cost vs GMV meticulously.


== RE-ENGAGEMENT PLAYBOOK ==

For A-rank with MoM GMV drop >10%:
1. Schedule a priority LIVE slot with an exclusive flash sale deal
2. Send a new product kit (trending category preferred)
3. Request a video post within 2 weeks of delivery
4. Offer short-term commission bump (+3%) as re-activation incentive
5. Personal check-in — ask about platform or content challenges

For B-rank rising candidates (ROI ≥ 1.5×, active content):
1. Identify top 10 B-ranks for priority seeding
2. Offer early access to new SKUs before general pool
3. Propose Spark Code collaboration — ask for code when next strong video posts

Cadence: STAR/A = monthly personal engagement; B = quarterly nudge; F = remove from active list


== NEW AFFILIATE EVALUATION (30/60/90-day framework) ==

Definition: Creator appearing in current period with NO record in any prior period.

30 days: Did they post content? (>0 videos or lives = on track)
60 days: ROI trajectory — trending toward B rank or below break-even?
90 days: Decision point — promote to active pipeline or deprioritise

Expectations for new affiliates:
- Conversion rate 20–40% lower than established creators in month 1
- GMV in month 1 rarely representative — assess content volume first
- New affiliate with 0 content after samples = F-risk, escalate immediately

Red flags: 0 videos/lives after samples; ROI < 0.5× in first active month; low engagement on posted content


== PRODUCT CATEGORY BENCHMARKS ==

Beauty & Personal Care: 22.5% of TikTok Shop GMV, conversion rate 6–9% (highest on platform — products demo in 10 seconds)
Fashion: 12.5% of GMV, moderate conversion, high volume, lower unit margins
Electronics: 7.2% of GMV, lower volume, higher unit price, longer purchase decision cycle
Food & FMCG: Strong in Malaysia market; Ramadan/Raya drives outsized seasonal spikes
Home & Living: Growing 85%+ YoY as platform matures beyond beauty/fashion

Use these to benchmark your product performance. If a Beauty product has <4% conversion, it is underperforming its category average.


== FRAUD & QUALITY SIGNALS ==

Warning signs of low-quality creator traffic:
- High video views but very low likes/comment ratio (engagement rate <3% is suspect)
- GMV spikes with no corresponding content change or LIVE session
- Sudden follower jump (>20% in 1 week) before a campaign
- Estimated 10–15% of TikTok influencer accounts have significant fake/inactive followers; emerging markets up to 25%

Red flags in data:
- Creator shows high LIVES count but near-zero GMV → possible low-quality audience
- Samples shipped multiple times, GMV always zero → not genuine audience fit, likely F
- ROI consistently <0.3× despite high content volume → fake traffic or wrong niche


== SEASONAL CAMPAIGN CALENDAR (Malaysia) ==

Key dates to plan affiliate campaigns around:

Ramadan/Raya (Mar–Apr): Biggest seasonal spike in Malaysia. GMV uplifts of 130%+ for participating brands. Focus: family products, home goods, food, personal care. Contact creators 4 weeks before Ramadan starts.

9.9 (Sep 9): First major double-date sale of second half. Strong for electronics, fashion.
10.10 (Oct 10): Mid-quarter spike. Beauty and food perform well.
11.11 (Nov 11): Largest shopping event of the year. All-category boom. Start creator briefing 6 weeks out, seed products 4 weeks out, content goes live 1 week before.
12.12 (Dec 12): Year-end push. Gift products and premium items perform strongly.

Payday sales (25th–end of month): Consistent monthly spike — schedule LIVE sessions around these dates.
Chinese New Year (Jan/Feb): Strong for premium products, health supplements, beauty.

Creator briefing timeline for any major sale:
- T-6 weeks: Identify which creators to activate, confirm availability
- T-4 weeks: Send samples/products
- T-2 weeks: Content brief + talking points + flash sale details
- T-1 week: Content goes live (pre-event hype)
- Sale day: LIVE sessions scheduled for peak hours (8–11pm MYT)


== GMV FORECASTING ==

Simple next-period projection model:
- Baseline: Average GMV of last 3 periods for active creators
- Growth factor: TikTok Shop is growing ~70% YoY globally; Malaysia market growing fast
- New creator uplift: Each new B-rank creator typically adds RM 500–2,000 GMV/month once activated
- Campaign multiplier: Major sale events (11.11, Ramadan) typically 3–5× normal GMV

To hit a GMV target:
  Creators needed = (Target GMV − current run rate) ÷ avg new creator GMV/month
  Example: Need RM 50K uplift, new creators avg RM 1,500/month → need ~33 new active creators

Concentration risk: If removing your top 3 creators would drop GMV by >50%, the program is fragile — prioritise diversification.
`.trim();
