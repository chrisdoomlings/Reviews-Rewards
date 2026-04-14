/**
 * Loyalty points engine — core business logic.
 *
 * TIER CONFIG: placeholder values below. Update with real "Ends with Benefits"
 * thresholds, earning rates, and tier names from Eric before launch (Milestone 1 blocker).
 */

import prisma from "./db.server";

// ─── Tier configuration ───────────────────────────────────────────────────────
// TODO: Replace with confirmed "Ends with Benefits" values from Eric.

export interface TierConfig {
  name: string;
  minPoints: number;      // lifetime points threshold to reach this tier
  earnMultiplier: number; // multiplier applied to base earn rate
}

export const TIERS: TierConfig[] = [
  { name: "bronze", minPoints: 0,    earnMultiplier: 1.0 },
  { name: "silver", minPoints: 500,  earnMultiplier: 1.5 },
  { name: "gold",   minPoints: 1500, earnMultiplier: 2.0 },
];

// Base earn rate: points per dollar spent. TODO: confirm with Eric.
const BASE_POINTS_PER_DOLLAR = 1;

// Points expiry window in months.
const EXPIRY_MONTHS = 12;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getTierForPoints(lifetimePoints: number): TierConfig {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (lifetimePoints >= TIERS[i].minPoints) return TIERS[i];
  }
  return TIERS[0];
}

export function getNextTier(currentTierName: string): TierConfig | null {
  const idx = TIERS.findIndex((t) => t.name === currentTierName);
  return idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ─── Award points for a paid order ───────────────────────────────────────────

export interface AwardPointsInput {
  shop: string;
  shopifyOrderId: string;  // numeric Shopify order ID as string
  shopifyCustomerId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  orderTotalUsd: number;   // parsed from order total_price
}

export interface AwardPointsResult {
  pointsAwarded: number;
  newBalance: number;
  tier: string;
  alreadyProcessed: boolean;
}

export async function awardPointsForOrder(
  input: AwardPointsInput,
): Promise<AwardPointsResult> {
  const { shop, shopifyOrderId, shopifyCustomerId, email, firstName, lastName, orderTotalUsd } = input;

  // Idempotency: skip if this order was already processed.
  const existing = await prisma.transaction.findFirst({
    where: { orderId: shopifyOrderId },
  });
  if (existing) {
    const customer = await prisma.customer.findUnique({
      where: { shopifyCustomerId },
    });
    return {
      pointsAwarded: 0,
      newBalance: customer?.pointsBalance ?? 0,
      tier: customer?.tier ?? TIERS[0].name,
      alreadyProcessed: true,
    };
  }

  // Upsert customer — they may not have logged in yet.
  const customer = await prisma.customer.upsert({
    where: { shopifyCustomerId },
    create: {
      shopifyCustomerId,
      shop,
      email,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      pointsBalance: 0,
      tier: TIERS[0].name,
    },
    update: {
      email,
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
    },
  });

  const currentTier = getTierForPoints(customer.pointsBalance);
  const pointsToAward = Math.floor(
    orderTotalUsd * BASE_POINTS_PER_DOLLAR * currentTier.earnMultiplier,
  );

  const newBalance = customer.pointsBalance + pointsToAward;
  const newTier = getTierForPoints(newBalance);
  const newExpiry = addMonths(new Date(), EXPIRY_MONTHS);

  // Write transaction + update customer in one transaction.
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

// ─── Get customer loyalty state ───────────────────────────────────────────────

export interface CustomerLoyaltyState {
  found: boolean;
  customerId: string | null;
  pointsBalance: number;
  tier: string;
  tierMultiplier: number;
  nextTier: string | null;
  pointsToNextTier: number | null;
  pointsExpiresAt: string | null;  // ISO string
  recentTransactions: {
    type: string;
    points: number;
    description: string | null;
    createdAt: string;
  }[];
}

export async function getCustomerLoyalty(
  shopifyCustomerId: string,
): Promise<CustomerLoyaltyState> {
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
      tier: TIERS[0].name,
      tierMultiplier: TIERS[0].earnMultiplier,
      nextTier: TIERS[1]?.name ?? null,
      pointsToNextTier: TIERS[1]?.minPoints ?? null,
      pointsExpiresAt: null,
      recentTransactions: [],
    };
  }

  const currentTierConfig = getTierForPoints(customer.pointsBalance);
  const next = getNextTier(currentTierConfig.name);

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

// ─── Expire stale points (called by a scheduled job) ─────────────────────────

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
