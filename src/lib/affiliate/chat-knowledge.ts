/**
 * Domain knowledge injected into the affiliate chat assistant's system prompt.
 * Covers TikTok Shop affiliate benchmarks, creator tiers, Spark Code strategy,
 * sample seeding ROI, re-engagement tactics, and new affiliate onboarding.
 */
export const AFFILIATE_KNOWLEDGE = `
== INDUSTRY BENCHMARKS (TikTok Shop, 2026) ==

GMV CONCENTRATION:
- Top 0.5% of creators generate 38% of all affiliate revenue
- Top 20% of creators drive 80% of GMV; bottom 50% drive only 3%
- This is why STAR and A-rank creators deserve disproportionate investment
- If top 3 creators account for >60% of GMV, this is a high dependency risk — flag it

COMMISSION & ROI BENCHMARKS:
- Average TikTok Shop commission rate: ~13% (range: 5% electronics → 30% beauty)
- Brands with dedicated affiliate management achieve 3.8×–5.2× ROI on commission spend
- Brands without dedicated management: only 2.1×–2.9× ROI
- After platform fees, commissions, and returns, brands keep ~67% of reported GMV
- Break-even ROI = 1.0×; strong ROI = 2×+; excellent ROI = 3×+
- True ROI is often understated by ~50% because cross-platform halo effect adds 30–50% more revenue outside TikTok

LIVE COMMERCE:
- Live commerce = 14% of US TikTok Shop GMV (growing from 10% in 2024)
- Optimal cadence: 2–3 LIVE sessions per week around hero products
- Livestream creators tend to generate higher GMV per session than video-only creators

PRODUCT PRICING CONVERSION:
- Products under RM 100 (≈ $30): conversion rate above 5%
- Products over RM 250 (≈ $80): conversion rate drops below 1% without retargeting


== CREATOR LABEL SYSTEM (13 Media internal) ==

This platform uses a 4-tier label system applied to affiliate creators each period:

STAR (⭐) — Top performer:
- Top 10% by GMV among all creators this period
- GMV ≥ RM 1,000
- ROI ≥ 3× (GMV ÷ Est. Commission)
- Consistency ≥ 80% (active in 80%+ of tracked months)
- Ranked top for 3+ consecutive months
→ Strategy: Prioritise Spark Code/boost, give early access to new products, maintain close relationship

A RANK — Strong performer:
- Top 30% by GMV
- ROI ≥ 2×
- Consistency ≥ 60%
→ Strategy: Re-engage immediately if GMV drops >10% MoM; strong candidates for promotion to STAR

B RANK — Active creator:
- GMV > 0, ROI ≥ 1× (earning more than commission paid)
→ Strategy: Large pool — identify the top B-ranks with ROI ≥ 1.5× and 2+ lives or 3+ videos for Spark investment. These are the pipeline to A and STAR.

F RANK (🚫) — Blacklist / Avoid:
- Samples shipped but zero content produced, OR
- GMV = 0 despite receiving samples, OR
- ROI < 1× (commission paid > GMV earned)
→ Strategy: Do not invest further. No new samples. Consider removing from program.


== SPARK CODE / BOOST STRATEGY ==

What is a Spark Code?
A Spark Code is a TikTok authorization code that lets a brand run a creator's organic video as a paid ad (through TikTok Ads Manager or GMV Max), while keeping the post on the creator's own account. Each code is tied to one specific video.

When to use Spark Code:
- Wait for organic signals first: if a video has >10% engagement AND has already generated TikTok Shop sales, it is a strong Spark candidate
- Do NOT boost immediately — let organic performance prove itself first
- Best candidates: B-rank or A-rank creators with ROI ≥ 1.5× and active content (2+ lives or 3+ videos)

Recommended spend: Start RM 120–200/day per strong post, run 3–5 days, scale based on ROAS.

At scale (>40 active creators), manual Spark Code tracking becomes unsustainable. Dedicated tooling is recommended.


== SAMPLE SEEDING ROI ==

Seeding ROI formula:
  (Revenue from seeded content − COGS of gifted units − fulfillment cost) ÷ total seeding cost

Benchmarks:
- Benchmark: 3:1 minimum (for every RM 1 spent on samples, generate RM 3 revenue)
- Typical range for a well-run program: 5×–10× return on samples
- Expect 40–60% of sample recipients to post (not all recipients create content)
- Fewer than 30% post within 30 days in an open seeding campaign

Break-even calculation:
  If product COGS = RM 40 and average order value = RM 110, you need just 1 sale per seeded creator to break even on product cost (before shipping/staff time).

Budget guidance:
- Starting budget: RM 2,000–8,000 for first 20–50 creators
- Creators on F rank who received samples and generated 0 GMV are a direct loss — track sample costs vs GMV rigorously


== RE-ENGAGEMENT TACTICS ==

For A-rank creators with declining GMV (MoM drop >10%):
1. Schedule a priority livestream slot with an exclusive deal or flash sale
2. Send a new product kit tied to a trending category
3. Request a video post within 2 weeks of receiving the kit
4. Offer a short-term commission bump (e.g. +3%) as a re-activation incentive
5. Personal check-in — ask if there are platform/content challenges

For B-rank creators showing potential (ROI ≥ 1.5×, active content):
1. Identify the top 10 B-ranks and give them priority seeding
2. Offer early access to new SKUs before general pool
3. Propose Spark Code collaboration — ask for the code when they post their next strong video

Quarterly cadence:
- Top creators (STAR, A): monthly personal engagement
- Mid-tier (B): quarterly check-in + nudge
- Underperformers (F): remove from active sample list


== NEW AFFILIATES ==

Definition: A creator appearing in the current period's data for the first time — with no record in any prior period.

Evaluation framework for new affiliates:
- First 30 days: assess whether they posted content (>0 videos or lives)
- 60-day check: ROI trajectory — are they trending toward B rank or below break-even?
- 90-day decision: promote to active pipeline (regular seeding) or deprioritise

Expectations for new affiliates:
- Conversion rate for first-time creators is typically 20–40% lower than established creators
- GMV in month 1 is rarely representative — look at content volume and engagement first
- New affiliates with 0 content after receiving samples should be flagged immediately (F-risk)

Red flags (new affiliate):
- Received samples, 0 videos/lives posted
- ROI < 0.5× in first active month
- No follower engagement on posted content


== CHANNEL STRATEGY (LIVE vs VIDEO) ==

When LIVE GMV >> Video GMV (>1.5× ratio):
- Recruit creators with regular LIVE track records (2+ per month)
- Optimise livestream scheduling: peak hours in Malaysia = 8–11pm MYT
- Provide hosts with product talking points and flash sale timing

When Video GMV >> Live GMV (>1.5× ratio):
- Focus on shoppable video content quality and product placement
- Seed creators with clear product USPs and filming briefs
- Video content has longer shelf-life — one great video can drive GMV for weeks

When both channels are balanced:
- Run a mixed recruitment strategy
- Identify which creators excel at lives vs videos and assign accordingly
`.trim();
