/**
 * POST /api/loyalty/redeem
 *
 * Public endpoint called by the storefront loyalty widget when a customer
 * redeems points for a reward.
 *
 * Flow:
 *  1. Validate customer + reward + balance
 *  2. Create Shopify discount code via Admin GraphQL API
 *  3. Deduct points + record Redemption in a single DB transaction
 *  4. Return the discount code to the widget
 *
 * Body: { shop, shopifyCustomerId, rewardId }
 */

import { randomBytes } from "crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { reserveRedemption, finalizeRedemption, cancelRedemption } from "../loyalty.server";
import { corsJson, corsPreflight, CORS_HEADERS } from "../cors.server";

export const loader = ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight();
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
};

// ─── Shopify discount creation ────────────────────────────────────────────────

const CREATE_DISCOUNT_MUTATION = `
  mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
      }
      userErrors {
        field
        code
        message
      }
    }
  }
`;

async function createShopifyDiscountCode(
  shop: string,
  accessToken: string,
  reward: { name: string; type: string; value: string },
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  // Build the discount value based on reward type
  let customerGetsValue: Record<string, unknown>;

  if (reward.type === "discount_pct") {
    const pct = parseFloat(reward.value);
    if (isNaN(pct) || pct <= 0 || pct > 100) return { ok: false, error: "Invalid discount %" };
    customerGetsValue = { percentage: pct / 100 };
  } else if (reward.type === "discount_fixed") {
    const amt = parseFloat(reward.value);
    if (isNaN(amt) || amt <= 0) return { ok: false, error: "Invalid discount amount" };
    customerGetsValue = {
      discountAmount: { amount: amt.toFixed(2), appliesOnEachItem: false },
    };
  } else {
    // free_product and other types not yet supported
    return { ok: false, error: `Reward type '${reward.type}' cannot be auto-generated` };
  }

  const variables = {
    basicCodeDiscount: {
      title: `Loyalty Reward: ${reward.name}`,
      code,
      startsAt: new Date().toISOString(),
      usageLimit: 1,
      appliesOncePerCustomer: true,
      customerGets: {
        value: customerGetsValue,
        items: { allItems: true },
      },
      customerSelection: { all: true },
    },
  };

  const resp = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query: CREATE_DISCOUNT_MUTATION, variables }),
  });

  if (!resp.ok) {
    return { ok: false, error: `Shopify API error ${resp.status}` };
  }

  const json = (await resp.json()) as {
    data?: {
      discountCodeBasicCreate?: {
        codeDiscountNode?: { id: string } | null;
        userErrors?: { message: string }[];
      };
    };
    errors?: { message: string }[];
  };

  const userErrors = json.data?.discountCodeBasicCreate?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e) => e.message).join("; ") };
  }
  if (json.errors?.length) {
    return { ok: false, error: json.errors.map((e) => e.message).join("; ") };
  }

  return { ok: true };
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return corsJson({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return corsJson({ error: "Invalid request body" }, { status: 400 });
  }

  const { shop: bodyShop, shopifyCustomerId, rewardId } = body as {
    shop?: string;
    shopifyCustomerId: string;
    rewardId: string;
  };

  if (!shopifyCustomerId || !rewardId) {
    return corsJson({ error: "shopifyCustomerId and rewardId are required" }, { status: 400 });
  }

  let shop = bodyShop ?? "";
  if (!shop) {
    const customer = await prisma.customer.findUnique({
      where: { shopifyCustomerId },
      select: { shop: true },
    });
    if (customer) shop = customer.shop;
  }
  if (!shop) {
    return corsJson({ error: "Could not resolve shop for customer" }, { status: 400 });
  }

  // Get the shop's offline access token
  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    orderBy: { expires: "desc" },
    select: { accessToken: true },
  });
  if (!session?.accessToken) {
    return corsJson({ error: "Shop not connected" }, { status: 503 });
  }

  // Phase 1: atomically reserve points + create pending redemption.
  const reserved = await reserveRedemption(shop, shopifyCustomerId, rewardId);
  if (!reserved.success) {
    return corsJson({ error: reserved.error }, { status: 400 });
  }
  const { redemptionId, reward, newBalance } = reserved.reservation;

  // Phase 2: create the Shopify discount code.
  const code = "DOOM-" + randomBytes(4).toString("hex").toUpperCase();
  const discountResult = await createShopifyDiscountCode(shop, session.accessToken, reward, code);

  if (!discountResult.ok) {
    // Shopify rejected the code — refund the reserved points.
    await cancelRedemption(redemptionId);
    console.error(`[redeem] Shopify discount creation failed: ${discountResult.error}`);
    return corsJson(
      { error: "Could not generate discount code. Please try again." },
      { status: 502 },
    );
  }

  // Phase 3: mark the redemption fulfilled and attach the code.
  await finalizeRedemption(redemptionId, code);

  return corsJson({
    discountCode: code,
    pointsSpent: reserved.reservation.pointsSpent,
    newBalance,
  });
}
