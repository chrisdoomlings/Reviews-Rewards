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
import { corsJson, corsPreflight } from "../cors.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight();

  const { shopifyCustomerId } = params;

  if (!shopifyCustomerId) {
    return corsJson({ error: "Missing customer ID" }, { status: 400 });
  }

  // Basic sanitization — customer IDs are numeric strings from Shopify.
  if (!/^\d+$/.test(shopifyCustomerId)) {
    return corsJson({ error: "Invalid customer ID" }, { status: 400 });
  }

  const loyalty = await getCustomerLoyalty(shopifyCustomerId);

  return corsJson(loyalty, {
    // Storefront widget caches for 30 s; CDN may cache up to 60 s.
    headers: { "Cache-Control": "private, max-age=30" },
  });
};
