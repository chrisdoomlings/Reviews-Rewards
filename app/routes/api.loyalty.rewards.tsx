/**
 * GET /api/loyalty/rewards?shop=
 *
 * Public endpoint for the storefront loyalty widget.
 * Returns the active rewards catalog for a given shop.
 */

import type { LoaderFunctionArgs } from "react-router";
import { getRewards } from "../loyalty.server";
import { corsJson, corsPreflight } from "../cors.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight();

  const shop = new URL(request.url).searchParams.get("shop") ?? "";

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
