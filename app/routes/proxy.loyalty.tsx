/**
 * App Proxy — /apps/loyalty
 * Customer-facing loyalty page served through the Shopify storefront.
 * Shopify forwards requests from doomlings.com/apps/loyalty to this route.
 */

import { randomBytes } from "crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getCustomerLoyalty,
  getRewards,
  getShopConfig,
  reserveRedemption,
  finalizeRedemption,
  cancelRedemption,
  ensureCustomerAndGrantSignup,
  type ShopConfigData,
  type CustomerLoyaltyState,
} from "../loyalty.server";
import prisma from "../db.server";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Reward {
  id: string;
  name: string;
  description: string | null;
  type: string;
  value: string;
  pointsCost: number;
  isActive: boolean;
}

interface PageData {
  loggedIn: boolean;
  firstName: string | null;
  loyalty: CustomerLoyaltyState | null;
  config: ShopConfigData;
  rewards: Reward[];
  shop: string;
  redeemedCode?: string;
  redeemError?: string;
  redeemRewardName?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rewardLabel(reward: Reward): string {
  if (reward.type === "discount_fixed") return `$${reward.value} OFF`;
  if (reward.type === "discount_pct") return `${reward.value}% OFF`;
  return reward.name;
}

function rewardDescription(reward: Reward): string {
  if (reward.type === "discount_fixed") return `$${reward.value} discount applied at checkout`;
  if (reward.type === "discount_pct") return `${reward.value}% off your entire order`;
  return reward.description ?? "";
}

async function createShopifyDiscountCode(
  shop: string,
  accessToken: string,
  reward: { name: string; type: string; value: string },
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  let customerGetsValue: Record<string, unknown>;
  if (reward.type === "discount_pct") {
    const pct = parseFloat(reward.value);
    if (isNaN(pct) || pct <= 0) return { ok: false, error: "Invalid %" };
    customerGetsValue = { percentage: pct / 100 };
  } else if (reward.type === "discount_fixed") {
    const amt = parseFloat(reward.value);
    if (isNaN(amt) || amt <= 0) return { ok: false, error: "Invalid amount" };
    customerGetsValue = { discountAmount: { amount: amt.toFixed(2), appliesOnEachItem: false } };
  } else {
    return { ok: false, error: "Unsupported reward type" };
  }

  const mutation = `mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }`;

  const resp = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({
      query: mutation,
      variables: {
        basicCodeDiscount: {
          title: `DOOM Points Reward: ${reward.name}`,
          code,
          startsAt: new Date().toISOString(),
          usageLimit: 1,
          appliesOncePerCustomer: true,
          customerGets: { value: customerGetsValue, items: { allItems: true } },
          customerSelection: { all: true },
        },
      },
    }),
  });

  if (!resp.ok) return { ok: false, error: `Shopify ${resp.status}` };
  const json = (await resp.json()) as {
    data?: { discountCodeBasicCreate?: { userErrors?: { message: string }[] } };
  };
  const errs = json.data?.discountCodeBasicCreate?.userErrors ?? [];
  if (errs.length) return { ok: false, error: errs.map((e) => e.message).join("; ") };
  return { ok: true };
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  const customerId = url.searchParams.get("logged_in_customer_id") ?? "";

  const [config, rewards] = await Promise.all([getShopConfig(shop), getRewards(shop)]);
  const activeRewards = rewards.filter((r) => r.isActive);

  let firstName: string | null = null;
  let loyalty: CustomerLoyaltyState | null = null;

  if (customerId) {
    // On first visit, create the customer record + award the signup bonus.
    // Idempotent — subsequent visits are a no-op. Works without read_customers
    // scope, so we don't need protected customer data approval.
    await ensureCustomerAndGrantSignup(shop, customerId);

    const [cust, loy] = await Promise.all([
      prisma.customer.findFirst({
        where: { shopifyCustomerId: customerId, shop },
        select: { firstName: true },
      }),
      getCustomerLoyalty(customerId),
    ]);
    firstName = cust?.firstName ?? null;
    loyalty = loy;
  }

  return new Response(
    buildPage({ loggedIn: !!customerId, firstName, loyalty, config, rewards: activeRewards, shop }),
    { headers: { "Content-Type": "application/liquid" } },
  );
};

// ─── Action (redemption) ──────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  const customerId = url.searchParams.get("logged_in_customer_id") ?? "";

  if (!customerId) {
    return new Response(buildPage({
      loggedIn: false, firstName: null, loyalty: null,
      config: await getShopConfig(shop), rewards: [], shop,
      redeemError: "You must be logged in to redeem points.",
    }), { headers: { "Content-Type": "application/liquid" } });
  }

  const form = await request.formData();
  const rewardId = form.get("rewardId") as string | null;

  const [config, rewards, cust, loyalty] = await Promise.all([
    getShopConfig(shop),
    getRewards(shop),
    prisma.customer.findFirst({ where: { shopifyCustomerId: customerId, shop }, select: { firstName: true } }),
    getCustomerLoyalty(customerId),
  ]);

  const activeRewards = rewards.filter((r) => r.isActive);
  const reward = activeRewards.find((r) => r.id === rewardId);

  let redeemedCode: string | undefined;
  let redeemError: string | undefined;
  let redeemRewardName: string | undefined;
  let updatedLoyalty = loyalty;

  if (!reward) {
    redeemError = "Reward not found.";
  } else {
    const session = await prisma.session.findFirst({
      where: { shop, isOnline: false },
      orderBy: { expires: "desc" },
      select: { accessToken: true },
    });

    if (!session?.accessToken) {
      redeemError = "Store not connected — please try again later.";
    } else {
      // Phase 1: atomic point reservation.
      const reserved = await reserveRedemption(shop, customerId, reward.id);
      if (!reserved.success) {
        redeemError = reserved.error;
      } else {
        const { redemptionId, reward: reservedReward } = reserved.reservation;

        // Phase 2: create Shopify discount code.
        const code = "DOOM-" + randomBytes(4).toString("hex").toUpperCase();
        const shopifyResult = await createShopifyDiscountCode(shop, session.accessToken, reservedReward, code);

        if (!shopifyResult.ok) {
          // Refund the reserved points — the discount code never got issued.
          await cancelRedemption(redemptionId);
          redeemError = shopifyResult.error ?? "Could not generate discount code. Please try again.";
        } else {
          // Phase 3: mark fulfilled + attach code.
          await finalizeRedemption(redemptionId, code);
          redeemedCode = code;
          redeemRewardName = reward.name;
          updatedLoyalty = await getCustomerLoyalty(customerId);
        }
      }
    }
  }

  return new Response(
    buildPage({
      loggedIn: true,
      firstName: cust?.firstName ?? null,
      loyalty: updatedLoyalty,
      config,
      rewards: activeRewards,
      shop,
      redeemedCode,
      redeemError,
      redeemRewardName,
    }),
    { headers: { "Content-Type": "application/liquid" } },
  );
};

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildPage(d: PageData): string {
  const e = d.config.earningRules;
  const pts = d.loyalty?.pointsBalance ?? 0;
  const tierDisplay = d.loyalty?.tierDisplayName ?? "Prepper";
  const tierMin = d.loyalty?.tierMinPoints ?? 0;
  const nextMin = d.loyalty?.nextTierMinPoints ?? null;
  const progressPct = nextMin
    ? Math.min(100, Math.round(((pts - tierMin) / (nextMin - tierMin)) * 100))
    : 100;

  const earnMethods: { icon: string; pts: string; desc: string; show: boolean }[] = [
    { icon: "💰", pts: `${e.basePointsPerDollar} Point for Every $1 Spent`, desc: "Points for purchases", show: e.purchaseEnabled },
    { icon: "👤", pts: `${e.createAccountPoints} Points`, desc: "Create an account", show: e.createAccountPoints > 0 },
    { icon: "📱", pts: `${e.smsSignupPoints} Points`, desc: "Sign up for SMS", show: e.smsSignupPoints > 0 },
    { icon: "⭐", pts: `${e.textReviewPoints} Points`, desc: "Leave a Review", show: e.textReviewEnabled },
    { icon: "📷", pts: `${e.photoReviewPoints} Points`, desc: "Add photo in Review", show: e.photoReviewPoints > 0 },
    { icon: "🎥", pts: `${e.videoReviewPoints} Points`, desc: "Add video in Review", show: e.videoReviewEnabled },
    { icon: "🎮", pts: `${e.discordJoinPoints} Points`, desc: "Join our Discord", show: e.discordJoinPoints > 0 },
    { icon: "📸", pts: `${e.instagramFollowPoints} Points`, desc: "Follow us on Instagram", show: e.instagramFollowPoints > 0 },
    { icon: "🎵", pts: `${e.tiktokFollowPoints} Points`, desc: "Follow us on TikTok", show: e.tiktokFollowPoints > 0 },
    { icon: "📺", pts: `${e.twitchFollowPoints} Points`, desc: "Follow us on Twitch", show: e.twitchFollowPoints > 0 },
    { icon: "👥", pts: `${e.facebookGroupPoints} Points`, desc: "Join our Facebook community", show: e.facebookGroupPoints > 0 },
    { icon: "📤", pts: `${e.facebookSharePoints} Points`, desc: "Share on Facebook", show: e.facebookSharePoints > 0 },
    { icon: "🎂", pts: `${e.birthdayPoints} Points`, desc: "Birthday reward", show: e.birthdayPoints > 0 },
  ].filter((m) => m.show);

  const earnCards = earnMethods.map((m) => `
    <div class="earn-card">
      <div class="earn-icon">${m.icon}</div>
      <div class="earn-pts">${esc(m.pts)}</div>
      <div class="earn-desc">${esc(m.desc)}</div>
    </div>`).join("");

  const rewardCards = d.rewards.map((r) => {
    const canAfford = pts >= r.pointsCost;
    const label = rewardLabel(r);
    const desc = rewardDescription(r);
    return `
    <div class="redeem-card">
      <div class="reward-value">${esc(label)}</div>
      <div class="reward-pts">${r.pointsCost.toLocaleString()} POINTS</div>
      <div class="reward-desc">${esc(desc)}</div>
      ${d.loggedIn ? `
      <form method="POST" style="margin-top:16px">
        <input type="hidden" name="rewardId" value="${esc(r.id)}">
        <button type="submit" class="btn-redeem" ${!canAfford ? "disabled" : ""}>
          ${canAfford ? "REDEEM" : "NOT ENOUGH POINTS"}
        </button>
      </form>` : `<div class="login-to-redeem">Log in to redeem</div>`}
    </div>`;
  }).join("");

  const noRewardsMsg = d.rewards.length === 0
    ? `<p style="color:rgba(255,255,255,.5);text-align:center;padding:20px 0">No rewards available yet.</p>`
    : "";

  const tierCards = d.config.tiers.map((t) => {
    const isCurrent = t.name === (d.loyalty?.tier ?? "prepper");
    return `
    <div class="tier-card ${isCurrent ? "current" : ""}">
      ${isCurrent ? `<div class="current-badge">YOUR TIER</div>` : ""}
      <div class="tier-name" style="color:${isCurrent ? "#f59e0b" : "#5b21b6"}">${esc(t.displayName)}</div>
      <div class="tier-pts">Earn ${esc(String(t.minPoints))}+ points</div>
      <ul class="tier-perks">
        <li>${t.earnMultiplier}× points per $1 spent</li>
        ${t.entryRewardPoints > 0 ? `<li>${t.entryRewardPoints} bonus points on entry</li>` : ""}
        ${t.birthdayRewardPoints > 0 ? `<li>${t.birthdayRewardPoints} birthday points</li>` : ""}
      </ul>
    </div>`;
  }).join("");

  const txRows = (d.loyalty?.recentTransactions ?? []).map((t) => {
    const positive = t.points > 0;
    const cls = t.type === "earn" ? "earn" : t.type === "redeem" ? "redeem" : "expire";
    const sign = positive ? "+" : "";
    return `
    <div class="tx-row">
      <div>
        <div class="tx-desc">${esc(t.description ?? t.type)}</div>
        <div class="tx-meta">${new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
      </div>
      <div class="tx-pts ${cls}">${sign}${t.points.toLocaleString()} pts</div>
    </div>`;
  }).join("");

  const successBanner = d.redeemedCode ? `
    <div class="code-box">
      <div class="code-label">Your discount code for ${esc(d.redeemRewardName)}</div>
      <div class="code">${esc(d.redeemedCode)}</div>
      <div class="code-hint">Copy this code and paste it at checkout</div>
    </div>` : "";

  const errorBanner = d.redeemError ? `
    <div class="error-banner">${esc(d.redeemError)}</div>` : "";

  const heroPts = pts.toLocaleString();

  const notLoggedIn = `
    <div class="login-prompt">
      <h2>DOOM Points</h2>
      <p>Log in to your account to view your points balance and redeem rewards.</p>
      <a href="/account/login?return_url=/apps/loyalty" class="btn-primary" style="display:inline-block">LOG IN TO CONTINUE</a>
    </div>`;

  const loggedInHero = `
    <div class="hero-inner">
      <p class="hi-name">HI ${esc((d.firstName ?? "THERE").toUpperCase())}!</p>
      <p class="points-balance">YOU HAVE <span class="pts-num">${heroPts}</span> POINTS!</p>
      <div class="hero-buttons">
        <a href="#redeem" class="btn-primary">REDEEM NOW</a>
        <a href="#history" class="btn-outline">REWARDS HISTORY</a>
      </div>
    </div>`;

  return `<style>
.doom-loyalty *,.doom-loyalty *::before,.doom-loyalty *::after{box-sizing:border-box;margin:0;padding:0}
.doom-loyalty{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;color:#1a1a2e;-webkit-font-smoothing:antialiased}
.doom-loyalty .wrap{max-width:920px;margin:0 auto;padding:0 20px}

/* ── Hero ── */
.doom-loyalty .hero{padding:48px 20px 40px;text-align:center;border-bottom:1px solid #f3f4f6}
.doom-loyalty .hi-name{font-size:clamp(22px,4vw,36px);font-weight:900;text-transform:uppercase;letter-spacing:.04em;color:#f59e0b;margin-bottom:8px}
.doom-loyalty .points-balance{font-size:clamp(18px,3.5vw,30px);font-weight:900;text-transform:uppercase;letter-spacing:.04em;color:#1a1a2e}
.doom-loyalty .pts-num{color:#f59e0b}
.doom-loyalty .hero-buttons{display:flex;gap:12px;justify-content:center;margin-top:24px;flex-wrap:wrap}
.doom-loyalty .btn-primary{display:inline-block;padding:13px 28px;background:#f59e0b;color:#1a1a2e;border-radius:4px;font-size:14px;font-weight:800;text-decoration:none;text-transform:uppercase;letter-spacing:.08em;border:2px solid #f59e0b;cursor:pointer}
.doom-loyalty .btn-primary:hover{background:#d97706;border-color:#d97706}
.doom-loyalty .btn-outline{display:inline-block;padding:13px 28px;background:transparent;color:#5b21b6;border:2px solid #5b21b6;border-radius:4px;font-size:14px;font-weight:800;text-decoration:none;text-transform:uppercase;letter-spacing:.08em}
.doom-loyalty .btn-outline:hover{background:#5b21b611}

/* ── Section title ── */
.doom-loyalty .section-title{font-size:clamp(18px,3vw,26px);font-weight:900;text-transform:uppercase;text-align:center;letter-spacing:.06em;margin-bottom:32px}

/* ── Earn section ── */
.doom-loyalty .earn{padding:48px 0}
.doom-loyalty .earn .section-title{color:#5b21b6}
.doom-loyalty .earn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:12px}
.doom-loyalty .earn-card{border:1px solid #e5e7eb;border-radius:8px;padding:24px 14px;text-align:center;background:#fff}
.doom-loyalty .earn-icon{font-size:30px;margin-bottom:10px}
.doom-loyalty .earn-pts{font-size:13px;font-weight:800;color:#f97316;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px;line-height:1.3}
.doom-loyalty .earn-desc{font-size:12px;color:#6b7280;line-height:1.4}

/* ── Redeem section ── */
.doom-loyalty .redeem{background:#1e0a3c;padding:52px 0;color:#fff}
.doom-loyalty .redeem .section-title{color:#f59e0b}
.doom-loyalty .redeem-subtitle{text-align:center;color:rgba(255,255,255,.7);font-size:14px;line-height:1.7;max-width:500px;margin:0 auto 12px}
.doom-loyalty .points-value-line{text-align:center;font-size:14px;font-weight:700;color:#f59e0b;margin-bottom:32px;letter-spacing:.02em}
.doom-loyalty .redeem-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.doom-loyalty .redeem-card{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:24px 16px;text-align:center}
.doom-loyalty .reward-value{font-size:28px;font-weight:900;color:#fff;margin-bottom:4px}
.doom-loyalty .reward-pts{font-size:11px;font-weight:800;color:#f59e0b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.doom-loyalty .reward-desc{font-size:12px;color:rgba(255,255,255,.55);margin-bottom:0;line-height:1.4}
.doom-loyalty .btn-redeem{display:block;width:100%;padding:10px;background:#f59e0b;color:#1a1a2e;border:none;border-radius:4px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;cursor:pointer;margin-top:16px}
.doom-loyalty .btn-redeem:hover:not(:disabled){background:#d97706}
.doom-loyalty .btn-redeem:disabled{opacity:.4;cursor:not-allowed}
.doom-loyalty .login-to-redeem{margin-top:16px;font-size:12px;color:rgba(255,255,255,.4)}
.doom-loyalty .code-box{background:rgba(245,158,11,.15);border:2px solid #f59e0b;border-radius:10px;padding:24px;text-align:center;margin-bottom:32px}
.doom-loyalty .code-label{font-size:12px;color:rgba(255,255,255,.65);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px}
.doom-loyalty .code{font-size:30px;font-weight:900;color:#f59e0b;letter-spacing:.12em;margin-bottom:8px}
.doom-loyalty .code-hint{font-size:12px;color:rgba(255,255,255,.5)}
.doom-loyalty .error-banner{background:rgba(180,35,24,.2);border:1px solid rgba(255,100,80,.4);border-radius:8px;padding:14px 18px;text-align:center;color:#ff9999;font-weight:600;font-size:14px;margin-bottom:24px}

/* ── Tiers ── */
.doom-loyalty .tiers{padding:52px 0}
.doom-loyalty .tiers .section-title{color:#5b21b6}
.doom-loyalty .tier-progress{margin-bottom:36px;max-width:600px;margin-left:auto;margin-right:auto}
.doom-loyalty .tier-progress-row{display:flex;justify-content:space-between;font-size:12px;color:#6b7280;margin-bottom:6px}
.doom-loyalty .tier-bar-bg{background:#e5e7eb;border-radius:99px;height:10px;overflow:hidden}
.doom-loyalty .tier-bar-fill{background:linear-gradient(90deg,#f59e0b,#f97316);height:100%;border-radius:99px}
.doom-loyalty .tier-status{text-align:center;margin-top:8px;font-size:13px;color:#5b21b6;font-weight:600}
.doom-loyalty .tier-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
.doom-loyalty .tier-card{border:2px solid #e5e7eb;border-radius:10px;padding:24px 16px;text-align:center}
.doom-loyalty .tier-card.current{border-color:#f59e0b;background:#fffbeb}
.doom-loyalty .current-badge{display:inline-block;padding:3px 10px;background:#f59e0b;color:#1a1a2e;border-radius:99px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px}
.doom-loyalty .tier-name{font-size:20px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.doom-loyalty .tier-pts{font-size:12px;color:#9ca3af;margin-bottom:16px}
.doom-loyalty .tier-perks{list-style:none;font-size:13px;color:#374151;text-align:left}
.doom-loyalty .tier-perks li{padding:4px 0 4px 18px;position:relative;line-height:1.4}
.doom-loyalty .tier-perks li::before{content:'✓';position:absolute;left:0;color:#5b21b6;font-weight:700}

/* ── History ── */
.doom-loyalty .history{padding:48px 0;border-top:2px solid #f3f4f6}
.doom-loyalty .history .section-title{color:#5b21b6}
.doom-loyalty .tx-list{display:flex;flex-direction:column}
.doom-loyalty .tx-row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid #f3f4f6}
.doom-loyalty .tx-desc{font-size:14px;color:#1f2937;font-weight:500}
.doom-loyalty .tx-meta{font-size:12px;color:#9ca3af;margin-top:2px}
.doom-loyalty .tx-pts{font-size:15px;font-weight:700;white-space:nowrap}
.doom-loyalty .tx-pts.earn{color:#16a34a}
.doom-loyalty .tx-pts.redeem{color:#dc2626}
.doom-loyalty .tx-pts.expire{color:#9ca3af}

/* ── Login prompt ── */
.doom-loyalty .login-prompt{padding:64px 20px;text-align:center}
.doom-loyalty .login-prompt h2{font-size:24px;font-weight:900;color:#5b21b6;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px}
.doom-loyalty .login-prompt p{color:#6b7280;margin-bottom:24px;font-size:15px}
</style>

<div class="doom-loyalty">

${!d.loggedIn ? `<div class="hero"><div class="wrap">${notLoggedIn}</div></div>` : `
<div class="hero"><div class="wrap">${loggedInHero}</div></div>

<!-- ═══ WAYS TO EARN POINTS ═══ -->
<section class="earn" id="earn">
  <div class="wrap">
    <h2 class="section-title">WAYS TO EARN POINTS</h2>
    <div class="earn-grid">${earnCards}</div>
  </div>
</section>

<!-- ═══ USING YOUR POINTS ═══ -->
<section class="redeem" id="redeem">
  <div class="wrap">
    <h2 class="section-title">USING YOUR POINTS</h2>
    <p class="redeem-subtitle">Racking up points is easy. Redeeming them is even easier.<br>Click Redeem, then copy &amp; paste your code at checkout.</p>
    ${pts > 0 ? `<p class="points-value-line">You have <strong>${heroPts} points</strong> to spend</p>` : ""}
    ${successBanner}
    ${errorBanner}
    ${noRewardsMsg}
    <div class="redeem-grid">${rewardCards}</div>
  </div>
</section>

<!-- ═══ REWARD TIERS ═══ -->
<section class="tiers" id="tiers">
  <div class="wrap">
    <h2 class="section-title">REWARD TIERS</h2>
    <div class="tier-progress">
      <div class="tier-progress-row">
        <span>${esc(tierDisplay)}</span>
        <span>${nextMin ? `${esc(d.loyalty?.nextTierDisplayName)} in ${esc(String(d.loyalty?.pointsToNextTier ?? 0))} pts` : "Top tier reached!"}</span>
      </div>
      <div class="tier-bar-bg">
        <div class="tier-bar-fill" style="width:${progressPct}%"></div>
      </div>
      <div class="tier-status">${pts.toLocaleString()} / ${nextMin ? nextMin.toLocaleString() : "∞"} points</div>
    </div>
    <div class="tier-grid">${tierCards}</div>
  </div>
</section>

<!-- ═══ REWARDS HISTORY ═══ -->
<section class="history" id="history">
  <div class="wrap">
    <h2 class="section-title">REWARDS HISTORY</h2>
    ${txRows.length > 0
      ? `<div class="tx-list">${txRows}</div>`
      : `<p style="text-align:center;color:#9ca3af;padding:20px 0;font-size:14px">No activity yet — earn points by making a purchase or leaving a review!</p>`
    }
  </div>
</section>`}

</div>`;
}

