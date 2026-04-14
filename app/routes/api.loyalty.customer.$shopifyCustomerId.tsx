/**
 * GET /api/loyalty/customer/:shopifyCustomerId?shop=mystore.myshopify.com
 *
 * Public endpoint consumed by the storefront loyalty widget.
 * Returns a customer's points balance, tier, and recent transactions.
 *
 * Authentication: unauthenticated for now (Multipass session auth added in Milestone 2).
 * Rate limiting should be added at the CDN/edge layer before production.
 */

import type { LoaderFunctionArgs } from "react-router";
import { getCustomerLoyalty } from "../loyalty.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { shopifyCustomerId } = params;

  if (!shopifyCustomerId) {
    return Response.json({ error: "Missing customer ID" }, { status: 400 });
  }

  // Basic sanitization — customer IDs are numeric strings from Shopify.
  if (!/^\d+$/.test(shopifyCustomerId)) {
    return Response.json({ error: "Invalid customer ID" }, { status: 400 });
  }

  const loyalty = await getCustomerLoyalty(shopifyCustomerId);

  return Response.json(loyalty, {
    headers: {
      // Storefront widget caches for 30 s; CDN may cache up to 60 s.
      "Cache-Control": "private, max-age=30",
    },
  });
};
