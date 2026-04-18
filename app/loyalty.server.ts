/**
 * Loyalty points engine — core business logic and admin queries.
 *
 * TIER CONFIG: placeholder values are used until Eric provides the confirmed
 * "Ends with Benefits" tier names, thresholds, and earn rates (Milestone 1 blocker).
 * Once provided, update them via the Tiers tab in the admin dashboard.
 */

import prisma from "./db.server";

// ─── Simple in-process cache (same pattern as reviews.server.ts) ──────────────

interface CacheEntry<T> { value: T; expiresAt: number }
const cache = new Map<string, CacheEntry<unknown>>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value);
  return fn().then((value) => {
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  });
}

export function invalidateLoyaltyCache(shop: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(shop)) cache.delete(key);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TierConfig {
  name: string;               // internal key e.g. "prepper"
  displayName: string;        // shown in UI e.g. "Prepper"
  minPoints: number;
  earnMultiplier: number;
  entryRewardPoints: number;  // bonus points awarded on tier entry
  birthdayRewardPoints: number;
}

export interface EarningRulesConfig {
  basePointsPerDollar: number;
  purchaseEnabled: boolean;
  // Reviews
  textReviewEnabled: boolean;
  textReviewPoints: number;   // product review (text only)
  photoReviewPoints: number;  // photo review
  videoReviewEnabled: boolean;
  videoReviewPoints: number;  // video review
  // Social / account actions (one-time unless noted)
  createAccountPoints: number;
  smsSignupPoints: number;
  facebookSharePoints: number;
  facebookGroupPoints: number;
  instagramFollowPoints: number;
  tiktokFollowPoints: number;
  discordJoinPoints: number;
  twitchFollowPoints: number;
  birthdayPoints: number;     // awarded once per year
  referralPoints: number;     // awarded per successful referral
}

export interface ReviewSettingsConfig {
  flagKeywords: string[];
  lowStarThreshold: number;
}

export interface ShopConfigData {
  pointsCurrencyName: string;
  expiryMonths: number;
  expiryWarningDays: number;
  launcherPromptsEnabled: boolean;
  silentReauthDays: number;
  tiers: TierConfig[];
  earningRules: EarningRulesConfig;
  reviewSettings: ReviewSettingsConfig;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

// "Ends with Benefits" program — confirmed from Yotpo Loyalty dashboard Apr 2026.
const DEFAULT_SHOP_CONFIG: ShopConfigData = {
  pointsCurrencyName: "points",
  expiryMonths: 12,          // 12-month rolling from last earn or redeem
  expiryWarningDays: 30,
  launcherPromptsEnabled: true,
  silentReauthDays: 30,
  tiers: [
    {
      name: "prepper",   displayName: "Prepper",
      minPoints: 0,   earnMultiplier: 1.0,
      entryRewardPoints: 0,   birthdayRewardPoints: 0,
    },
    {
      name: "survivor",  displayName: "Survivor",
      minPoints: 250, earnMultiplier: 1.25,
      entryRewardPoints: 50,  birthdayRewardPoints: 100,
    },
    {
      name: "ruler",     displayName: "Ruler",
      minPoints: 500, earnMultiplier: 1.5,
      entryRewardPoints: 100, birthdayRewardPoints: 150,
    },
  ],
  earningRules: {
    basePointsPerDollar:    1,
    purchaseEnabled:        true,
    textReviewEnabled:      true,
    textReviewPoints:       20,
    photoReviewPoints:      20,
    videoReviewEnabled:     true,
    videoReviewPoints:      25,
    createAccountPoints:    10,
    smsSignupPoints:        25,
    facebookSharePoints:    10,
    facebookGroupPoints:    10,
    instagramFollowPoints:  10,
    tiktokFollowPoints:     10,
    discordJoinPoints:      10,
    twitchFollowPoints:     10,
    birthdayPoints:         50,
    referralPoints:         200,
  },
  reviewSettings: {
    flagKeywords: ["spam", "discount", "cheap", "external link"],
    lowStarThreshold: 2,
  },
};

// ─── Shop config ──────────────────────────────────────────────────────────────

export function getShopConfig(shop: string): Promise<ShopConfigData> {
  // 120 s TTL — config changes only when an admin saves settings.
  // invalidateLoyaltyCache(shop) is called by saveShopConfig to clear this.
  return cached(`${shop}:config`, 120_000, async () => {
    const record = await prisma.shopConfig.findUnique({ where: { shop } });
    if (!record) return DEFAULT_SHOP_CONFIG;
    const stored = record.config as Partial<ShopConfigData>;
    return {
      ...DEFAULT_SHOP_CONFIG,
      ...stored,
      tiers: stored.tiers ?? DEFAULT_SHOP_CONFIG.tiers,
      earningRules: stored.earningRules
        ? { ...DEFAULT_SHOP_CONFIG.earningRules, ...(stored.earningRules as Partial<EarningRulesConfig>) }
        : DEFAULT_SHOP_CONFIG.earningRules,
      reviewSettings: stored.reviewSettings
        ? { ...DEFAULT_SHOP_CONFIG.reviewSettings, ...(stored.reviewSettings as Partial<ReviewSettingsConfig>) }
        : DEFAULT_SHOP_CONFIG.reviewSettings,
    };
  });
}

type ShopConfigPatch = Partial<Omit<ShopConfigData, "earningRules" | "reviewSettings">> & {
  earningRules?: Partial<EarningRulesConfig>;
  reviewSettings?: Partial<ReviewSettingsConfig>;
};

export async function saveShopConfig(shop: string, patch: ShopConfigPatch): Promise<void> {
  const current = await getShopConfig(shop);
  // Deep-merge nested objects so callers can patch a subset of earningRules/reviewSettings
  // without wiping the other fields. JSON round-trip satisfies Prisma's Json type.
  const merged: ShopConfigData = {
    ...current,
    ...patch,
    tiers: patch.tiers ?? current.tiers,
    earningRules: patch.earningRules
      ? { ...current.earningRules, ...patch.earningRules }
      : current.earningRules,
    reviewSettings: patch.reviewSettings
      ? { ...current.reviewSettings, ...patch.reviewSettings }
      : current.reviewSettings,
  };
  await prisma.shopConfig.upsert({
    where: { shop },
    create: { shop, config: JSON.parse(JSON.stringify(merged)) },
    update: { config: JSON.parse(JSON.stringify(merged)) },
  });
  // Bust the config cache so the next request reads the new value.
  cache.delete(`${shop}:config`);
}

// ─── Tier helpers ─────────────────────────────────────────────────────────────

export function getTierForPoints(points: number, tiers: TierConfig[]): TierConfig {
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (points >= tiers[i].minPoints) return tiers[i];
  }
  return tiers[0];
}

export function getNextTier(currentTierName: string, tiers: TierConfig[]): TierConfig | null {
  const idx = tiers.findIndex((t) => t.name === currentTierName);
  return idx >= 0 && idx < tiers.length - 1 ? tiers[idx + 1] : null;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ─── Award points for a paid order ───────────────────────────────────────────

export interface AwardPointsInput {
  shop: string;
  shopifyOrderId: string;
  shopifyCustomerId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  orderTotalUsd: number;
}

export interface AwardPointsResult {
  pointsAwarded: number;
  newBalance: number;
  tier: string;
  alreadyProcessed: boolean;
}

export async function awardPointsForOrder(input: AwardPointsInput): Promise<AwardPointsResult> {
  const { shop, shopifyOrderId, shopifyCustomerId, email, firstName, lastName, orderTotalUsd } = input;

  // Idempotency: skip if this order was already processed.
  const existing = await prisma.transaction.findFirst({
    where: { orderId: shopifyOrderId },
  });
  if (existing) {
    const customer = await prisma.customer.findUnique({ where: { shopifyCustomerId } });
    return {
      pointsAwarded: 0,
      newBalance: customer?.pointsBalance ?? 0,
      tier: customer?.tier ?? "bronze",
      alreadyProcessed: true,
    };
  }

  const config = await getShopConfig(shop);

  const customer = await prisma.customer.upsert({
    where: { shopifyCustomerId },
    create: {
      shopifyCustomerId,
      shop,
      email,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      pointsBalance: 0,
      tier: config.tiers[0].name,
    },
    update: {
      email,
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
    },
  });

  const currentTier = getTierForPoints(customer.pointsBalance, config.tiers);
  const purchasePoints = Math.floor(
    orderTotalUsd * config.earningRules.basePointsPerDollar * currentTier.earnMultiplier,
  );

  const balanceAfterPurchase = customer.pointsBalance + purchasePoints;
  const newTier = getTierForPoints(balanceAfterPurchase, config.tiers);
  const tierChanged = newTier.name !== currentTier.name;

  // Award tier entry bonus if the customer just crossed into a new tier
  const entryBonus = tierChanged ? newTier.entryRewardPoints : 0;
  const totalPointsAwarded = purchasePoints + entryBonus;
  const newBalance = balanceAfterPurchase + entryBonus;
  const newExpiry = addMonths(new Date(), config.expiryMonths);

  await prisma.$transaction(async (tx) => {
    await tx.transaction.create({
      data: {
        customerId: customer.id,
        type: "earn",
        points: purchasePoints,
        description: `Order #${shopifyOrderId} — $${orderTotalUsd.toFixed(2)}`,
        orderId: shopifyOrderId,
      },
    });
    await tx.customer.update({
      where: { id: customer.id },
      data: { pointsBalance: newBalance, tier: newTier.name, pointsExpiresAt: newExpiry },
    });
    // Record entry bonus as a separate row so history is readable
    if (entryBonus > 0) {
      await tx.transaction.create({
        data: {
          customerId: customer.id,
          type: "earn",
          points: entryBonus,
          description: `${newTier.displayName} tier entry reward`,
        },
      });
    }
  });

  return {
    pointsAwarded: totalPointsAwarded,
    newBalance,
    tier: newTier.name,
    alreadyProcessed: false,
  };
}

// ─── Customer loyalty state (storefront API) ──────────────────────────────────

export interface CustomerLoyaltyState {
  found: boolean;
  customerId: string | null;
  pointsBalance: number;
  tier: string;
  tierDisplayName: string;
  tierMinPoints: number;
  tierMultiplier: number;
  nextTier: string | null;
  nextTierDisplayName: string | null;
  nextTierMinPoints: number | null;
  pointsToNextTier: number | null;
  pointsExpiresAt: string | null;
  recentTransactions: {
    type: string;
    points: number;
    description: string | null;
    createdAt: string;
  }[];
}

export async function getCustomerLoyalty(shopifyCustomerId: string): Promise<CustomerLoyaltyState> {
  const customer = await prisma.customer.findUnique({
    where: { shopifyCustomerId },
    include: {
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  const baseTier = DEFAULT_SHOP_CONFIG.tiers[0];
  const baseNext = DEFAULT_SHOP_CONFIG.tiers[1];

  if (!customer) {
    return {
      found: false,
      customerId: null,
      pointsBalance: 0,
      tier: baseTier.name,
      tierDisplayName: baseTier.displayName,
      tierMinPoints: baseTier.minPoints,
      tierMultiplier: baseTier.earnMultiplier,
      nextTier: baseNext?.name ?? null,
      nextTierDisplayName: baseNext?.displayName ?? null,
      nextTierMinPoints: baseNext?.minPoints ?? null,
      pointsToNextTier: baseNext?.minPoints ?? null,
      pointsExpiresAt: null,
      recentTransactions: [],
    };
  }

  const config = await getShopConfig(customer.shop);
  const currentTierConfig = getTierForPoints(customer.pointsBalance, config.tiers);
  const next = getNextTier(currentTierConfig.name, config.tiers);

  return {
    found: true,
    customerId: customer.shopifyCustomerId,
    pointsBalance: customer.pointsBalance,
    tier: customer.tier,
    tierDisplayName: currentTierConfig.displayName,
    tierMinPoints: currentTierConfig.minPoints,
    tierMultiplier: currentTierConfig.earnMultiplier,
    nextTier: next?.name ?? null,
    nextTierDisplayName: next?.displayName ?? null,
    nextTierMinPoints: next?.minPoints ?? null,
    pointsToNextTier: next ? next.minPoints - customer.pointsBalance : null,
    pointsExpiresAt: customer.pointsExpiresAt?.toISOString() ?? null,
    recentTransactions: customer.transactions.map((t) => ({
      type: t.type,
      points: t.points,
      description: t.description,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

// ─── Expire stale points (scheduled job) ─────────────────────────────────────

export async function expireStalePoints(shop: string): Promise<number> {
  const now = new Date();
  const stale = await prisma.customer.findMany({
    where: {
      shop,
      pointsBalance: { gt: 0 },
      pointsExpiresAt: { lt: now },
    },
  });

  if (stale.length === 0) return 0;

  let expired = 0;
  for (const customer of stale) {
    await prisma.$transaction([
      prisma.transaction.create({
        data: {
          customerId: customer.id,
          type: "expire",
          points: -customer.pointsBalance,
          description: "Points expired after 12 months of inactivity",
        },
      }),
      prisma.customer.update({
        where: { id: customer.id },
        data: { pointsBalance: 0, pointsExpiresAt: null },
      }),
    ]);
    expired++;
  }

  return expired;
}

// ─── Admin: overview stats ────────────────────────────────────────────────────

export function getOverviewStats(shop: string) {
  // 60 s TTL — member counts and point totals are aggregate stats,
  // not transactional data. A 1-minute lag is acceptable on an admin dashboard.
  return cached(`${shop}:overview`, 60_000, async () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);

    const [totalMembers, pointsAgg, activeRewardsCount, expiringCount] = await Promise.all([
      prisma.customer.count({ where: { shop } }),
      prisma.transaction.aggregate({
        where: { customer: { shop }, type: "earn" },
        _sum: { points: true },
      }),
      prisma.reward.count({ where: { shop, isActive: true } }),
      prisma.customer.count({
        where: {
          shop,
          pointsBalance: { gt: 0 },
          pointsExpiresAt: { not: null, lt: soon },
        },
      }),
    ]);

    return {
      totalMembers,
      totalPointsIssued: pointsAgg._sum.points ?? 0,
      activeRewardsCount,
      expiringIn30Days: expiringCount,
    };
  });
}

// ─── Admin: tier member counts ────────────────────────────────────────────────

export async function getTierCounts(shop: string): Promise<Record<string, number>> {
  const rows = await prisma.customer.groupBy({
    by: ["tier"],
    where: { shop },
    _count: { id: true },
  });
  return Object.fromEntries(rows.map((r) => [r.tier, r._count.id]));
}

// ─── Admin: dashboard supplemental stats (cached) ────────────────────────────
// These three queries are only used by the dashboard loader. Grouping them here
// lets us cache them alongside the other loyalty stats.

export function getDashboardExtras(shop: string) {
  return cached(`${shop}:dash-extras`, 60_000, async () => {
    const [balanceAgg, redemptionCount, recentTransactions, redeemingCustomers, tierRows, participatingCustomers] = await Promise.all([
      prisma.customer.aggregate({ where: { shop }, _sum: { pointsBalance: true } }),
      prisma.redemption.count({ where: { customer: { shop } } }),
      prisma.transaction.findMany({
        where: { customer: { shop }, type: "earn" },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { customer: { select: { email: true, firstName: true, lastName: true } } },
      }),
      prisma.customer.count({ where: { shop, redemptions: { some: {} } } }),
      prisma.customer.groupBy({ by: ["tier"], where: { shop }, _count: { id: true } }),
      prisma.customer.count({ where: { shop, transactions: { some: {} } } }),
    ]);

    const tierCounts: Record<string, number> = {};
    for (const r of tierRows) tierCounts[r.tier] = r._count.id;

    const totalMembers = Object.values(tierCounts).reduce((a, b) => a + b, 0);
    const participationRate = totalMembers > 0 ? Math.round((participatingCustomers / totalMembers) * 100) : 0;

    return {
      totalPointsInCirculation: balanceAgg._sum.pointsBalance ?? 0,
      redemptionCount,
      redeemingCustomers,
      tierCounts,
      participationRate,
      recentTransactions: recentTransactions.map((t) => {
        const name = t.customer
          ? [t.customer.firstName, t.customer.lastName].filter(Boolean).join(" ") || t.customer.email
          : "Unknown";
        return {
          id: t.id,
          label: `${name} — ${t.points.toLocaleString()} pts`,
          meta: t.description ?? "Earn event",
          time: t.createdAt.toISOString(),
        };
      }),
    };
  });
}

// ─── Admin: member list ───────────────────────────────────────────────────────

const MEMBERS_PAGE_SIZE = 25;

export async function getMembers(
  shop: string,
  { search = "", page = 1 }: { search?: string; page?: number },
) {
  const where = {
    shop,
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const soon = new Date();
  soon.setDate(soon.getDate() + 30);

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { pointsBalance: "desc" },
      skip: (page - 1) * MEMBERS_PAGE_SIZE,
      take: MEMBERS_PAGE_SIZE,
      include: {
        _count: { select: { reviews: true } },
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    members: customers.map((c) => ({
      id: c.id,
      shopifyCustomerId: c.shopifyCustomerId,
      email: c.email,
      firstName: c.firstName,
      lastName: c.lastName,
      tier: c.tier,
      pointsBalance: c.pointsBalance,
      expiringSoon:
        c.pointsBalance > 0 &&
        c.pointsExpiresAt != null &&
        c.pointsExpiresAt < soon,
      reviewCount: c._count.reviews,
      lastActivityAt: c.transactions[0]?.createdAt.toISOString() ?? null,
    })),
    memberTotal: total,
    memberPage: page,
    memberPageSize: MEMBERS_PAGE_SIZE,
  };
}

// ─── Admin: member detail ─────────────────────────────────────────────────────

export async function getMemberDetail(shop: string, memberId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: memberId, shop },
    include: {
      transactions: { orderBy: { createdAt: "desc" }, take: 100 },
      redemptions: {
        orderBy: { createdAt: "desc" },
        include: { reward: { select: { name: true, type: true, value: true } } },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true, rating: true, title: true, status: true,
          shopifyProductId: true, createdAt: true,
        },
      },
    },
  });
  return customer;
}

export async function adjustPoints(
  shop: string,
  memberId: string,
  delta: number,
  reason: string,
): Promise<{ newBalance: number }> {
  const customer = await prisma.customer.findFirst({ where: { id: memberId, shop } });
  if (!customer) throw new Error("Member not found");

  const config = await getShopConfig(shop);
  const newBalance = Math.max(0, customer.pointsBalance + delta);
  const newTier = getTierForPoints(newBalance, config.tiers);
  const newExpiry = newBalance > 0 ? addMonths(new Date(), config.expiryMonths) : null;

  await prisma.$transaction([
    prisma.transaction.create({
      data: {
        customerId: customer.id,
        type: "adjust",
        points: delta,
        description: reason || "Manual adjustment",
      },
    }),
    prisma.customer.update({
      where: { id: customer.id },
      data: { pointsBalance: newBalance, tier: newTier.name, pointsExpiresAt: newExpiry },
    }),
  ]);

  return { newBalance };
}

// ─── Admin: rewards ───────────────────────────────────────────────────────────

export async function getRewards(shop: string) {
  const rows = await prisma.reward.findMany({
    where: { shop },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    type: r.type,
    value: r.value,
    pointsCost: r.pointsCost,
    isActive: r.isActive,
  }));
}

export async function createReward(
  shop: string,
  data: { name: string; description: string; type: string; value: string; pointsCost: number },
) {
  return prisma.reward.create({ data: { shop, ...data } });
}

export async function updateReward(
  id: string,
  data: { name: string; description: string; type: string; value: string; pointsCost: number },
) {
  return prisma.reward.update({ where: { id }, data });
}

export async function toggleRewardActive(id: string, isActive: boolean) {
  return prisma.reward.update({ where: { id }, data: { isActive } });
}

export async function deleteReward(id: string) {
  return prisma.reward.delete({ where: { id } });
}

// ─── Award points for an approved review ─────────────────────────────────────

// ─── Reserve → finalize/cancel redemption (race-safe two-phase) ──────────────
//
// Why two phases? Creating a Shopify discount code is an external I/O call that
// can fail or be duplicated under concurrency. The old single-phase flow had two
// gaps: (1) two simultaneous redemptions could both pass a balance check against
// the same stale read and double-spend, (2) if Shopify code creation succeeded
// but the DB deduction failed afterwards the customer got a free discount.
//
// Fixed by: reserve first (atomic conditional decrement + pending Redemption),
// then create the Shopify code, then finalize (attach code + mark fulfilled) or
// cancel (refund points + mark cancelled) depending on the outcome.

export interface Reservation {
  redemptionId: string;
  reward: { id: string; name: string; type: string; value: string };
  pointsSpent: number;
  newBalance: number;
}

export type ReservationResult =
  | { success: true; reservation: Reservation }
  | { success: false; error: string };

export async function reserveRedemption(
  shop: string,
  shopifyCustomerId: string,
  rewardId: string,
): Promise<ReservationResult> {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { shopifyCustomerId } });
    if (!customer || customer.shop !== shop) {
      return { success: false, error: "Customer not found" } as const;
    }

    const reward = await tx.reward.findUnique({ where: { id: rewardId } });
    if (!reward || reward.shop !== shop || !reward.isActive) {
      return { success: false, error: "Reward not available" } as const;
    }

    // Atomic conditional decrement — only succeeds if balance is still sufficient.
    // Beats out concurrent redemption attempts without needing serializable isolation.
    const dec = await tx.customer.updateMany({
      where: { id: customer.id, pointsBalance: { gte: reward.pointsCost } },
      data: { pointsBalance: { decrement: reward.pointsCost } },
    });
    if (dec.count !== 1) {
      return { success: false, error: "Insufficient points" } as const;
    }

    const redemption = await tx.redemption.create({
      data: {
        customerId: customer.id,
        rewardId,
        pointsSpent: reward.pointsCost,
        status: "pending",
      },
    });

    await tx.transaction.create({
      data: {
        customerId: customer.id,
        type: "redeem",
        points: -reward.pointsCost,
        description: `Redeemed: ${reward.name}`,
      },
    });

    return {
      success: true as const,
      reservation: {
        redemptionId: redemption.id,
        reward: { id: reward.id, name: reward.name, type: reward.type, value: reward.value },
        pointsSpent: reward.pointsCost,
        newBalance: customer.pointsBalance - reward.pointsCost,
      },
    };
  });
}

export async function finalizeRedemption(
  redemptionId: string,
  discountCode: string,
): Promise<void> {
  const redemption = await prisma.redemption.findUnique({ where: { id: redemptionId } });
  if (!redemption || redemption.status !== "pending") return;

  const customer = await prisma.customer.findUnique({ where: { id: redemption.customerId } });
  if (!customer) return;

  const config = await getShopConfig(customer.shop);
  const newTier = getTierForPoints(customer.pointsBalance, config.tiers);
  const newExpiry = customer.pointsBalance > 0 ? addMonths(new Date(), config.expiryMonths) : null;

  await prisma.$transaction([
    prisma.redemption.update({
      where: { id: redemptionId },
      data: { discountCode, status: "fulfilled" },
    }),
    prisma.customer.update({
      where: { id: customer.id },
      data: { tier: newTier.name, pointsExpiresAt: newExpiry },
    }),
  ]);
}

export async function cancelRedemption(redemptionId: string): Promise<void> {
  const redemption = await prisma.redemption.findUnique({ where: { id: redemptionId } });
  if (!redemption || redemption.status !== "pending") return;

  await prisma.$transaction([
    prisma.customer.update({
      where: { id: redemption.customerId },
      data: { pointsBalance: { increment: redemption.pointsSpent } },
    }),
    prisma.transaction.create({
      data: {
        customerId: redemption.customerId,
        type: "adjust",
        points: redemption.pointsSpent,
        description: "Refund: redemption cancelled",
      },
    }),
    prisma.redemption.update({
      where: { id: redemptionId },
      data: { status: "cancelled" },
    }),
  ]);
}

// ─── Award points for an approved review ─────────────────────────────────────

export async function awardPointsForReview(
  customerId: string,
  shop: string,
  reviewType: "text" | "photo" | "video",
): Promise<void> {
  const config = await getShopConfig(shop);
  if (!config.earningRules.textReviewEnabled) return;

  let pointsToAward: number;
  let description: string;

  if (reviewType === "video" && config.earningRules.videoReviewEnabled) {
    pointsToAward = config.earningRules.videoReviewPoints;
    description = "Approved video review";
  } else if (reviewType === "photo") {
    pointsToAward = config.earningRules.photoReviewPoints;
    description = "Approved photo review";
  } else {
    pointsToAward = config.earningRules.textReviewPoints;
    description = "Approved review";
  }

  if (pointsToAward <= 0) return;
  await _awardPoints(customerId, config, pointsToAward, description);
}

// ─── Award points for a one-time / social action ──────────────────────────────

export type LoyaltyActionType =
  | "create_account"
  | "sms_signup"
  | "facebook_share"
  | "facebook_group"
  | "instagram_follow"
  | "tiktok_follow"
  | "discord_join"
  | "twitch_follow"
  | "birthday"
  | "referral";

const ACTION_LABELS: Record<LoyaltyActionType, string> = {
  create_account:    "Account created",
  sms_signup:        "SMS signup",
  facebook_share:    "Facebook share",
  facebook_group:    "Facebook group joined",
  instagram_follow:  "Instagram follow",
  tiktok_follow:     "TikTok follow",
  discord_join:      "Discord joined",
  twitch_follow:     "Twitch follow",
  birthday:          "Birthday reward",
  referral:          "Referral reward",
};

export async function awardPointsForAction(
  customerId: string,
  shop: string,
  action: LoyaltyActionType,
): Promise<{ pointsAwarded: number; newBalance: number }> {
  const config = await getShopConfig(shop);
  const rules   = config.earningRules;

  const pointsMap: Record<LoyaltyActionType, number> = {
    create_account:   rules.createAccountPoints,
    sms_signup:       rules.smsSignupPoints,
    facebook_share:   rules.facebookSharePoints,
    facebook_group:   rules.facebookGroupPoints,
    instagram_follow: rules.instagramFollowPoints,
    tiktok_follow:    rules.tiktokFollowPoints,
    discord_join:     rules.discordJoinPoints,
    twitch_follow:    rules.twitchFollowPoints,
    birthday:         rules.birthdayPoints,
    referral:         rules.referralPoints,
  };

  const points = pointsMap[action] ?? 0;
  if (points <= 0) return { pointsAwarded: 0, newBalance: 0 };

  const newBalance = await _awardPoints(customerId, config, points, ACTION_LABELS[action]);
  return { pointsAwarded: points, newBalance };
}

// ─── Signup bonus (first-interaction bootstrap) ─────────────────────────────
// Creates a customer record if missing and awards the create_account bonus
// exactly once. Idempotent — safe to call on every proxy-page visit.
export async function ensureCustomerAndGrantSignup(
  shop: string,
  shopifyCustomerId: string,
): Promise<{ pointsAwarded: number; newBalance: number; created: boolean }> {
  const config = await getShopConfig(shop);

  const existing = await prisma.customer.findUnique({ where: { shopifyCustomerId } });

  const customer = existing ?? await prisma.customer.create({
    data: {
      shopifyCustomerId,
      shop,
      email: `unknown+${shopifyCustomerId}@placeholder.local`,
      pointsBalance: 0,
      tier: config.tiers[0].name,
    },
  });

  const alreadyGranted = await prisma.transaction.findFirst({
    where: { customerId: customer.id, description: ACTION_LABELS.create_account },
    select: { id: true },
  });
  if (alreadyGranted) {
    return { pointsAwarded: 0, newBalance: customer.pointsBalance, created: !existing };
  }

  const result = await awardPointsForAction(customer.id, shop, "create_account");
  return { ...result, created: !existing };
}

// ─── Shared internal: award points + update tier + expiry ────────────────────

async function _awardPoints(
  customerId: string,
  config: ShopConfigData,
  points: number,
  description: string,
): Promise<number> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return 0;

  const prevTier   = getTierForPoints(customer.pointsBalance, config.tiers);
  const newBalance = customer.pointsBalance + points;
  const newTier    = getTierForPoints(newBalance, config.tiers);
  const tierChanged = newTier.name !== prevTier.name;
  const entryBonus  = tierChanged ? newTier.entryRewardPoints : 0;
  const finalBalance = newBalance + entryBonus;
  const newExpiry    = addMonths(new Date(), config.expiryMonths);

  await prisma.$transaction(async (tx) => {
    await tx.transaction.create({
      data: { customerId, type: "earn", points, description },
    });
    await tx.customer.update({
      where: { id: customerId },
      data: { pointsBalance: finalBalance, tier: newTier.name, pointsExpiresAt: newExpiry },
    });
    if (entryBonus > 0) {
      await tx.transaction.create({
        data: {
          customerId,
          type: "earn",
          points: entryBonus,
          description: `${newTier.displayName} tier entry reward`,
        },
      });
    }
  });
  return finalBalance;
}
