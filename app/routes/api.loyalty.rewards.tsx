/**
 * GET /api/loyalty/rewards?shop=
 *
 * Public endpoint for the storefront loyalty widget.
 * Returns the active rewards catalog for a given shop.
 */

import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { getRewards } from "../loyalty.server";
import { corsJson, corsPreflight } from "../cors.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight();

  const url = new URL(request.url);
  let shop = url.searchParams.get("shop") ?? "";
  const customerId = url.searchParams.get("customerId") ?? "";

  // Fallback: derive shop from the customer record (used by customer-account UI
  // extensions, which cannot read the shop domain from their target API).
  if (!shop && customerId) {
    const customer = await prisma.customer.findUnique({
      where: { shopifyCustomerId: customerId },
      select: { shop: true },
    });
    if (customer) shop = customer.shop;
  }

  if (!shop) {
    return corsJson({ error: "Missing shop parameter" }, { status: 400 });
  }

  const all = await getRewards(shop);
  const rewards = all.filter((r) => r.isActive);

  return corsJson(
    { rewards },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
};
