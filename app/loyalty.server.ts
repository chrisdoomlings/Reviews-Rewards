/**
 * Loyalty points engine — core business logic and admin queries.
 *
 * TIER CONFIG: placeholder values are used until Eric provides the confirmed
 * "Ends with Benefits" tier names, thresholds, and earn rates (Milestone 1 blocker).
 * Once provided, update them via the Tiers tab in the admin dashboard.
 */

import prisma from "./db.server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TierConfig {
  name: string;          // internal key e.g. "bronze"
  displayName: string;   // shown in UI e.g. "Bronze"
  minPoints: number;
  earnMultiplier: number;
}

export interface EarningRulesConfig {
  basePointsPerDollar: number;
  purchaseEnabled: boolean;
  textReviewEnabled: boolean;
  textReviewPoints: number;
  videoReviewEnabled: boolean;
  videoReviewPoints: number;
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

// TODO: Replace tier values with confirmed "Ends with Benefits" data from Eric.
const DEFAULT_SHOP_CONFIG: ShopConfigData = {
  pointsCurrencyName: "Doom Points",
  expiryMonths: 12,
  expiryWarningDays: 30,
  launcherPromptsEnabled: true,
  silentReauthDays: 30,
  tiers: [
    { name: "bronze", displayName: "Bronze", minPoints: 0,    earnMultiplier: 1.0 },
    { name: "silver", displayName: "Silver", minPoints: 500,  earnMultiplier: 1.5 },
    { name: "gold",   displayName: "Gold",   minPoints: 1500, earnMultiplier: 2.0 },
  ],
  earningRules: {
    basePointsPerDollar: 1,
    purchaseEnabled: true,
    textReviewEnabled: true,
    textReviewPoints: 75,
    videoReviewEnabled: true,
    videoReviewPoints: 50,
  },
  reviewSettings: {
    flagKeywords: ["spam", "discount", "cheap", "external link"],
    lowStarThreshold: 2,
  },
};

// ─── Shop config ──────────────────────────────────────────────────────────────

export async function getShopConfig(shop: string): Promise<ShopConfigData> {
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
  const pointsToAward = Math.floor(
    orderTotalUsd * config.earningRules.basePointsPerDollar * currentTier.earnMultiplier,
  );

  const newBalance = customer.pointsBalance + pointsToAward;
  const newTier = getTierForPoints(newBalance, config.tiers);
  const newExpiry = addMonths(new Date(), config.expiryMonths);

  await prisma.$transaction([
    prisma.transaction.create({
      data: {
        customerId: customer.id,
        type: "earn",
        points: pointsToAward,
        description: `Order #${shopifyOrderId} — $${orderTotalUsd.toFixed(2)}`,
        orderId: shopifyOrderId,
      },
    }),
    prisma.customer.update({
      where: { id: customer.id },
      data: {
        pointsBalance: newBalance,
        tier: newTier.name,
        pointsExpiresAt: newExpiry,
      },
    }),
  ]);

  return {
    pointsAwarded: pointsToAward,
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
  tierMultiplier: number;
  nextTier: string | null;
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

  if (!customer) {
    return {
      found: false,
      customerId: null,
      pointsBalance: 0,
      tier: DEFAULT_SHOP_CONFIG.tiers[0].name,
      tierMultiplier: DEFAULT_SHOP_CONFIG.tiers[0].earnMultiplier,
      nextTier: DEFAULT_SHOP_CONFIG.tiers[1]?.name ?? null,
      pointsToNextTier: DEFAULT_SHOP_CONFIG.tiers[1]?.minPoints ?? null,
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
    tierMultiplier: currentTierConfig.earnMultiplier,
    nextTier: next?.name ?? null,
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

export async function getOverviewStats(shop: string) {
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

// ─── Process a reward redemption ─────────────────────────────────────────────

export interface RedemptionResult {
  success: boolean;
  pointsSpent: number;
  newBalance: number;
  error?: string;
}

export async function processRedemption(
  shop: string,
  shopifyCustomerId: string,
  rewardId: string,
  discountCode: string,
): Promise<RedemptionResult> {
  const [customer, reward, config] = await Promise.all([
    prisma.customer.findUnique({ where: { shopifyCustomerId } }),
    prisma.reward.findUnique({ where: { id: rewardId } }),
    getShopConfig(shop),
  ]);

  if (!customer || customer.shop !== shop) {
    return { success: false, pointsSpent: 0, newBalance: 0, error: "Customer not found" };
  }
  if (!reward || reward.shop !== shop || !reward.isActive) {
    return { success: false, pointsSpent: 0, newBalance: 0, error: "Reward not available" };
  }
  if (customer.pointsBalance < reward.pointsCost) {
    return {
      success: false,
      pointsSpent: 0,
      newBalance: customer.pointsBalance,
      error: "Insufficient points",
    };
  }

  const newBalance = customer.pointsBalance - reward.pointsCost;
  const newTier = getTierForPoints(newBalance, config.tiers);
  const newExpiry = newBalance > 0 ? addMonths(new Date(), config.expiryMonths) : null;

  await prisma.$transaction([
    prisma.redemption.create({
      data: {
        customerId: customer.id,
        rewardId,
        pointsSpent: reward.pointsCost,
        discountCode,
        status: "fulfilled",
      },
    }),
    prisma.transaction.create({
      data: {
        customerId: customer.id,
        type: "redeem",
        points: -reward.pointsCost,
        description: `Redeemed: ${reward.name}`,
      },
    }),
    prisma.customer.update({
      where: { id: customer.id },
      data: { pointsBalance: newBalance, tier: newTier.name, pointsExpiresAt: newExpiry },
    }),
  ]);

  return { success: true, pointsSpent: reward.pointsCost, newBalance };
}

// ─── Award points for an approved review ─────────────────────────────────────

export async function awardPointsForReview(
  customerId: string,
  shop: string,
  hasVideo: boolean,
): Promise<void> {
  const config = await getShopConfig(shop);
  if (!config.earningRules.textReviewEnabled) return;

  let pointsToAward = config.earningRules.textReviewPoints;
  let description = "Approved text review";

  if (hasVideo && config.earningRules.videoReviewEnabled) {
    pointsToAward += config.earningRules.videoReviewPoints;
    description = "Approved video review";
  }

  if (pointsToAward <= 0) return;

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return;

  const newBalance = customer.pointsBalance + pointsToAward;
  const newTier = getTierForPoints(newBalance, config.tiers);
  const newExpiry = addMonths(new Date(), config.expiryMonths);

  await prisma.$transaction([
    prisma.transaction.create({
      data: { customerId, type: "earn", points: pointsToAward, description },
    }),
    prisma.customer.update({
      where: { id: customerId },
      data: { pointsBalance: newBalance, tier: newTier.name, pointsExpiresAt: newExpiry },
    }),
  ]);
}
