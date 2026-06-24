/**
 * Domain knowledge injected into the livestream AI chat assistant's system prompt.
 * Sources: TikTok LIVE 2026 benchmarks, Malaysia market data, host performance research.
 */
export const LIVESTREAM_KNOWLEDGE = `
== LIVESTREAM PERFORMANCE BENCHMARKS (TikTok Shop / Shopee, 2026) ==

SESSION KPIs:
- GPM (GMV per Mille / Watch GPM): GMV generated per 1,000 views — primary traffic efficiency metric
  - Good GPM: RM 30–80 per 1,000 views
  - Excellent GPM: RM 80–150+
  - Low GPM (<RM 20): audience not converting — review product-host fit or pricing
- GMV per hour: Total GMV ÷ session hours
  - Entry level: RM 500–1,500/hr
  - Good: RM 2,000–5,000/hr
  - Excellent: RM 5,000–15,000/hr (campaign day)
- CTR (Click-Through Rate): Product clicks ÷ impressions. Target: ≥10%
- CTOR (Click-to-Order Rate): Orders ÷ product clicks. Target: ≥3%
- Conversion rate: Average e-commerce conversion 2–3%; LIVE typically 1.5–4%
- Peak concurrent viewers: Highest simultaneous viewers — indicates content quality peaks
- Average watch duration: Longer = higher platform distribution. Target: >2 minutes

SESSION DURATION:
- Minimum effective session: 2 hours (algorithm needs time to find the right audience)
- Optimal: 3+ hours — GMV accelerates in the second and third hour
- Brands running 8+ hours daily see the most single-session GMV growth
- Consistency of timing matters as much as duration — regular schedules build returning audiences

BAU vs CAMPAIGN SESSIONS:
- BAU (Business as Usual): Regular sessions, no promotional event. Baseline GMV.
- Campaign days: Typically 3–5× BAU GMV due to platform vouchers, boosted traffic, and viewer intent
- A healthy program has BAU GMV at least 30–40% of total GMV (not 100% campaign-dependent)


== HOST PERFORMANCE FRAMEWORK ==

Five critical dimensions for a successful LIVE session:
1. DILIGENCE — Frequency and consistency of sessions (on-time, regular schedule)
2. TRAFFIC — Audience attraction (GPM, viewer count, new follower acquisition)
3. PRODUCT — Selection, pricing, stock availability, and demo quality
4. CONTENT — Engaging delivery, storytelling, product demonstrations, viewer interaction
5. PROMOTION — Flash sales, countdown urgency, voucher announcements

Host KPIs to track:
- Punctuality: ON_TIME = within 5 min of scheduled start; EARLY = >5 min early; LATE = >5 min late
  - Consistent late starts signal professionalism risk; platform penalises late starts with lower traffic
  - EARLY starts are ideal — platform rewards early starters with pre-session audience build
- Hours live: Total hours streamed per period. More hours = more GMV opportunity
- GMV per hour: Best efficiency metric for comparing hosts of different session lengths
- Sessions count: Frequency consistency — gaps > 7 days hurt algorithmic reach
- ROAS (Return on Ad Spend): GMV ÷ ads cost. Healthy ROAS: 3×+; excellent: 5×+


== MALAYSIA LIVESTREAM SCHEDULING ==

Peak hours (MYT = UTC+8):
- Primary peak: 8:00pm – 11:00pm (highest concurrent viewers, best conversion)
- Secondary peak: 12:00pm – 2:00pm (lunch break shopping)
- Avoid: 6:00am – 9:00am (lowest engagement)

Platform differences:
- TikTok LIVE: Algorithm-driven discovery; consistency and GPM drive organic reach
- Shopee LIVE: Integrated flash sale function creates urgency; scheduled streaming + pre-broadcast promotion tools
- Dual-platform strategy: Run TikTok LIVE for discovery, Shopee LIVE for high-intent buyers

Session scheduling best practices:
- Schedule sessions at same time daily/weekly — returning viewers are the highest converters
- Plan key sessions around payday windows (25th–end of month) — highest buyer intent
- Increase session frequency 1 week before major sales events (9.9, 11.11, Ramadan)
- TikTok Shop Malaysia: 1,000+ All-Star LIVE sessions planned for 2026; brands in these see 160%+ sales uplift


== SEASONAL LIVESTREAM STRATEGY (Malaysia) ==

Ramadan/Raya (Mar–Apr):
- Ramadan LIVE strategy: Evening sessions after Iftar (8:30–11pm MYT); family-oriented products
- Raya run-up (last 2 weeks of Ramadan): Peak buying intent; fashion, home décor, food
- Target: 130%+ GMV uplift vs normal month for well-prepared brands
- Preparation: Book hosts 6 weeks out, brief on Ramadan-appropriate content

11.11 Mega Sale (November 11):
- Largest ecommerce event of the year — all-category boom
- Session planning: Run your longest sessions (6–8h) on 11.11 itself
- Hosts need product talking points and flash sale timing scripts 2 weeks before
- Start warming up audience with teaser sessions 1 week before

12.12 Year-End Sale (December 12): Gift products and premium items perform strongly
9.9 / 10.10: Mid-year spikes; ideal for clearing slow-moving inventory with aggressive pricing
Chinese New Year (Jan/Feb): Health, premium beauty, and gift sets; red packet voucher mechanics work well
Payday (25th–end of month): Consistent monthly spike — always schedule a LIVE session here


== HOST COACHING & CONTENT STRATEGY ==

Pre-session checklist:
- Products staged and tested 30 min before go-live
- Key selling points memorised (3 per product max — keep it simple)
- Flash sale timing agreed with brand team (e.g. flash price drop at 30 and 60 min marks)
- Internet connection tested (minimum 10Mbps upload for stable stream)
- Lighting and camera angle set

Live selling script structure:
1. Hook (0–5 min): Strong opening, introduce the deal of the day, create excitement
2. Warmup (5–15 min): Build viewer count before featuring hero product
3. Hero product demo (15–30 min): Show product in use, address common objections, highlight USPs
4. Urgency trigger (every 10–15 min): Flash sale, countdown timer, limited stock announcement
5. Viewer interaction (ongoing): Read comments, answer questions live — boosts watch time and platform score
6. Closing call-to-action: Pin top product in cart, remind about vouchers, set time for next session

Flash sale best practices:
- Announce flash price AFTER viewer count peaks (usually 30–45 min into session)
- Use countdown phrasing: "Next 10 minutes only", "Only 20 units left at this price"
- Platform rewards flash sale conversions with additional algorithm traffic burst
- Minimum 15% discount from normal price to trigger meaningful buyer urgency


== PERFORMANCE TIERS (Session Quality) ==

Sessions are typically scored into tiers based on GMV, viewer metrics, and efficiency:

ELITE / TOP TIER: GMV in top 10% of all sessions; strong GPM, high CTOR
→ Analyse: What went right? Replicate the product, timing, and host combination

STRONG: Above median GMV; consistent viewers and CTR
→ Action: Maintain cadence; consider boosting with GMV Max ads

AVERAGE: Median performance; no major issues
→ Action: Test one variable change (different product order, earlier flash sale timing)

WEAK / BOTTOM TIER: Below median GMV; low viewers or poor conversion
→ Diagnose using funnel stage: Is the problem traffic (viewers), engagement (CTR), or conversion (CTOR)?

FUNNEL DIAGNOSIS:
- Low viewers → Traffic problem: session timing, platform distribution, no pre-promotion
- Good viewers, low CTR → Engagement problem: product presentation, pricing, or host delivery
- Good CTR, low CTOR → Conversion problem: price too high, product trust, checkout friction
- Good everything, low GMV → Volume problem: session too short, not enough products featured


== BAU vs CAMPAIGN ANALYSIS ==

Healthy program benchmarks:
- Campaign GMV lift: 3–5× BAU for well-executed campaign sessions
- If campaign lift is <2×: campaign execution needs work (promotion too weak, host not briefed)
- If BAU GMV is 0 or near-zero: brand is 100% dependent on campaigns — high risk
- Target: BAU sessions contribute at least 30% of total period GMV

Diagnosing a weak BAU:
- Hosts not maintaining consistent schedule between campaigns
- No product pinning or active selling during BAU (treating it as "filler" content)
- Wrong session timing (BAU scheduled at off-peak hours)


== ROAS & AD SPEND STRATEGY ==

ROAS benchmarks:
- Good: 3×+ (every RM 1 of ad spend generates RM 3 GMV)
- Excellent: 5×+ (well-optimised GMV Max or Spark Ads)
- Poor: <2× (review targeting, creative, or product pricing)

GMV Max (TikTok's automated ad system):
- Replaces manual bidding; optimised purely for total GMV from TikTok Shop
- Works best when LIVE session has strong organic GPM first — ad spend amplifies what's already working
- Run GMV Max during your peak session hours (8–11pm) for highest ROAS

Spark Ads for LIVE:
- Can amplify a live session in real-time while it's running
- Best used when concurrent viewers are already climbing (>50 viewers) — feeds the algorithm
- Budget: Start RM 150–300/session; scale based on live GMV trajectory

Ad spend allocation guide:
- 70% on best-performing LIVE sessions (proven GMV per hour)
- 20% on testing new products or host combinations
- 10% on retargeting previous viewers/buyers


== HOST LEADERBOARD ANALYSIS ==

When comparing hosts:
- Use GMV per hour (not total GMV) to normalise for session length differences
- A host with 50 hours and RM 100K GMV (RM 2,000/hr) outperforms one with 100 hours and RM 150K (RM 1,500/hr)
- Punctuality is a leading indicator: consistently late hosts tend to have declining GMV trends
- Track sessions count alongside GMV — a host with very few sessions but high GMV may not be sustainable

Signs of a standout host:
- GMV/hr consistently above RM 3,000 across multiple sessions
- CTOR above 5% (strong closer, handles objections well)
- Audience retention: average watch duration above 3 minutes
- On-time or early to >80% of scheduled sessions
`.trim();
